// ============================================================
// BACHELOR MODE — Game State Machine
// ============================================================
const { SUS_PROMPTS, CAPTION_SCENARIOS, EXCUSE_PROMPTS, RIZZ_QUESTIONS, LIE_QUESTIONS, DRUNK_LOGIC_PROMPTS } = require('./dares');

class BachelorGame {
  constructor(roomId) {
    this.roomId = roomId;
    this.players = new Map();   // id → { id, name, score, avatar, disconnected }
    this.owner = null;
    this.state = 'waiting';     // waiting | playing | gameover

    // Mini-game sequencing
    this.miniGames = ['sus', 'caption', 'excuse', 'rizz', 'liedetector', 'drunklogic'];
    this.miniGameIndex = -1;
    this.currentMiniGame = null;

    // Shared voting/submission storage
    this.votes = {};            // playerId → value
    this.submissions = [];      // [{ playerId, text }]
    this.ratings = {};          // playerId → rating (1-5) for rizz round
    this.lieVotes = {};         // playerId → 'real' | 'cap'

    // Sus Drawing (one drawer per round)
    this.drawTarget = null;     // { drawerId, drawerName, prompt }
    this.drawerQueue = [];

    // Per-round context
    this.currentPrompt = null;  // string or object
    this.currentSpeaker = null; // playerId for lie-detector / drunk-logic
    this.speakerQueue = [];
    this.speakerIndex = 0;

    // Chaos
    this.chaosScore = 0;        // 0-100
  }

  // ── Player management ──
  addPlayer(id, name, avatar = '#a855f7') {
    if (!this.players.has(id)) {
      this.players.set(id, { id, name, avatar, disconnected: false });
    }
    if (!this.owner) this.owner = id;
    return this.players.get(id);
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (p) p.disconnected = true;
    if (this.owner === id) {
      const next = [...this.players.values()].find(p2 => !p2.disconnected && p2.id !== id);
      if (next) this.owner = next.id;
    }
  }

  reconnectPlayer(id, name) {
    const p = this.players.get(id);
    if (!p) return false;
    p.disconnected = false;
    if (name) p.name = name;
    return true;
  }

  holdPlayerForReconnect(id) { this.removePlayer(id); }

  getPlayerList() {
    return [...this.players.values()].map(p => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      isOwner: p.id === this.owner,
      disconnected: p.disconnected,
    }));
  }

  getActivePlayers() {
    return [...this.players.values()].filter(p => !p.disconnected);
  }

  // ── Game flow ──
  startGame() {
    this.state = 'playing';
    this.miniGameIndex = -1;
    // Shuffle mini-game order
    this.miniGames = [...this.miniGames].sort(() => Math.random() - 0.5);
    this.chaosScore = 0;
  }

  nextMiniGame() {
    this.miniGameIndex++;
    if (this.miniGameIndex >= this.miniGames.length) {
      this.state = 'gameover';
      return null;
    }
    this.currentMiniGame = this.miniGames[this.miniGameIndex];
    this.votes = {};
    this.submissions = [];
    this.ratings = {};
    this.lieVotes = {};
    return this.currentMiniGame;
  }

  _bumpChaos(amount = 5) {
    this.chaosScore = Math.min(100, this.chaosScore + amount);
  }

  // ── Sus Drawing ──
  startSus() {
    const active = this.getActivePlayers();
    this.drawerQueue = [...active].sort(() => Math.random() - 0.5).map(p => p.id);
    return this._nextSusDrawer();
  }

  _nextSusDrawer() {
    if (!this.drawerQueue.length) return null;
    const drawerId = this.drawerQueue.shift();
    const drawer = this.players.get(drawerId);
    const prompt = SUS_PROMPTS[Math.floor(Math.random() * SUS_PROMPTS.length)];
    this.drawTarget = { drawerId, drawerName: drawer ? drawer.name : '?', prompt };
    this.votes = {};    // caption votes
    this.submissions = []; // captions submitted
    return this.drawTarget;
  }

  submitSusCaption(playerId, caption) {
    if (!this.submissions.find(s => s.playerId === playerId)) {
      this.submissions.push({ playerId, caption });
      return true;
    }
    return false;
  }

  endSus() {
    // Vote on captions
    const counts = {};
    this.submissions.forEach(s => { counts[s.playerId] = (counts[s.playerId] || 0) + (this.votes[s.playerId] || 0); });
    // Find most votes
    let winner = null, max = 0;
    Object.entries(this.votes).forEach(([voter, votedFor]) => {
      counts[votedFor] = (counts[votedFor] || 0) + 1;
    });
    Object.entries(counts).forEach(([id, cnt]) => {
      if (cnt > max) { max = cnt; winner = id; }
    });
    if (winner) {
      this._bumpChaos(8);
    }
    const results = this.submissions.map(s => ({
      playerId: s.playerId,
      name: this.players.get(s.playerId)?.name || '?',
      caption: s.caption,
      votes: counts[s.playerId] || 0,
    })).sort((a, b) => b.votes - a.votes);
    this.submissions = [];
    this.votes = {};
    return { results, winnerName: winner ? this.players.get(winner)?.name : null };
  }

  // ── Caption This Disaster ──
  startCaption() {
    const scenario = CAPTION_SCENARIOS[Math.floor(Math.random() * CAPTION_SCENARIOS.length)];
    this.currentPrompt = scenario;
    this.submissions = [];
    return scenario;
  }

  submitCaption(playerId, text) {
    if (!this.submissions.find(s => s.playerId === playerId)) {
      this.submissions.push({ playerId, text });
      return true;
    }
    return false;
  }

  voteCaption(voterId, targetId) {
    this.votes[voterId] = targetId;
    return Object.keys(this.votes).length;
  }

  endCaption() {
    const counts = {};
    Object.values(this.votes).forEach(id => { counts[id] = (counts[id] || 0) + 1; });
    let winnerId = null, max = 0;
    Object.entries(counts).forEach(([id, c]) => { if (c > max) { max = c; winnerId = id; } });
    if (winnerId) {
      this._bumpChaos(5);
    }
    const results = this.submissions.map(s => ({
      playerId: s.playerId,
      name: this.players.get(s.playerId)?.name || '?',
      text: s.text,
      votes: counts[s.playerId] || 0,
    })).sort((a, b) => b.votes - a.votes);
    this.submissions = [];
    this.votes = {};
    return { scene: this.currentPrompt, results, winnerName: winnerId ? this.players.get(winnerId)?.name : null };
  }

  // ── Excuse Generator ──
  startExcuse() {
    this.currentPrompt = EXCUSE_PROMPTS[Math.floor(Math.random() * EXCUSE_PROMPTS.length)];
    this.submissions = [];
    this.votes = {};
    return this.currentPrompt;
  }

  submitExcuse(playerId, text) {
    if (!this.submissions.find(s => s.playerId === playerId)) {
      this.submissions.push({ playerId, text });
      return true;
    }
    return false;
  }

  voteExcuse(voterId, targetId) {
    if (voterId === targetId) return;
    this.votes[voterId] = targetId;
  }

  endExcuse() {
    const counts = {};
    Object.values(this.votes).forEach(id => { counts[id] = (counts[id] || 0) + 1; });
    let winnerId = null, max = 0;
    Object.entries(counts).forEach(([id, c]) => { if (c > max) { max = c; winnerId = id; } });
    if (winnerId) {
      this._bumpChaos(6);
    }
    const results = this.submissions.map(s => ({
      playerId: s.playerId,
      name: this.players.get(s.playerId)?.name || '?',
      text: s.text,
      votes: counts[s.playerId] || 0,
    })).sort((a, b) => b.votes - a.votes);
    this.submissions = [];
    this.votes = {};
    return { prompt: this.currentPrompt, results, winnerName: winnerId ? this.players.get(winnerId)?.name : null };
  }

  // ── Rate the Rizz ──
  startRizz() {
    this.currentPrompt = RIZZ_QUESTIONS[Math.floor(Math.random() * RIZZ_QUESTIONS.length)];
    this.submissions = [];
    this.ratings = {};  // submissionPlayerId → [rating, rating, ...]
    return this.currentPrompt;
  }

  submitRizz(playerId, text) {
    if (!this.submissions.find(s => s.playerId === playerId)) {
      this.submissions.push({ playerId, text });
      return true;
    }
    return false;
  }

  rateRizz(voterId, targetId, rating) {  // rating 1-5
    if (voterId === targetId) return;
    if (!this.ratings[targetId]) this.ratings[targetId] = [];
    if (!this.ratings[targetId].find(r => r.voterId === voterId)) {
      this.ratings[targetId].push({ voterId, rating });
    }
  }

  endRizz() {
    const results = this.submissions.map(s => {
      const r = this.ratings[s.playerId] || [];
      const avg = r.length ? (r.reduce((sum, v) => sum + v.rating, 0) / r.length) : 0;
      return { playerId: s.playerId, name: this.players.get(s.playerId)?.name || '?', text: s.text, avg, votes: r.length };
    }).sort((a, b) => b.avg - a.avg);
    if (results.length > 0) {
      this._bumpChaos(7);
    }
    this.submissions = [];
    this.ratings = {};
    return { prompt: this.currentPrompt, results, winnerName: results[0]?.name || null };
  }

  // ── Lie Detector ──
  startLieDetector() {
    // Each player gets a turn to make a statement
    this.speakerQueue = this.getActivePlayers().map(p => p.id);
    this.speakerIndex = 0;
    this.submissions = [];
    return this._nextLieSpeaker();
  }

  _nextLieSpeaker() {
    if (this.speakerIndex >= this.speakerQueue.length) return null;
    const speakerId = this.speakerQueue[this.speakerIndex++];
    this.currentSpeaker = speakerId;
    const prompt = LIE_QUESTIONS[Math.floor(Math.random() * LIE_QUESTIONS.length)];
    this.currentPrompt = prompt;
    this.lieVotes = {};
    this.currentLieStatement = null;
    return { speakerId, speakerName: this.players.get(speakerId)?.name || '?', prompt };
  }

  submitLieStatement(playerId, text, isLie) {
    if (playerId !== this.currentSpeaker) return false;
    this.currentLieStatement = { text, isLie };   // isLie = server-secret
    return true;
  }

  voteLie(voterId, verdict) {  // verdict: 'real' | 'lie'
    if (voterId === this.currentSpeaker) return;
    this.lieVotes[voterId] = verdict;
  }

  resolveLieTurn() {
    const { text, isLie } = this.currentLieStatement || { text: '', isLie: false };
    const correctVerdicts = isLie ? 'lie' : 'real';
    const voters = Object.entries(this.lieVotes);
    let correctCount = 0;
    voters.forEach(([id, v]) => {
      if (v === correctVerdicts) {
        correctCount++;
      }
    });
    const fooledCount = voters.length - correctCount;
    if (fooledCount > 0) {
      this._bumpChaos(fooledCount * 4);
    }
    return {
      truth: !isLie,
      text,
      correctCount,
      fooledCount,
      speakerName: this.players.get(this.currentSpeaker)?.name || '?',
      verdict: isLie ? '💀 It was a LIE!' : '✅ It was TRUE!',
    };
  }

  hasMoreLieSpeakers() {
    return this.speakerIndex < this.speakerQueue.length;
  }

  // ── Drunk Logic ──
  startDrunkLogic() {
    this.currentPrompt = DRUNK_LOGIC_PROMPTS[Math.floor(Math.random() * DRUNK_LOGIC_PROMPTS.length)];
    this.submissions = [];
    this.votes = {};
    return this.currentPrompt;
  }

  submitDrunkLogic(playerId, text) {
    if (!this.submissions.find(s => s.playerId === playerId)) {
      this.submissions.push({ playerId, text });
      return true;
    }
    return false;
  }

  voteDrunkLogic(voterId, targetId) {
    if (voterId === targetId) return;
    this.votes[voterId] = targetId;
  }

  endDrunkLogic() {
    const counts = {};
    Object.values(this.votes).forEach(id => { counts[id] = (counts[id] || 0) + 1; });
    let winnerId = null, max = 0;
    Object.entries(counts).forEach(([id, c]) => { if (c > max) { max = c; winnerId = id; } });
    if (winnerId) {
      this._bumpChaos(10);
    }
    const results = this.submissions.map(s => ({
      playerId: s.playerId,
      name: this.players.get(s.playerId)?.name || '?',
      text: s.text,
      votes: counts[s.playerId] || 0,
    })).sort((a, b) => b.votes - a.votes);
    this.submissions = [];
    this.votes = {};
    return { prompt: this.currentPrompt, results, winnerName: winnerId ? this.players.get(winnerId)?.name : null };
  }

  // ── Final results ──
  getFinalResults() {
    const players = [...this.players.values()]
      .map(p => ({ id: p.id, name: p.name, avatar: p.avatar }));
    return { players, chaosScore: this.chaosScore };
  }

  cleanup() {
    this.players.clear();
  }

  reset() {
    this.state = 'waiting';
    this.miniGameIndex = -1;
    this.currentMiniGame = null;
    this.votes = {};
    this.submissions = [];
    this.ratings = {};
    this.lieVotes = {};
    this.chaosScore = 0;
  }
}

module.exports = BachelorGame;
