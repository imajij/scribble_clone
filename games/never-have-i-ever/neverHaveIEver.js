// ========================================
// NEVER HAVE I EVER — Game Logic Module
// ========================================
//
// State machine: waiting → picking → reveal → (next round or gameOver)
//
// Each round:
//   1. Server shows a "Never have I ever ..." prompt.
//   2. Every player secretly picks "have" (🙋 guilty) or "never" (🙅) in ~15s.
//   3. REVEAL: counts + the list of names on each side (the fun part).
//   4. Brief pause → next round.
//
// Tally + scoring:
//   - guilt = number of "have" picks across the game (the headline stat).
//   - Light gamey points: being on the MINORITY side of a round = +50 (rare),
//     majority side = +20, no pick = 0. Ties give everyone +30.
//   - Final leaderboard ranks by guilt (most guilty wins the crown), with
//     points as a tie-breaker, and hands out playful titles.

const { getRandomPrompt, HEAT } = require('./prompts');

// Single source of truth for round/phase config (mirrored on the client).
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 16;
const PICK_DURATION = 15; // seconds
const POINTS = { minority: 50, majority: 20, tie: 30, none: 0 };

class NeverHaveIEverGame {
  constructor(roomId) {
    this.roomId = roomId;

    // Player management (socketId → player object)
    this.players = new Map();
    this.state = 'waiting'; // waiting | picking | reveal | gameOver
    this.owner = null;
    this.ownerSessionId = null;

    // Round state
    this.roundNum = 0;
    this.maxRounds = 7;
    this.heatLevel = HEAT.SPICY; // 1=mild, 2=spicy, 3=extreme

    // Current prompt
    this.currentPrompt = null;
    this.picks = new Map(); // socketId → 'have' | 'never'
    this.pickStartTime = null;

    // Timers (stored so cleanup() can clear every flow-driving timeout)
    this.pickDuration = PICK_DURATION;
    this.pickTimer = null;
    this.revealTimer = null;

    // Track used prompts (by text)
    this.usedPrompts = new Set();

    // Reconnect
    this.disconnectedPlayers = new Map(); // sessionId → held data
  }

  // ── Player management ──

  addPlayer(socketId, name, sessionId) {
    const player = {
      id: socketId,
      name: (name || 'Anon').substring(0, 20),
      sessionId,
      score: 0,
      guilt: 0, // number of "have" picks this game
    };
    this.players.set(socketId, player);

    if (this.players.size === 1) {
      this.owner = socketId;
      this.ownerSessionId = sessionId;
    }
    return player;
  }

  removePlayer(socketId) {
    const player = this.players.get(socketId);
    if (!player) return null;
    this.players.delete(socketId);
    this.picks.delete(socketId);

    if (this.owner === socketId && this.players.size > 0) {
      const next = this.players.keys().next().value;
      this.owner = next;
      this.ownerSessionId = this.players.get(next).sessionId;
    }
    return player;
  }

  isOwner(socketId) {
    return this.owner === socketId;
  }

  canStart() {
    return this.state === 'waiting' && this.players.size >= MIN_PLAYERS;
  }

  getPlayerList() {
    const list = [];
    this.players.forEach((p) => {
      list.push({ id: p.id, name: p.name, score: p.score, guilt: p.guilt, isOwner: p.id === this.owner });
    });
    list.sort((a, b) => b.guilt - a.guilt || b.score - a.score);
    return list;
  }

  // ── Reconnect support ──

  holdPlayerForReconnect(socketId) {
    const player = this.players.get(socketId);
    if (!player) return null;
    this.disconnectedPlayers.set(player.sessionId, {
      name: player.name,
      score: player.score,
      guilt: player.guilt,
    });
    const wasOwner = this.owner === socketId;
    this.players.delete(socketId);
    this.picks.delete(socketId);

    // Transfer ownership to a live player if the held seat was the host's.
    if (wasOwner && this.players.size > 0) {
      const next = this.players.keys().next().value;
      this.owner = next;
      this.ownerSessionId = this.players.get(next).sessionId;
    }
    return player;
  }

  hasDisconnectedPlayer(sessionId) {
    return this.disconnectedPlayers.has(sessionId);
  }

  reconnectPlayer(newSocketId, sessionId) {
    const held = this.disconnectedPlayers.get(sessionId);
    if (!held) return null;
    this.disconnectedPlayers.delete(sessionId);
    const player = {
      id: newSocketId,
      name: held.name,
      sessionId,
      score: held.score,
      guilt: held.guilt,
    };
    this.players.set(newSocketId, player);

    if (this.ownerSessionId === sessionId) {
      this.owner = newSocketId;
    }
    return player;
  }

  // ── Game flow ──

  startGame() {
    this.state = 'picking';
    this.roundNum = 0;
    this.usedPrompts.clear();
    this.players.forEach((p) => { p.score = 0; p.guilt = 0; });
  }

  nextRound() {
    this.roundNum++;
    if (this.roundNum > this.maxRounds) {
      this.state = 'gameOver';
      return null;
    }
    this.state = 'picking';
    this.picks.clear();

    const prompt = getRandomPrompt(this.heatLevel, this.usedPrompts);
    this.usedPrompts.add(prompt.text);
    this.currentPrompt = prompt;
    this.pickStartTime = Date.now();

    return {
      roundNum: this.roundNum,
      maxRounds: this.maxRounds,
      prompt: { text: prompt.text, heat: prompt.heat },
      pickDuration: this.pickDuration,
      total: this.players.size,
    };
  }

  castPick(socketId, choice) {
    if (this.state !== 'picking') return false;
    if (choice !== 'have' && choice !== 'never') return false;
    if (!this.players.has(socketId)) return false;
    if (this.picks.has(socketId)) return false; // already picked
    this.picks.set(socketId, choice);
    return true;
  }

  allPicked() {
    return this.picks.size >= this.players.size;
  }

  getPickProgress() {
    return { picked: this.picks.size, total: this.players.size };
  }

  calculateResults() {
    this.state = 'reveal';

    const haveNames = [];
    const neverNames = [];
    this.players.forEach((player) => {
      const pick = this.picks.get(player.id);
      if (pick === 'have') haveNames.push(player.name);
      else if (pick === 'never') neverNames.push(player.name);
    });

    const countHave = haveNames.length;
    const countNever = neverNames.length;
    const total = countHave + countNever;
    const isTie = countHave === countNever;
    // The minority side this round (smaller, non-empty group earns the bonus).
    let minoritySide = null; // 'have' | 'never' | null
    if (!isTie && total > 0) {
      minoritySide = countHave < countNever ? 'have' : 'never';
    }

    const playerResults = [];
    this.players.forEach((player) => {
      const pick = this.picks.get(player.id) || null;
      let points = POINTS.none;

      if (pick) {
        if (pick === 'have') player.guilt++;
        if (isTie) {
          points = POINTS.tie;
        } else if (pick === minoritySide) {
          points = POINTS.minority;
        } else {
          points = POINTS.majority;
        }
      }

      player.score += points;
      playerResults.push({
        id: player.id,
        name: player.name,
        pick,
        points,
        guilt: player.guilt,
        totalScore: player.score,
      });
    });

    playerResults.sort((a, b) => b.guilt - a.guilt || b.totalScore - a.totalScore);

    return {
      prompt: { text: this.currentPrompt.text, heat: this.currentPrompt.heat },
      countHave,
      countNever,
      percentHave: total > 0 ? Math.round((countHave / total) * 100) : 0,
      percentNever: total > 0 ? Math.round((countNever / total) * 100) : 0,
      haveNames,
      neverNames,
      minoritySide,
      isTie,
      playerResults,
      roundNum: this.roundNum,
      maxRounds: this.maxRounds,
    };
  }

  getFinalResults() {
    const players = [];
    this.players.forEach((p) => players.push({ id: p.id, name: p.name, score: p.score, guilt: p.guilt }));
    // Rank by guilt (most guilty crowned), points as tie-breaker.
    players.sort((a, b) => b.guilt - a.guilt || b.score - a.score);

    const totalRounds = this.maxRounds;
    const ranked = players.map((p) => ({
      ...p,
      guiltPct: totalRounds > 0 ? Math.round((p.guilt / totalRounds) * 100) : 0,
    }));

    // Playful titles. Most/least guilty are the headline awards.
    const titles = {};
    if (ranked.length > 0) {
      const mostGuilty = ranked[0];
      const leastGuilty = ranked[ranked.length - 1];
      titles[mostGuilty.id] = { emoji: '😈', label: 'Most Guilty' };
      if (leastGuilty.id !== mostGuilty.id) {
        titles[leastGuilty.id] = { emoji: '😇', label: 'Most Innocent' };
      }
      // Middle-of-the-pack flavour for anyone without a headline title.
      ranked.forEach((p) => {
        if (titles[p.id]) return;
        if (p.guiltPct >= 50) titles[p.id] = { emoji: '🔥', label: 'No Shame' };
        else if (p.guilt === 0) titles[p.id] = { emoji: '👼', label: 'Pure Soul' };
        else titles[p.id] = { emoji: '🙈', label: 'Hiding Secrets' };
      });
    }

    return ranked.map((p) => ({
      id: p.id,
      name: p.name,
      score: p.score,
      guilt: p.guilt,
      guiltPct: p.guiltPct,
      maxRounds: totalRounds,
      title: titles[p.id] || { emoji: '🙈', label: 'Mystery' },
    }));
  }

  reset() {
    this.state = 'waiting';
    this.roundNum = 0;
    this.currentPrompt = null;
    this.picks.clear();
    this.usedPrompts.clear();
    this.pickTimer = null;
    this.revealTimer = null;
    this.players.forEach((p) => { p.score = 0; p.guilt = 0; });
  }

  // Clear EVERY flow-driving timeout. Called on cleanup / play-again / room teardown.
  clearTimers() {
    if (this.pickTimer) clearTimeout(this.pickTimer);
    if (this.revealTimer) clearTimeout(this.revealTimer);
    this.pickTimer = null;
    this.revealTimer = null;
  }

  cleanup() {
    this.clearTimers();
  }
}

module.exports = NeverHaveIEverGame;
module.exports.MIN_PLAYERS = MIN_PLAYERS;
module.exports.MAX_PLAYERS = MAX_PLAYERS;
module.exports.PICK_DURATION = PICK_DURATION;
