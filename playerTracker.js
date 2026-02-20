// ========================================
// PLAYER TRACKER — Global Online Player Counting
// ========================================
//
// Central singleton that tracks how many players are currently
// in each game across all Socket.IO namespaces.
//
// Each game's socket.js calls:
//   tracker.playerJoined(gameId)
//   tracker.playerLeft(gameId)
//
// The tracker emits 'update' events so server.js can broadcast
// live counts to the homepage.
//
// No database required — pure in-memory.

const EventEmitter = require('events');

class PlayerTracker extends EventEmitter {
  constructor() {
    super();
    // gameId → number of connected players (in rooms)
    this.counts = new Map();
  }

  /**
   * Called when a player joins a room in any game.
   * @param {string} gameId — e.g. 'scribble', 'dare-roulette'
   */
  playerJoined(gameId) {
    const current = this.counts.get(gameId) || 0;
    this.counts.set(gameId, current + 1);
    this.emit('update', this.getStatus());
  }

  /**
   * Called when a player leaves a room (disconnect, not reconnect-hold).
   * Only call this for actual departures, not temporary disconnects
   * where the seat is held.
   * @param {string} gameId
   */
  playerLeft(gameId) {
    const current = this.counts.get(gameId) || 0;
    this.counts.set(gameId, Math.max(0, current - 1));
    this.emit('update', this.getStatus());
  }

  /**
   * Get full status object for all games.
   * @returns {Object} { gameId: count, ... }
   */
  getStatus() {
    const status = {};
    this.counts.forEach((count, gameId) => {
      status[gameId] = count;
    });
    return status;
  }

  /**
   * Get count for a single game.
   * @param {string} gameId
   * @returns {number}
   */
  getCount(gameId) {
    return this.counts.get(gameId) || 0;
  }
}

// Singleton — shared across all game socket handlers
const tracker = new PlayerTracker();

module.exports = tracker;
