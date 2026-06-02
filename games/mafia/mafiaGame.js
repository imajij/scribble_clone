// ========================================
// MAFIA — Game Logic Module (state machine)
// ========================================
//
// State machine:
//   waiting → night → day → (night | gameOver) ...
//   gameOver → (playAgain) → waiting
//
// Each player object:
//   { id(socketId), name, sessionId, role, alive, connected }
//
// Phases:
//   NIGHT: mafia pick a victim, detective investigates, doctor saves.
//          Resolve at dawn → victim dies unless saved.
//   DAY:   alive players discuss + vote to eliminate one (or abstain).
//          Most-voted eliminated; ties → nobody (configurable).
//
// Win check after every resolution:
//   Villagers win when all mafia dead.
//   Mafia win when mafia >= alive non-mafia.
//
// Dead players become spectators (see everything, ghost-chat only).

const CONFIG = require('./config');
const { MAFIA, DETECTIVE, DOCTOR, VILLAGER } = CONFIG.ROLES;

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

class MafiaGame {
  constructor(roomId) {
    this.roomId = roomId;

    this.players = new Map();      // socketId → player
    this.state = 'waiting';        // waiting | night | day | gameOver
    this.owner = null;
    this.ownerSessionId = null;

    this.dayNum = 0;               // increments each night that starts
    this.winner = null;            // 'villagers' | 'mafia' | null

    // ── Night action staging ──
    this.mafiaTarget = null;       // socketId chosen by mafia (last write wins)
    this.doctorSave = null;        // socketId chosen by doctor
    this.detectiveCheck = null;    // socketId chosen by detective
    this.nightResolved = false;

    // ── Day voting ──
    this.dayVotes = new Map();     // voterSocketId → targetSocketId | 'abstain'

    // ── Last resolution (so reconnect can re-show current phase intro) ──
    this.lastResolution = null;

    // Timers (all flow-driving timeouts live here; clearTimers() clears them)
    this.phaseTimer = null;

    // Reconnect
    this.disconnectedPlayers = new Map(); // sessionId → held data
  }

  // ============================================================
  // Player management
  // ============================================================

  addPlayer(socketId, name, sessionId) {
    const player = {
      id: socketId,
      name: (name || 'Anon').substring(0, 20),
      sessionId,
      role: null,
      alive: true,
      connected: true,
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
    this.clearVotesFor(socketId);
    if (this.owner === socketId && this.players.size > 0) {
      this._reassignOwner();
    }
    return player;
  }

  _reassignOwner() {
    const next = this.players.keys().next().value;
    if (next === undefined) { this.owner = null; this.ownerSessionId = null; return; }
    this.owner = next;
    this.ownerSessionId = this.players.get(next).sessionId;
  }

  // Remove any pending references to a socketId (when they leave / are held).
  clearVotesFor(socketId) {
    this.dayVotes.delete(socketId);
    if (this.mafiaTarget === socketId) this.mafiaTarget = null;
    if (this.doctorSave === socketId) this.doctorSave = null;
    if (this.detectiveCheck === socketId) this.detectiveCheck = null;
  }

  isOwner(socketId) { return this.owner === socketId; }

  canStart() {
    return this.state === 'waiting' && this.players.size >= CONFIG.MIN_PLAYERS;
  }

  getPlayer(socketId) { return this.players.get(socketId); }

  // ── Lobby player list (no roles leaked) ──
  getPlayerList() {
    const list = [];
    this.players.forEach((p) => {
      list.push({
        id: p.id,
        name: p.name,
        alive: p.alive,
        connected: p.connected,
        isOwner: p.id === this.owner,
      });
    });
    return list;
  }

  alivePlayers() {
    return [...this.players.values()].filter(p => p.alive);
  }

  aliveByRole(role) {
    return this.alivePlayers().filter(p => p.role === role);
  }

  isMafia(p) { return p && p.role === MAFIA; }

  // ============================================================
  // Reconnect support
  // ============================================================

  holdPlayerForReconnect(socketId) {
    const player = this.players.get(socketId);
    if (!player) return null;
    this.disconnectedPlayers.set(player.sessionId, {
      name: player.name,
      role: player.role,
      alive: player.alive,
    });
    const wasOwner = this.owner === socketId;
    this.players.delete(socketId);
    // Keep their staged action references valid? No — clear them so a held
    // player's stale target can't accidentally resolve. Their own vote stays
    // keyed by old socketId and is harmless (cleared here).
    this.clearVotesFor(socketId);

    if (wasOwner && this.players.size > 0) {
      this._reassignOwner();
    } else if (wasOwner) {
      this.owner = null;
      this.ownerSessionId = null;
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
      role: held.role,
      alive: held.alive,
      connected: true,
    };
    this.players.set(newSocketId, player);
    if (this.ownerSessionId === sessionId) this.owner = newSocketId;
    else if (this.owner === null) this._reassignOwner();
    return player;
  }

  // ============================================================
  // Role assignment
  // ============================================================

  assignRoles() {
    const ids = shuffle([...this.players.keys()]);
    const n = ids.length;

    const mafiaCount = Math.max(1, Math.floor(n / CONFIG.PLAYERS_PER_MAFIA));
    const hasDoctor = n >= CONFIG.DOCTOR_MIN_PLAYERS;

    const roles = [];
    for (let i = 0; i < mafiaCount; i++) roles.push(MAFIA);
    roles.push(DETECTIVE);
    if (hasDoctor) roles.push(DOCTOR);
    while (roles.length < n) roles.push(VILLAGER);

    // roles array is already in a fixed order; ids are shuffled → random mapping
    ids.forEach((id, i) => {
      const p = this.players.get(id);
      p.role = roles[i];
      p.alive = true;
    });
  }

  // Roster of mafia (names + ids) so the mafia can see each other.
  mafiaRoster() {
    return this.aliveByRole(MAFIA).map(p => ({ id: p.id, name: p.name }));
  }

  // ============================================================
  // Game flow
  // ============================================================

  startGame() {
    this.assignRoles();
    this.dayNum = 0;
    this.winner = null;
    this.lastResolution = null;
    this.state = 'waiting'; // will be flipped by startNight()
  }

  startNight() {
    this.state = 'night';
    this.dayNum++;
    this.mafiaTarget = null;
    this.doctorSave = null;
    this.detectiveCheck = null;
    this.nightResolved = false;
  }

  // ── Night actions ──
  setMafiaTarget(socketId, targetId) {
    if (this.state !== 'night') return false;
    const actor = this.players.get(socketId);
    if (!this.isMafia(actor) || !actor.alive) return false;
    const target = this.players.get(targetId);
    if (!target || !target.alive || this.isMafia(target)) return false;
    this.mafiaTarget = targetId;
    return true;
  }

  setDoctorSave(socketId, targetId) {
    if (this.state !== 'night') return false;
    const actor = this.players.get(socketId);
    if (!actor || actor.role !== DOCTOR || !actor.alive) return false;
    const target = this.players.get(targetId);
    if (!target || !target.alive) return false;
    this.doctorSave = targetId;
    return true;
  }

  setDetectiveCheck(socketId, targetId) {
    if (this.state !== 'night') return false;
    const actor = this.players.get(socketId);
    if (!actor || actor.role !== DETECTIVE || !actor.alive) return false;
    // One investigation per night — ignore further attempts once committed.
    if (this.detectiveCheck !== null) return false;
    const target = this.players.get(targetId);
    if (!target || !target.alive || target.id === socketId) return false;
    this.detectiveCheck = targetId;
    const isMafia = this.isMafia(target);
    return { targetId, targetName: target.name, isMafia };
  }

  // True once every living role-holder has submitted (lets us end night early).
  allNightActionsIn() {
    if (this.state !== 'night') return false;
    const mafiaAlive = this.aliveByRole(MAFIA).length > 0;
    const docAlive = this.aliveByRole(DOCTOR).length > 0;
    const detAlive = this.aliveByRole(DETECTIVE).length > 0;
    if (mafiaAlive && this.mafiaTarget === null) return false;
    if (docAlive && this.doctorSave === null) return false;
    if (detAlive && this.detectiveCheck === null) return false;
    return true;
  }

  // ── Resolve night → returns a resolution object ──
  resolveNight() {
    this.nightResolved = true;
    let killedId = null;
    let saved = false;

    if (this.mafiaTarget) {
      if (this.doctorSave && this.doctorSave === this.mafiaTarget) {
        saved = true;
      } else {
        const victim = this.players.get(this.mafiaTarget);
        if (victim && victim.alive) {
          victim.alive = false;
          killedId = victim.id;
        }
      }
    }

    const killed = killedId ? this.players.get(killedId) : null;
    const resolution = {
      type: 'night',
      dayNum: this.dayNum,
      killedId,
      killedName: killed ? killed.name : null,
      killedRole: killed ? killed.role : null,
      saved,
    };
    this.lastResolution = resolution;
    return resolution;
  }

  // ── Day phase ──
  startDay() {
    this.state = 'day';
    this.dayVotes.clear();
  }

  castDayVote(voterId, targetId) {
    if (this.state !== 'day') return false;
    const voter = this.players.get(voterId);
    if (!voter || !voter.alive) return false;
    if (targetId === 'abstain') {
      this.dayVotes.set(voterId, 'abstain');
      return true;
    }
    const target = this.players.get(targetId);
    if (!target || !target.alive) return false;
    this.dayVotes.set(voterId, targetId);
    return true;
  }

  allDayVotesIn() {
    if (this.state !== 'day') return false;
    const aliveCount = this.alivePlayers().length;
    return this.dayVotes.size >= aliveCount;
  }

  // Public-facing vote tally (names only — who voted for whom is visible).
  getVoteTally() {
    const counts = {};        // targetId → count
    const voters = {};        // targetId → [voterName]
    let abstain = 0;
    this.dayVotes.forEach((targetId, voterId) => {
      const voter = this.players.get(voterId);
      const vname = voter ? voter.name : '?';
      if (targetId === 'abstain') { abstain++; return; }
      counts[targetId] = (counts[targetId] || 0) + 1;
      (voters[targetId] = voters[targetId] || []).push(vname);
    });
    return { counts, voters, abstain, voted: this.dayVotes.size, total: this.alivePlayers().length };
  }

  // ── Resolve day → returns a resolution object ──
  resolveDay() {
    const { counts } = this.getVoteTally();
    let topId = null;
    let topCount = 0;
    let tie = false;
    Object.keys(counts).forEach((id) => {
      if (counts[id] > topCount) { topCount = counts[id]; topId = id; tie = false; }
      else if (counts[id] === topCount) { tie = true; }
    });

    let eliminatedId = null;
    if (topId && topCount > 0 && !(tie && CONFIG.TIE_RESULT === 'none')) {
      if (tie && CONFIG.TIE_RESULT === 'random') {
        const tied = Object.keys(counts).filter(id => counts[id] === topCount);
        eliminatedId = tied[Math.floor(Math.random() * tied.length)];
      } else if (!tie) {
        eliminatedId = topId;
      }
    }

    let eliminated = null;
    if (eliminatedId) {
      eliminated = this.players.get(eliminatedId);
      if (eliminated) eliminated.alive = false;
    }

    const resolution = {
      type: 'day',
      dayNum: this.dayNum,
      eliminatedId: eliminated ? eliminated.id : null,
      eliminatedName: eliminated ? eliminated.name : null,
      eliminatedRole: eliminated ? eliminated.role : null,
      tie: tie && !eliminated,
      tally: this.getVoteTally(),
    };
    this.lastResolution = resolution;
    return resolution;
  }

  // ============================================================
  // Win check
  // ============================================================

  checkWin() {
    const alive = this.alivePlayers();
    const mafiaAlive = alive.filter(p => this.isMafia(p)).length;
    const nonMafiaAlive = alive.length - mafiaAlive;

    if (mafiaAlive === 0) { this.winner = 'villagers'; return 'villagers'; }
    if (mafiaAlive >= nonMafiaAlive) { this.winner = 'mafia'; return 'mafia'; }
    return null;
  }

  // Full reveal at game over.
  getGameOverPayload() {
    const roles = [];
    this.players.forEach((p) => {
      roles.push({ id: p.id, name: p.name, role: p.role, alive: p.alive });
    });
    // Also reveal held (disconnected) players' roles for completeness.
    this.disconnectedPlayers.forEach((held) => {
      roles.push({ id: null, name: held.name, role: held.role, alive: held.alive, disconnected: true });
    });
    return { winner: this.winner, roles };
  }

  endGame() {
    this.state = 'gameOver';
  }

  // ============================================================
  // Per-socket private view (role + actionable data for current phase)
  // ============================================================

  buildPrivateView(socketId) {
    const me = this.players.get(socketId);
    if (!me) return null;

    const view = {
      role: me.role,
      alive: me.alive,
    };

    if (this.state === 'night') {
      if (me.alive && this.isMafia(me)) {
        view.action = 'mafia';
        view.mafiaPartners = this.mafiaRoster();   // includes self
        view.targets = this.alivePlayers()
          .filter(p => !this.isMafia(p))
          .map(p => ({ id: p.id, name: p.name }));
        view.currentTarget = this.mafiaTarget;
      } else if (me.alive && me.role === DETECTIVE) {
        view.action = 'detective';
        view.targets = this.alivePlayers()
          .filter(p => p.id !== socketId)
          .map(p => ({ id: p.id, name: p.name }));
        view.currentTarget = this.detectiveCheck;
        // Re-send investigation result if already used this night
        if (this.detectiveCheck) {
          const t = this.players.get(this.detectiveCheck);
          if (t) view.investigation = { targetName: t.name, isMafia: this.isMafia(t) };
        }
      } else if (me.alive && me.role === DOCTOR) {
        view.action = 'doctor';
        view.targets = this.alivePlayers().map(p => ({ id: p.id, name: p.name }));
        view.currentTarget = this.doctorSave;
      } else {
        view.action = me.alive ? 'sleep' : 'spectate';
      }
    } else if (this.state === 'day') {
      view.action = me.alive ? 'vote' : 'spectate';
      view.targets = this.alivePlayers().map(p => ({ id: p.id, name: p.name }));
      view.currentVote = this.dayVotes.get(socketId) || null;
      view.tally = this.getVoteTally();
    } else {
      view.action = 'none';
    }
    return view;
  }

  // ============================================================
  // Reset / cleanup
  // ============================================================

  reset() {
    this.state = 'waiting';
    this.dayNum = 0;
    this.winner = null;
    this.mafiaTarget = null;
    this.doctorSave = null;
    this.detectiveCheck = null;
    this.nightResolved = false;
    this.dayVotes.clear();
    this.lastResolution = null;
    this.players.forEach((p) => { p.role = null; p.alive = true; });
    this.clearTimers();
  }

  clearTimers() {
    if (this.phaseTimer) { clearTimeout(this.phaseTimer); this.phaseTimer = null; }
  }

  cleanup() {
    this.clearTimers();
  }
}

module.exports = MafiaGame;
