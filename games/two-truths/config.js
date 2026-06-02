// ========================================
// TWO TRUTHS & A LIE — Shared Config
// ========================================
// SINGLE SOURCE OF TRUTH for values shared by client + server
// (durations, player limits, statement length).
//
// Server: require('./config').
// Client: served as a plain script at /two-truths/config.js, but the SPA
//   only loads ['app.js'], so the client re-declares the same constants
//   inline (kept in sync by hand — keep these in lockstep).

const CONFIG = {
  MIN_PLAYERS: 3,
  MAX_PLAYERS: 12,

  SUBMIT_DURATION: 60,   // seconds to write 3 statements
  GUESS_DURATION: 15,    // seconds to guess each trio
  REVEAL_PAUSE: 6,       // seconds the reveal stays up

  MAX_STATEMENT_LEN: 120, // cap per statement

  CORRECT_POINTS: 100,   // guesser found the lie
  FOOL_POINTS: 50,       // author, per person fooled
};

module.exports = CONFIG;
