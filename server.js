// ========================================
// AFTER DARK GAMES — Platform Server
// ========================================
// Thin shell that:
//   1. Serves the platform landing page (public/)
//   2. Mounts per-game static directories (games/<id>/public → /<id>)
//   3. Exposes REST API for the game catalog
//   4. Registers per-game Socket.IO namespaces
//
// Adding a new game:
//   1. Add an entry in gameRegistry.js
//   2. Create games/<id>/public/  with at least index.html
//   3. (Optional) Create games/<id>/socket.js  exporting { register(io) }

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const { getAll, getById, getIds } = require('./gameRegistry');
const { getPackList } = require('./words');

// ---- Express + Socket.IO bootstrap ----
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.json());

// ============================================================
// 1. REST API — game catalog
// ============================================================

app.get('/api/games', (_req, res) => {
  res.json(getAll());
});

app.get('/api/games/:id', (req, res) => {
  const game = getById(req.params.id);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  res.json(game);
});

// ============================================================
// 2. Per-game static files  (/scribble → games/scribble/public)
// ============================================================

const gamesDir = path.join(__dirname, 'games');

getAll().forEach((game) => {
  const publicDir = path.join(gamesDir, game.id, 'public');
  if (fs.existsSync(publicDir)) {
    app.use(game.route, express.static(publicDir));
    console.log(`  📂 ${game.route} → games/${game.id}/public`);
  }
});

// ============================================================
// 3. Platform landing page (catch-all for /)
// ============================================================

app.use(express.static(path.join(__dirname, 'public')));

// ============================================================
// 4. Per-game Socket.IO namespaces
// ============================================================

getAll().forEach((game) => {
  const socketPath = path.join(gamesDir, game.id, 'socket.js');
  if (fs.existsSync(socketPath)) {
    const gameSocket = require(socketPath);
    if (typeof gameSocket.register === 'function') {
      gameSocket.register(io);
      console.log(`  🔌 Socket.IO namespace registered: /${game.id}`);
    }
  }
});

// ============================================================
// Start
// ============================================================

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🌙 After Dark Games platform running on http://localhost:${PORT}`);
  console.log(`   Games: ${getIds().join(', ')}`);
  console.log(`   Word packs: ${getPackList().map(p => `${p.id} (${p.wordCount})`).join(', ')}`);
  console.log('');
});
