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
const tracker = require('./playerTracker');

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

// Live player counts across all games (must be before :id route)
app.get('/api/games/status', (_req, res) => {
  const status = tracker.getStatus();
  const games = getAll().map(g => ({
    id: g.id,
    name: g.name,
    online: status[g.id] || 0
  }));
  res.json({ games, total: Object.values(status).reduce((s, n) => s + n, 0) });
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
    app.use(game.route, express.static(publicDir, { index: false, redirect: false }));
    console.log(`  📂 ${game.route} → games/${game.id}/public`);
  }
});

// ============================================================
// 3. Platform landing page + SPA shell
// ============================================================

app.use(express.static(path.join(__dirname, 'public')));

// SPA catch-all: serve index.html for any unmatched GET request
// (lets client-side router handle /scribble, /truth-live, /roulette, /story-builder)
const SPA_SHELL = path.join(__dirname, 'public', 'index.html');
app.get('/{*path}', (_req, res) => {
  res.sendFile(SPA_SHELL);
});

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
// 5. Platform Socket.IO — live player count broadcasting
// ============================================================

const platformNsp = io.of('/platform');

platformNsp.on('connection', (socket) => {
  // Send current counts immediately on connect
  socket.emit('playerCounts', tracker.getStatus());
});

// Broadcast to all homepage clients whenever any game's count changes
tracker.on('update', (status) => {
  platformNsp.emit('playerCounts', status);
});

// ============================================================
// 6. Hot-reload watcher (dev only)
// ============================================================

if (process.env.NODE_ENV !== 'production') {
  const chokidar = require('chokidar');
  const watchPaths = [
    path.join(__dirname, 'public'),
    path.join(__dirname, 'games', '**', 'public'),
  ];
  chokidar.watch(watchPaths, { ignoreInitial: true, usePolling: false })
    .on('change', (file) => {
      const rel = path.relative(__dirname, file);
      console.log(`  ♻️  Static file changed: ${rel} — reloading clients`);
      platformNsp.emit('hotReload', { file: rel });
    })
    .on('add', (file) => {
      const rel = path.relative(__dirname, file);
      platformNsp.emit('hotReload', { file: rel });
    });
  console.log('  🔥 Hot-reload watcher active (static files)');
}

// ============================================================
// 7. Keep-alive self-ping (prevents Render free tier spin-down)
// ============================================================

function startKeepAlive() {
  const selfUrl = process.env.RENDER_EXTERNAL_URL;
  if (!selfUrl) {
    console.log('  ⏭️  Keep-alive skipped (RENDER_EXTERNAL_URL not set)');
    return;
  }

  const pingUrl = `${selfUrl}/api/games`;
  const protocol = pingUrl.startsWith('https') ? require('https') : require('http');

  setInterval(() => {
    protocol.get(pingUrl, (res) => {
      res.resume(); // discard response body
    }).on('error', (err) => {
      console.warn('  ⚠️  Keep-alive ping failed:', err.message);
    });
  }, 14_000); // every 14 seconds

  console.log(`  💓 Keep-alive pinging ${pingUrl} every 14s`);
}

// ============================================================
// Start
// ============================================================

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🌙 After Dark Games platform running on http://localhost:${PORT}`);
  console.log(`   Games: ${getIds().join(', ')}`);
  console.log(`   Word packs: ${getPackList().map(p => `${p.id} (${p.wordCount})`).join(', ')}`);
  console.log('');
  startKeepAlive();
});
