const { getRandomWords, VALID_PACKS, DEFAULT_PACK } = require('./words');

class Game {
  constructor(roomId, wordPack) {
    this.roomId = roomId;
    this.wordPack = VALID_PACKS.includes(wordPack) ? wordPack : DEFAULT_PACK;
    this.players = new Map();       // socketId -> { name, score, avatar, sessionId }
    this.state = 'waiting';         // waiting | choosing | drawing | roundEnd | gameOver
    this.owner = null;              // socketId of room creator
    this.ownerSessionId = null;     // sessionId of room owner (persists across reconnects)
    this.currentDrawer = null;      // socketId
    this.currentWord = null;
    this.wordChoices = [];
    this.roundNum = 0;
    this.maxRounds = 3;
    this.turnOrder = [];
    this.turnIndex = 0;
    this.hints = [];
    this.guessedPlayers = new Set();
    this.turnTimer = null;
    this.chooseTimer = null;
    this.turnDuration = 80;         // seconds
    this.chooseDuration = 15;       // seconds
    this.turnStartTime = null;
    this.drawingData = [];
    this.chatHistory = [];
    this.disconnectedPlayers = new Map(); // sessionId -> { name, score, avatar, socketId, timeout }

    // Custom word mode
    this.customWords = [];           // sanitized custom word list (max 10)
    this.useCustomWords = false;     // whether custom mode is active
  }

  /**
   * Enable custom word mode with a sanitized word list.
   * @param {string[]} words — raw words from the client
   */
  setCustomWords(words) {
    if (!Array.isArray(words)) { this.useCustomWords = false; return; }

    const sanitized = words
      .map(w => (typeof w === 'string' ? w : '').trim().substring(0, 40))
      .filter(w => w.length > 0);

    // Deduplicate (case-insensitive) while preserving original casing
    const seen = new Set();
    const unique = [];
    for (const w of sanitized) {
      const key = w.toLowerCase();
      if (!seen.has(key)) { seen.add(key); unique.push(w); }
    }

    this.customWords = unique.slice(0, 10);
    this.useCustomWords = this.customWords.length > 0;
  }

  /**
   * Return `count` word choices for the current turn.
   * Uses custom words when available; falls back to the selected pack
   * if fewer than `count` custom words remain.
   */
  getWordChoices(count = 3) {
    if (this.useCustomWords && this.customWords.length >= count) {
      const shuffled = [...this.customWords].sort(() => Math.random() - 0.5);
      return shuffled.slice(0, count);
    }
    // Fallback to pack-based selection
    return getRandomWords(count, this.wordPack);
  }

  addPlayer(socketId, name, sessionId) {
    const avatarColors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
      '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
      '#F0B27A', '#82E0AA', '#F1948A', '#AED6F1', '#D7BDE2'];
    const color = avatarColors[this.players.size % avatarColors.length];

    // First player becomes the owner
    if (!this.owner || !this.players.has(this.owner)) {
      this.owner = socketId;
      this.ownerSessionId = sessionId || null;
    }

    this.players.set(socketId, {
      name,
      score: 0,
      avatar: color,
      isDrawing: false,
      sessionId: sessionId || null
    });
    return this.players.get(socketId);
  }

  removePlayer(socketId) {
    this.players.delete(socketId);
    this.guessedPlayers.delete(socketId);
    this.turnOrder = this.turnOrder.filter(id => id !== socketId);

    // Transfer ownership if owner left
    if (this.owner === socketId) {
      const remaining = [...this.players.keys()];
      this.owner = remaining.length > 0 ? remaining[0] : null;
      if (this.owner) {
        const ownerPlayer = this.players.get(this.owner);
        this.ownerSessionId = ownerPlayer ? ownerPlayer.sessionId : null;
      } else {
        this.ownerSessionId = null;
      }
    }
  }

  // Hold a disconnected player's seat (for reconnect)
  holdPlayerSeat(socketId) {
    const player = this.players.get(socketId);
    if (!player || !player.sessionId) return null;

    const held = {
      name: player.name,
      score: player.score,
      avatar: player.avatar,
      sessionId: player.sessionId,
      wasOwner: this.owner === socketId,
      wasDrawer: this.currentDrawer === socketId,
      hadGuessed: this.guessedPlayers.has(socketId)
    };

    this.disconnectedPlayers.set(player.sessionId, held);
    return held;
  }

  // Reconnect: swap old socket ID for new one, restoring all state
  reconnectPlayer(newSocketId, sessionId) {
    const held = this.disconnectedPlayers.get(sessionId);
    if (!held) return null;

    this.disconnectedPlayers.delete(sessionId);

    // Find if old socketId is still in players (shouldn't be, but clean up)
    for (const [oldId, p] of this.players) {
      if (p.sessionId === sessionId) {
        // Swap in turn order
        this.turnOrder = this.turnOrder.map(id => id === oldId ? newSocketId : id);
        if (this.currentDrawer === oldId) this.currentDrawer = newSocketId;
        if (this.owner === oldId) this.owner = newSocketId;
        if (this.guessedPlayers.has(oldId)) {
          this.guessedPlayers.delete(oldId);
          this.guessedPlayers.add(newSocketId);
        }
        this.players.delete(oldId);
        break;
      }
    }

    // Add player back with preserved state
    this.players.set(newSocketId, {
      name: held.name,
      score: held.score,
      avatar: held.avatar,
      isDrawing: this.currentDrawer === newSocketId,
      sessionId: sessionId
    });

    // Restore ownership
    if (held.wasOwner || this.ownerSessionId === sessionId) {
      this.owner = newSocketId;
      this.ownerSessionId = sessionId;
    }

    // Restore guessed status
    if (held.hadGuessed) {
      this.guessedPlayers.add(newSocketId);
    }

    // Add back to turn order if not already there
    if (!this.turnOrder.includes(newSocketId) && this.state !== 'waiting') {
      this.turnOrder.push(newSocketId);
    }

    return held;
  }

  hasDisconnectedPlayer(sessionId) {
    return this.disconnectedPlayers.has(sessionId);
  }

  isOwner(socketId) {
    return this.owner === socketId;
  }

  getRemainingTime() {
    if (!this.turnStartTime || this.state !== 'drawing') return 0;
    const elapsed = (Date.now() - this.turnStartTime) / 1000;
    return Math.max(0, Math.round(this.turnDuration - elapsed));
  }

  getCurrentHint() {
    if (!this.currentWord) return '';
    if (this.state !== 'drawing') return '';
    // Figure out how many hints have been revealed based on time
    const elapsed = (Date.now() - this.turnStartTime) / 1000;
    const ratio = elapsed / this.turnDuration;
    if (ratio > 0.65) return this.getPartialHint(2);
    if (ratio > 0.4) return this.getPartialHint(1);
    return this.getBlankHint(this.currentWord);
  }

  getPlayerList() {
    const list = [];
    this.players.forEach((player, id) => {
      list.push({ id, ...player });
    });
    return list.sort((a, b) => b.score - a.score);
  }

  canStart() {
    return this.players.size >= 2 && this.state === 'waiting';
  }

  startGame() {
    this.roundNum = 0;
    this.turnOrder = [...this.players.keys()];
    this.shuffleTurnOrder();
    this.turnIndex = -1;
    this.players.forEach(p => { p.score = 0; p.isDrawing = false; });
    return this.nextTurn();
  }

  shuffleTurnOrder() {
    for (let i = this.turnOrder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.turnOrder[i], this.turnOrder[j]] = [this.turnOrder[j], this.turnOrder[i]];
    }
  }

  nextTurn() {
    // Clear timers
    this.clearTimers();

    // Reset drawing state
    this.drawingData = [];
    this.guessedPlayers.clear();
    this.currentWord = null;
    this.hints = [];

    // Reset isDrawing for all
    this.players.forEach(p => { p.isDrawing = false; });

    // Advance turn
    this.turnIndex++;

    // Check if round complete
    if (this.turnIndex >= this.turnOrder.length) {
      this.turnIndex = 0;
      this.roundNum++;

      if (this.roundNum >= this.maxRounds) {
        this.state = 'gameOver';
        return { event: 'gameOver', scores: this.getPlayerList() };
      }
    }

    // Set current drawer
    this.currentDrawer = this.turnOrder[this.turnIndex];
    if (!this.players.has(this.currentDrawer)) {
      // Player left, skip
      return this.nextTurn();
    }

    this.players.get(this.currentDrawer).isDrawing = true;
    this.state = 'choosing';
    this.wordChoices = this.getWordChoices(3);

    return {
      event: 'choosing',
      drawer: this.currentDrawer,
      drawerName: this.players.get(this.currentDrawer).name,
      choices: this.wordChoices,
      roundNum: this.roundNum + 1,
      maxRounds: this.maxRounds
    };
  }

  selectWord(word) {
    this.currentWord = word;
    this.state = 'drawing';
    this.turnStartTime = Date.now();
    this.hints = this.generateHints(word);

    return {
      event: 'turnStart',
      drawer: this.currentDrawer,
      drawerName: this.players.get(this.currentDrawer).name,
      wordLength: word.length,
      hint: this.getBlankHint(word),
      duration: this.turnDuration
    };
  }

  generateHints(word) {
    const letters = [];
    for (let i = 0; i < word.length; i++) {
      if (word[i] !== ' ') letters.push(i);
    }
    // Shuffle and pick some to reveal
    letters.sort(() => Math.random() - 0.5);
    const reveals = letters.slice(0, Math.max(1, Math.floor(letters.length * 0.4)));
    return reveals;
  }

  getBlankHint(word) {
    return word.split('').map(c => c === ' ' ? '  ' : '_').join(' ');
  }

  getPartialHint(revealCount) {
    const word = this.currentWord;
    const toReveal = this.hints.slice(0, revealCount);
    return word.split('').map((c, i) => {
      if (c === ' ') return '  ';
      if (toReveal.includes(i)) return c;
      return '_';
    }).join(' ');
  }

  checkGuess(socketId, guess) {
    if (this.state !== 'drawing') return null;
    if (socketId === this.currentDrawer) return null;
    if (this.guessedPlayers.has(socketId)) return null;

    const normalizedGuess = guess.trim().toLowerCase();
    const normalizedWord = this.currentWord.toLowerCase();

    if (normalizedGuess === normalizedWord) {
      this.guessedPlayers.add(socketId);

      // Calculate score based on time
      const elapsed = (Date.now() - this.turnStartTime) / 1000;
      const timeRatio = Math.max(0, 1 - elapsed / this.turnDuration);
      const guessScore = Math.round(100 + 400 * timeRatio);
      const drawerBonus = Math.round(50 + 100 * timeRatio);

      const player = this.players.get(socketId);
      if (player) player.score += guessScore;

      const drawer = this.players.get(this.currentDrawer);
      if (drawer) drawer.score += drawerBonus;

      // Check if everyone guessed
      const activePlayers = [...this.players.keys()].filter(id => id !== this.currentDrawer);
      const allGuessed = activePlayers.every(id => this.guessedPlayers.has(id));

      return {
        correct: true,
        playerName: player ? player.name : 'Unknown',
        score: guessScore,
        allGuessed
      };
    }

    // Check for close guess (within 1-2 chars)
    if (this.isCloseGuess(normalizedGuess, normalizedWord)) {
      return { correct: false, close: true };
    }

    return { correct: false, close: false };
  }

  isCloseGuess(guess, word) {
    if (Math.abs(guess.length - word.length) > 2) return false;
    let diff = 0;
    const maxLen = Math.max(guess.length, word.length);
    for (let i = 0; i < maxLen; i++) {
      if (guess[i] !== word[i]) diff++;
      if (diff > 2) return false;
    }
    return diff > 0 && diff <= 2;
  }

  clearTimers() {
    if (this.turnTimer) { clearTimeout(this.turnTimer); this.turnTimer = null; }
    if (this.chooseTimer) { clearTimeout(this.chooseTimer); this.chooseTimer = null; }
  }
}

module.exports = Game;
