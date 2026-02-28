// ========================================
// GAME REGISTRY — Central catalog for the multi-game platform
// ========================================
//
// Each entry describes one game that the platform hosts.
// Adding a new game = one new object here + a folder in games/<id>/.
//

const games = [
  {
    id: 'scribble',
    name: 'Scribble After Dark',
    description: 'Draw naughty things for your partner to guess — couples-only sketching fun.',
    thumbnail: '/scribble/thumbnail.png',
    route: '/scribble',
    type: 'realtime',            // realtime | solo | turn-based
    minPlayers: 2,
    maxPlayers: 8,
    enabled: true
  },
  {
    id: 'truth-or-tease',
    name: 'Truth or Tease',
    description: 'Intimate truths & teases designed for you and your partner. No holding back.',
    thumbnail: '/truth-or-tease/thumbnail.png',
    route: '/truth-or-tease',
    type: 'realtime',
    minPlayers: 2,
    maxPlayers: 10,
    enabled: true
  },
  {
    id: 'this-or-that',
    name: 'This or That',
    description: 'Would you rather… couples edition. Vote together, discover each other.',
    thumbnail: '/this-or-that/thumbnail.png',
    route: '/this-or-that',
    type: 'realtime',
    minPlayers: 2,
    maxPlayers: 20,
    enabled: true
  },
  {
    id: 'scenario',
    name: 'Scenario',
    description: 'Romantic, spicy & awkward scenarios for couples. Share answers & connect.',
    thumbnail: '/scenario/thumbnail.png',
    route: '/scenario',
    type: 'turn-based',
    minPlayers: 2,
    maxPlayers: 12,
    enabled: true
  },
  {
    id: 'confessions',
    name: 'Confessions',
    description: 'Confess your deepest secrets to your partner. From sweet to scandalous.',
    thumbnail: '/confessions/thumbnail.png',
    route: '/confessions',
    type: 'turn-based',
    minPlayers: 2,
    maxPlayers: 16,
    enabled: true
  },
  {
    id: 'dare-roulette',
    name: 'Dare Roulette',
    description: 'Spin the wheel, dare your partner. Sensual, romantic, or naughty — no backing out.',
    thumbnail: '/dare-roulette/thumbnail.png',
    route: '/dare-roulette',
    type: 'realtime',
    minPlayers: 2,
    maxPlayers: 10,
    enabled: true
  },
  {
    id: 'story-builder',
    name: 'Story Builder',
    description: 'Write a couples story together, one sentence at a time. Sweet, spicy, or both.',
    thumbnail: '/story-builder/thumbnail.png',
    route: '/story-builder',
    type: 'turn-based',
    minPlayers: 2,
    maxPlayers: 8,
    enabled: true
  },
  {
    id: 'couple-mode',
    name: 'Couple Mode 💑',
    description: 'Flirty chaos for couples — Who\'s More Likely, Draw Your Partner, Red Flags and more.',
    thumbnail: '/couple-mode/thumbnail.png',
    route: '/couple-game',
    type: 'realtime',
    minPlayers: 2,
    maxPlayers: 10,
    enabled: true
  },
  {
    id: 'bachelor-mode',
    name: 'Bachelor Mode 🍻',
    description: 'Absolute brainrot — Sus Drawing, Rate the Rizz, Lie Detector and more unhinged chaos.',
    thumbnail: '/bachelor-mode/thumbnail.png',
    route: '/bachelor',
    type: 'realtime',
    minPlayers: 2,
    maxPlayers: 10,
    enabled: true
  }
];

// ----------------------------------------
// Lookup helpers
// ----------------------------------------

/** All enabled games */
function getAll() {
  return games.filter(g => g.enabled);
}

/** Single game by id (or null) */
function getById(id) {
  return games.find(g => g.id === id && g.enabled) || null;
}

/** All game ids */
function getIds() {
  return games.filter(g => g.enabled).map(g => g.id);
}

module.exports = { games, getAll, getById, getIds };
