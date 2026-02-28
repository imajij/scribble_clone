// ========================================
// COUPLE MODE — Game Logic
// ========================================
// 6 mini-games cycle in shuffled order:
//   wml       → Who's More Likely To
//   draw      → Draw Your Partner From Memory
//   rfgf      → Red Flag or Green Flag
//   fts       → Finish The Sentence
//   tos       → Truth or Skip
//   telepathy → Couple Telepathy
//
// State machine per mini-game is driven by coupleGame methods.

const {
  WML_QUESTIONS,
  RFGF_SCENARIOS,
  FTS_TEMPLATES,
  TOS_QUESTIONS,
  TELEPATHY_QUESTIONS,
  CAPTION_LABELS,
  ROASTS,
} = require('./prompts');

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pick(arr, used) {
  const remaining = arr.filter(x => !used.has(x));
  const pool = remaining.length > 0 ? remaining : arr;
  const item = pool[Math.floor(Math.random() * pool.length)];
  used.add(item);
  return item;
}

class CoupleGame {
  constructor(roomId) {
    this.roomId = roomId;
    this.players = new Map();      // socketId → player
    this.state = 'waiting';
    this.owner = null;
    this.ownerSessionId = null;
    this.disconnectedPlayers = new Map();

    // Mini-game cycling
    this.miniGames = [];           // shuffled sequence for this match
    this.miniGameIndex = -1;       // current position in sequence
    this.currentMiniGame = null;   // 'wml' | 'draw' | 'rfgf' | 'fts' | 'tos' | 'telepathy'
    this.totalRounds = 6;          // one of each mini-game per game

    // Per-round state (reset each round)
    this.votes = new Map();        // generic vote map
    this.submissions = new Map();  // generic text submissions
    this.turnQueue = [];           // for turn-based mini-games (tos, draw)
    this.turnIndex = 0;

    // Drawing
    this.drawTarget = null;        // { drawerId, targetName }
    this.drawCaption = null;       // winning caption after guess phase

    // Chaos
    this.chaosScore = 0;

    // Per-player stats for title assignment
    this.playerStats = new Map();  // socketId → { chaosActions, redFlagsReceived, liesDetected, skipCount }

    // Used content tracking
    this._usedWml  = new Set();
    this._usedRfgf = new Set();
    this._usedFts  = new Set();
    this._usedTos  = new Set();
    this._usedTele = new Set();

    // Timers (cleared externally by socket.js)
    this.phaseTimer = null;
    this.revealTimer = null;
  }

  // ── Player management ──

  addPlayer(socketId, name, sessionId) {
    const COLORS = ['#f43f5e','#ec4899','#a855f7','#8b5cf6','#3b82f6','#06b6d4','#10b981','#f59e0b','#ef4444','#84cc16'];
    const avatar = COLORS[this.players.size % COLORS.length];
    const player = { id: socketId, name: name.substring(0, 20), sessionId, score: 0, avatar };
    this.players.set(socketId, player);
    if (this.players.size === 1) { this.owner = socketId; this.ownerSessionId = sessionId; }
    this.playerStats.set(socketId, { chaosActions: 0, redFlagsReceived: 0, liesDetected: 0, skipCount: 0 });
    return player;
  }

  removePlayer(socketId) {
    const p = this.players.get(socketId);
    if (!p) return null;
    this.players.delete(socketId);
    this.votes.delete(socketId);
    this.submissions.delete(socketId);
    if (this.owner === socketId && this.players.size > 0) {
      const next = this.players.keys().next().value;
      this.owner = next;
      this.ownerSessionId = this.players.get(next).sessionId;
    }
    return p;
  }

  holdPlayerForReconnect(socketId) {
    const p = this.players.get(socketId);
    if (!p) return null;
    this.disconnectedPlayers.set(p.sessionId, {
      name: p.name, score: p.score, avatar: p.avatar,
      stats: this.playerStats.get(socketId) || {},
    });
    this.players.delete(socketId);
    this.votes.delete(socketId);
    this.submissions.delete(socketId);
    return p;
  }

  hasDisconnectedPlayer(sessionId) { return this.disconnectedPlayers.has(sessionId); }

  reconnectPlayer(newSocketId, sessionId) {
    const held = this.disconnectedPlayers.get(sessionId);
    if (!held) return null;
    this.disconnectedPlayers.delete(sessionId);
    const player = { id: newSocketId, name: held.name, sessionId, score: held.score, avatar: held.avatar };
    this.players.set(newSocketId, player);
    this.playerStats.set(newSocketId, held.stats || {});
    if (this.ownerSessionId === sessionId) this.owner = newSocketId;
    return player;
  }

  isOwner(socketId) { return this.owner === socketId; }
  canStart()        { return this.state === 'waiting' && this.players.size >= 2; }

  getPlayerList() {
    const list = [];
    this.players.forEach(p => list.push({ id: p.id, name: p.name, score: p.score, avatar: p.avatar, isOwner: p.id === this.owner }));
    return list.sort((a, b) => b.score - a.score);
  }

  // ── Game flow ──

  startGame() {
    this.state = 'playing';
    this.chaosScore = 0;
    this.miniGames = shuffle(['wml', 'draw', 'rfgf', 'fts', 'tos', 'telepathy']);
    this.miniGameIndex = -1;
    this.players.forEach(p => {
      p.score = 0;
      this.playerStats.set(p.id, { chaosActions: 0, redFlagsReceived: 0, liesDetected: 0, skipCount: 0 });
    });
  }

  nextMiniGame() {
    this.miniGameIndex++;
    if (this.miniGameIndex >= this.miniGames.length) return null;
    this.currentMiniGame = this.miniGames[this.miniGameIndex];
    this._resetRoundState();
    return this.currentMiniGame;
  }

  _resetRoundState() {
    this.votes.clear();
    this.submissions.clear();
    this.turnQueue = [...this.players.keys()];
    this.turnIndex = 0;
  }

  // ── WML: Who's More Likely To ──

  startWml() {
    this.state = 'wml_voting';
    this.votes.clear();
    this.currentContent = pick(WML_QUESTIONS, this._usedWml);
    return this.currentContent;
  }

  castWmlVote(socketId, targetId) {
    if (this.state !== 'wml_voting') return false;
    if (!this.players.has(socketId) || !this.players.has(targetId)) return false;
    if (this.votes.has(socketId)) return false;
    this.votes.set(socketId, targetId);
    return true;
  }

  endWml() {
    this.state = 'wml_reveal';
    const counts = {};
    this.players.forEach(p => { counts[p.id] = 0; });
    this.votes.forEach((targetId) => { if (counts[targetId] !== undefined) counts[targetId]++; });

    let maxVotes = 0;
    let winner = null;
    Object.entries(counts).forEach(([id, c]) => { if (c > maxVotes) { maxVotes = c; winner = id; } });

    // Check tie (chaos trigger)
    const topCount = Object.values(counts).filter(c => c === maxVotes).length;
    const isTie = topCount > 1;
    if (isTie) this._bumpChaos(15);

    // Award points: winner gets +80, voters who picked winner get +50
    if (winner) {
      const p = this.players.get(winner);
      if (p) p.score += 80;
    }
    this.votes.forEach((targetId, voterId) => {
      if (targetId === winner) {
        const voter = this.players.get(voterId);
        if (voter) voter.score += 50;
      }
    });

    const playerNames = {};
    this.players.forEach(p => { playerNames[p.id] = p.name; });

    return { counts, winner, winnerName: winner ? playerNames[winner] : null, isTie, question: this.currentContent, playerNames };
  }

  // ── RFGF: Red Flag or Green Flag ──

  startRfgf() {
    this.state = 'rfgf_voting';
    this.votes.clear();
    this.currentContent = pick(RFGF_SCENARIOS, this._usedRfgf);
    return this.currentContent;
  }

  castRfgfVote(socketId, flag) {
    if (this.state !== 'rfgf_voting') return false;
    if (!this.players.has(socketId)) return false;
    if (flag !== 'red' && flag !== 'green') return false;
    if (this.votes.has(socketId)) return false;
    this.votes.set(socketId, flag);
    return true;
  }

  endRfgf() {
    this.state = 'rfgf_reveal';
    let red = 0, green = 0;
    this.votes.forEach(v => { v === 'red' ? red++ : green++; });
    const total = red + green;
    const majority = red > green ? 'red' : green > red ? 'green' : 'tie';

    // Award +60 for voting with majority, +30 for minority
    this.votes.forEach((v, playerId) => {
      const p = this.players.get(playerId);
      if (!p) return;
      if (majority === 'tie') { p.score += 40; }
      else if (v === majority) { p.score += 60; }
      else { p.score += 30; }
    });

    // Chaos if 80%+ red
    if (total > 0 && red / total >= 0.8) this._bumpChaos(20);

    return { red, green, total, majority, scenario: this.currentContent };
  }

  allVoted() {
    return this.votes.size >= this.players.size;
  }

  getVoteProgress() {
    return { voted: this.votes.size, total: this.players.size };
  }

  // ── FTS: Finish The Sentence ──

  startFts() {
    this.state = 'fts_submitting';
    this.submissions.clear();
    this.currentContent = pick(FTS_TEMPLATES, this._usedFts);
    return this.currentContent;
  }

  submitFts(socketId, text) {
    if (this.state !== 'fts_submitting') return false;
    if (!this.players.has(socketId)) return false;
    if (this.submissions.has(socketId)) return false;
    const clean = (text || '').trim().substring(0, 200);
    if (!clean) return false;
    this.submissions.set(socketId, clean);
    // Participation points
    const p = this.players.get(socketId);
    if (p) p.score += 20;
    return true;
  }

  allSubmitted() {
    return this.submissions.size >= this.players.size;
  }

  getSubmitProgress() {
    return { submitted: this.submissions.size, total: this.players.size };
  }

  getFtsReveal() {
    this.state = 'fts_reveal';
    const entries = [];
    this.submissions.forEach((text, socketId) => {
      const p = this.players.get(socketId);
      entries.push({ name: p ? p.name : '?', text });
    });
    // Shuffle
    for (let i = entries.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [entries[i], entries[j]] = [entries[j], entries[i]];
    }
    if (entries.length > 0) this._bumpChaos(10);
    return { template: this.currentContent, entries };
  }

  // ── TOS: Truth or Skip ──

  startTos() {
    this.state = 'tos_answering';
    this.submissions.clear();
    this.turnQueue = shuffle([...this.players.keys()]);
    this.turnIndex = 0;
    this.currentContent = pick(TOS_QUESTIONS, this._usedTos);
    return {
      question: this.currentContent,
      currentPlayerId: this.turnQueue[0],
      currentPlayerName: this.players.get(this.turnQueue[0])?.name,
      total: this.turnQueue.length,
    };
  }

  submitTosAnswer(socketId, text) {
    if (this.state !== 'tos_answering') return false;
    if (socketId !== this.turnQueue[this.turnIndex]) return false;
    if (this.submissions.has(socketId)) return false;
    const clean = (text || '').trim().substring(0, 300);
    const p = this.players.get(socketId);
    if (clean) {
      this.submissions.set(socketId, clean);
      if (p) p.score += 80;
      return { answered: true };
    }
    return false;
  }

  skipTos(socketId) {
    if (socketId !== this.turnQueue[this.turnIndex]) return false;
    const p = this.players.get(socketId);
    if (p) {
      p.score = Math.max(0, p.score - 20);
      const st = this.playerStats.get(socketId);
      if (st) st.skipCount++;
    }
    this.submissions.set(socketId, null); // mark as skipped
    this._bumpChaos(10);
    return true;
  }

  advanceTos() {
    this.turnIndex++;
    if (this.turnIndex >= this.turnQueue.length) {
      this.state = 'tos_reveal';
      return null;
    }
    this.currentContent = pick(TOS_QUESTIONS, this._usedTos);
    return {
      question: this.currentContent,
      currentPlayerId: this.turnQueue[this.turnIndex],
      currentPlayerName: this.players.get(this.turnQueue[this.turnIndex])?.name,
      turnIndex: this.turnIndex,
      total: this.turnQueue.length,
    };
  }

  getTosReveal() {
    const entries = [];
    this.turnQueue.forEach(id => {
      const text = this.submissions.get(id);
      const p = this.players.get(id);
      entries.push({ name: p ? p.name : '?', text: text || '[SKIPPED 😬]', skipped: text === null });
    });
    return entries;
  }

  // ── TELEPATHY: Couple Telepathy ──

  startTelepathy() {
    this.state = 'telepathy_answering';
    this.submissions.clear();
    this.currentContent = pick(TELEPATHY_QUESTIONS, this._usedTele);
    return this.currentContent;
  }

  submitTelepathyAnswer(socketId, text) {
    if (this.state !== 'telepathy_answering') return false;
    if (!this.players.has(socketId)) return false;
    if (this.submissions.has(socketId)) return false;
    const clean = (text || '').trim().toLowerCase().substring(0, 100);
    if (!clean) return false;
    this.submissions.set(socketId, clean);
    return true;
  }

  endTelepathy() {
    this.state = 'telepathy_reveal';

    // Find majority answer
    const freq = {};
    this.submissions.forEach(ans => { freq[ans] = (freq[ans] || 0) + 1; });
    let majority = null, maxF = 0;
    Object.entries(freq).forEach(([ans, c]) => { if (c > maxF) { maxF = c; majority = ans; } });

    const entries = [];
    let matchCount = 0;
    this.submissions.forEach((ans, socketId) => {
      const p = this.players.get(socketId);
      const matched = ans === majority;
      if (matched) { matchCount++; if (p) p.score += 100; }
      entries.push({ id: socketId, name: p ? p.name : '?', answer: ans, matched });
    });

    if (matchCount === 0) this._bumpChaos(25); // total mismatch → chaos
    else if (matchCount === this.players.size) this._bumpChaos(5); // full match → small bump

    return { question: this.currentContent, entries, majority, matchCount };
  }

  // ── DRAW: Draw Your Partner From Memory ──

  startDraw() {
    this.state = 'draw_drawing';
    this.votes.clear();
    const allIds = [...this.players.keys()];
    const drawerIdx = this.turnIndex % allIds.length;
    const drawerId = allIds[drawerIdx];
    // Target: random other player name
    const others = allIds.filter(id => id !== drawerId);
    const targetId = others[Math.floor(Math.random() * others.length)] || drawerId;
    const targetP = this.players.get(targetId);
    this.drawTarget = { drawerId, targetId, targetName: targetP ? targetP.name : 'your partner' };
    this.turnIndex++;
    return this.drawTarget;
  }

  submitDrawCaption(socketId, caption) {
    if (this.state !== 'draw_guessing') return false;
    if (!this.players.has(socketId)) return false;
    if (this.votes.has(socketId)) return false;
    if (!CAPTION_LABELS.includes(caption)) return false;
    this.votes.set(socketId, caption);
    return true;
  }

  endDrawGuessing() {
    this.state = 'draw_reveal';
    const counts = {};
    CAPTION_LABELS.forEach(l => { counts[l] = 0; });
    this.votes.forEach(cap => { if (counts[cap] !== undefined) counts[cap]++; });

    let topCap = null, topCount = 0;
    Object.entries(counts).forEach(([cap, c]) => { if (c > topCount) { topCount = c; topCap = cap; } });

    const roast = ROASTS[topCap] || 'That drawing was... something.';
    this.drawCaption = topCap;

    // Points: drawer gets +60 if someone guesses anything (participation)
    const drawer = this.players.get(this.drawTarget?.drawerId);
    if (drawer && this.votes.size > 0) drawer.score += 60;

    // Chaos: unanimous "Gremlin"
    if (topCap === 'Full Gremlin Mode' && topCount === this.votes.size && this.votes.size > 0) {
      this._bumpChaos(20);
    }

    return { winningCaption: topCap, counts, roast, target: this.drawTarget };
  }

  // ── Chaos ──

  _bumpChaos(amount) {
    this.chaosScore = Math.min(100, this.chaosScore + amount);
    // Increment chaosActions for the current player (if turn-based) or all (if voting)
    if (this.turnQueue && this.turnQueue[this.turnIndex - 1]) {
      const st = this.playerStats.get(this.turnQueue[this.turnIndex - 1]);
      if (st) st.chaosActions++;
    }
  }

  // ── End Game ──

  getFinalResults() {
    const players = this.getPlayerList();
    const stats = this.playerStats;
    return { players, stats: Object.fromEntries([...stats.entries()]), chaosScore: this.chaosScore };
  }

  cleanup() {
    clearTimeout(this.phaseTimer);
    clearTimeout(this.revealTimer);
    this.phaseTimer = null;
    this.revealTimer = null;
  }

  reset() {
    this.cleanup();
    this.state = 'waiting';
    this.miniGameIndex = -1;
    this.currentMiniGame = null;
    this.chaosScore = 0;
    this.votes.clear();
    this.submissions.clear();
    this.players.forEach(p => { p.score = 0; });
  }
}

module.exports = CoupleGame;
