// ========================================
// MAFIA — Shared Config (single source of truth)
// ========================================
// Used by BOTH the server (require) and the client (loaded as a plain
// script BEFORE app.js — it attaches MAFIA_CONFIG to window). Keeping the
// thresholds/durations here means client and server never disagree.

(function (root, factory) {
  const cfg = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = cfg;               // server: require('./config')
  }
  if (typeof window !== 'undefined') {
    window.MAFIA_CONFIG = cfg;          // client: global MAFIA_CONFIG
  }
})(this, function () {
  return {
    MIN_PLAYERS: 4,
    MAX_PLAYERS: 12,

    // Phase durations (seconds)
    NIGHT_SECONDS: 30,
    DAY_SECONDS: 60,
    REVEAL_SECONDS: 6,    // pause to read the dawn / vote resolution

    RECONNECT_GRACE: 30000, // ms

    ROLES: {
      MAFIA: 'mafia',
      DETECTIVE: 'detective',
      DOCTOR: 'doctor',
      VILLAGER: 'villager',
    },

    // Tie behaviour on the day vote: 'none' = nobody eliminated on a tie.
    TIE_RESULT: 'none',

    // Doctor only appears at >= this many players.
    DOCTOR_MIN_PLAYERS: 5,

    // ~1 mafia per this many players (floored, always >= 1).
    PLAYERS_PER_MAFIA: 4,
  };
});
