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
    description: 'Draw dirty, guess dirtier — the adults-only drawing & guessing party game.',
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
    description: 'Spicy truth-or-dare with a naughty twist. Pick truth or take the tease.',
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
    description: 'Would you rather… but make it 18+. Vote and see who thinks like you.',
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
    description: 'Wild "what would you do" scenarios. Debate, judge, and crown the best answer.',
    thumbnail: '/scenario/thumbnail.png',
    route: '/scenario',
    type: 'turn-based',
    minPlayers: 3,
    maxPlayers: 12,
    enabled: true
  },
  {
    id: 'confessions',
    name: 'Confessions',
    description: 'Anonymous confessions, then guess who said what. Secrets will be spilled.',
    thumbnail: '/confessions/thumbnail.png',
    route: '/confessions',
    type: 'turn-based',
    minPlayers: 3,
    maxPlayers: 16,
    enabled: true
  },
  {
    id: 'dare-roulette',
    name: 'Dare Roulette',
    description: 'Spin the wheel, face the dare. Complete it for glory or chicken out in shame.',
    thumbnail: '/dare-roulette/thumbnail.png',
    route: '/dare-roulette',
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
