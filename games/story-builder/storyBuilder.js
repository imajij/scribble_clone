// ========================================
// STORY BUILDER — Game Engine Module
// ========================================
//
// In-memory room state. No database.
// State machine: waiting → writing → (loop through players) → gameOver
//
// Each turn:
//   1. Current writer is highlighted, timer starts.
//   2. Writer submits a sentence (max 280 chars).
//   3. Sentence is appended to the story array.
//   4. Turn advances to the next player.
//   5. After all rounds complete → gameOver.

const MAX_SENTENCE_LENGTH = 280;

class StoryBuilderGame {
  constructor(roomId) {
    this.roomId = roomId;

    // Players: socketId → { name, avatar, sessionId, connected, sentenceCount }
    this.players = new Map();
    this.state = 'waiting'; // waiting | writing | gameOver
    this.owner = null;
    this.ownerSessionId = null;

    // Turn
    this.turnOrder = [];
    this.turnIndex = -1;
    this.roundNum = 0;
    this.maxRounds = 3;           // full rotations through all players
    this.turnsThisRound = 0;
    this.currentWriter = null;    // socketId of the current writer

    // Timer
    this.turnDuration = 45;       // seconds per turn
    this.turnTimer = null;

    // Story
    this.story = [];              // [{ sentence, playerName, playerId, avatar, timestamp }]

    // Optional prompt/theme
    this.prompt = '';

    // Reconnect
    this.disconnectedPlayers = new Map(); // sessionId → held data
  }

  // ─── Player management ───────────────────────────────

  addPlayer(socketId, name, sessionId) {
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
      '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
      '#F0B27A', '#82E0AA', '#F1948A', '#AED6F1', '#D7BDE2'
    ];
    const color = colors[this.players.size % colors.length];

    if (!this.owner || !this.players.has(this.owner)) {
      this.owner = socketId;
      this.ownerSessionId = sessionId || null;
    }

    this.players.set(socketId, {
      name,
      avatar: color,
      sessionId: sessionId || null,
      connected: true,
      sentenceCount: 0
    });

    return this.players.get(socketId);
  }

  removePlayer(socketId) {
    this.players.delete(socketId);
    this.turnOrder = this.turnOrder.filter(id => id !== socketId);

    if (this.owner === socketId) {
      const remaining = [...this.players.keys()];
      this.owner = remaining.length > 0 ? remaining[0] : null;
      if (this.owner) {
        this.ownerSessionId = this.players.get(this.owner).sessionId;
      } else {
        this.ownerSessionId = null;
      }
    }
  }

  holdPlayerSeat(socketId) {
    const player = this.players.get(socketId);
    if (!player || !player.sessionId) return;
    this.disconnectedPlayers.set(player.sessionId, {
      name: player.name,
      avatar: player.avatar,
      sessionId: player.sessionId,
      sentenceCount: player.sentenceCount
    });
  }

  reconnectPlayer(newSocketId, sessionId) {
    const held = this.disconnectedPlayers.get(sessionId);
    if (!held) return null;
    this.disconnectedPlayers.delete(sessionId);

    this.players.set(newSocketId, {
      name: held.name,
      avatar: held.avatar,
      sessionId: held.sessionId,
      connected: true,
      sentenceCount: held.sentenceCount
    });

    // Fix turn order
    const idx = this.turnOrder.indexOf(sessionId);
    if (idx !== -1) this.turnOrder[idx] = newSocketId;
    else this.turnOrder.push(newSocketId);

    if (this.currentWriter === sessionId) this.currentWriter = newSocketId;

    // Restore owner
    if (this.ownerSessionId === sessionId) this.owner = newSocketId;

    return held;
  }

  hasDisconnectedPlayer(sessionId) {
    return this.disconnectedPlayers.has(sessionId);
  }

  isOwner(socketId) {
    return this.owner === socketId;
  }

  canStart() {
    return this.players.size >= 2 && this.state === 'waiting';
  }

  getPlayerList() {
    const list = [];
    this.players.forEach((p, id) => {
      list.push({
        id,
        name: p.name,
        avatar: p.avatar,
        isOwner: id === this.owner,
        isWriter: id === this.currentWriter,
        sentenceCount: p.sentenceCount,
        disconnected: false
      });
    });
    this.disconnectedPlayers.forEach((held, sid) => {
      list.push({
        id: sid,
        name: held.name,
        avatar: held.avatar,
        isOwner: false,
        isWriter: false,
        sentenceCount: held.sentenceCount,
        disconnected: true
      });
    });
    return list;
  }

  // ─── Game flow ───────────────────────────────────────

  startGame() {
    this.state = 'writing';
    this.roundNum = 0;
    this.turnsThisRound = 0;
    this.turnIndex = -1;
    this.story = [];
    this.players.forEach(p => { p.sentenceCount = 0; });
    this.turnOrder = [...this.players.keys()];
    // Shuffle turn order
    for (let i = this.turnOrder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.turnOrder[i], this.turnOrder[j]] = [this.turnOrder[j], this.turnOrder[i]];
    }
    return this.nextTurn();
  }

  nextTurn() {
    this.turnIndex++;

    // Check if we completed a full rotation
    if (this.turnIndex >= this.turnOrder.length) {
      this.turnIndex = 0;
      this.roundNum++;
      if (this.roundNum >= this.maxRounds) {
        this.state = 'gameOver';
        return {
          event: 'gameOver',
          story: this.story,
          players: this.getPlayerList()
        };
      }
    }

    this.currentWriter = this.turnOrder[this.turnIndex];

    // Skip disconnected players
    if (!this.players.has(this.currentWriter)) {
      if (this.turnOrder.every(id => !this.players.has(id))) return null;
      return this.nextTurn();
    }

    this.state = 'writing';
    const writer = this.players.get(this.currentWriter);

    return {
      event: 'newTurn',
      writer: this.currentWriter,
      writerName: writer.name,
      writerAvatar: writer.avatar,
      roundNum: this.roundNum + 1,
      maxRounds: this.maxRounds,
      turnDuration: this.turnDuration,
      storyLength: this.story.length
    };
  }

  /**
   * Submit a sentence for the current turn.
   * Returns the result or null if invalid.
   */
  submitSentence(socketId, sentence) {
    if (this.state !== 'writing') return null;
    if (socketId !== this.currentWriter) return null;

    // Validate
    const trimmed = String(sentence).trim();
    if (trimmed.length === 0) return null;
    if (trimmed.length > MAX_SENTENCE_LENGTH) return null;

    const writer = this.players.get(this.currentWriter);
    if (!writer) return null;

    writer.sentenceCount++;

    const entry = {
      sentence: trimmed,
      playerName: writer.name,
      playerId: this.currentWriter,
      avatar: writer.avatar,
      index: this.story.length,
      timestamp: Date.now()
    };
    this.story.push(entry);

    return {
      event: 'sentenceAdded',
      entry,
      storyLength: this.story.length,
      writerName: writer.name
    };
  }

  /**
   * Auto-skip when timer expires (adds a "(skipped)" marker).
   */
  skipTurn() {
    const writer = this.players.get(this.currentWriter);
    const entry = {
      sentence: null,
      playerName: writer ? writer.name : 'Unknown',
      playerId: this.currentWriter,
      avatar: writer ? writer.avatar : '#999',
      index: this.story.length,
      skipped: true,
      timestamp: Date.now()
    };
    this.story.push(entry);

    return {
      event: 'turnSkipped',
      entry,
      storyLength: this.story.length,
      writerName: writer ? writer.name : 'Unknown'
    };
  }

  getStory() {
    return this.story;
  }

  getFullText() {
    return this.story
      .filter(e => e.sentence)
      .map(e => e.sentence)
      .join(' ');
  }

  // ─── Config ──────────────────────────────────────────

  setTurnDuration(seconds) {
    const s = Math.min(Math.max(parseInt(seconds) || 45, 15), 120);
    this.turnDuration = s;
  }

  setMaxRounds(rounds) {
    this.maxRounds = Math.min(Math.max(parseInt(rounds) || 3, 1), 10);
  }

  setPrompt(prompt) {
    this.prompt = String(prompt || '').trim().slice(0, 200);
  }

  // ─── Utilities ───────────────────────────────────────

  clearTimers() {
    if (this.turnTimer) { clearTimeout(this.turnTimer); this.turnTimer = null; }
  }
}

StoryBuilderGame.MAX_SENTENCE_LENGTH = MAX_SENTENCE_LENGTH;

module.exports = StoryBuilderGame;
