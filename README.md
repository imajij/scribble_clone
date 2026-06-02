# 🌙 After Dark Games

> **Party games for grown-ups.** A real-time, multiplayer, 18+ party-game platform — draw, dare, confess, deduce and connect. Built on Node.js + Express + Socket.IO with a registry-driven, one-folder-per-game architecture and a shared **glassmorphism** design system.

![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-5.x-000000?logo=express&logoColor=white)
![Socket.IO](https://img.shields.io/badge/Socket.IO-4.x-010101?logo=socket.io&logoColor=white)
![Games](https://img.shields.io/badge/Games-14-b06bff)

---

## 🎮 The Games

Pick a vibe — **Couple Mode 💑** (intimate) or **Bachelor Mode 🍻** (chaos) — and jump into any of 14 games.

| Game | What it is | Players |
|---|---|---|
| 🎨 **Scribble After Dark** | Draw & guess, after-dark word packs | 2–8 |
| 💋 **Truth or Tease** | Hot-seat truths & teases, emoji reactions | 2–10 |
| 🤔 **This or That** | Would-you-rather, vote A/B, majority scoring | 2–20 |
| 🎭 **Scenario** | Anonymous answers to spicy scenarios, vote the best | 2–12 |
| 🤫 **Confessions** | Write anonymous confessions, guess the author | 2–16 |
| 🎰 **Dare Roulette** | Spin the wheel, complete the dare | 2–10 |
| 📝 **Story Builder** | Build a story together, one sentence at a time | 2–8 |
| 💑 **Couple Mode** | 6 flirty mini-games (Telepathy, Draw, Red/Green Flag…) | 2–10 |
| 🍻 **Bachelor Mode** | 6 unhinged mini-games (Sus Draw, Rizz, Lie Detector…) | 2–10 |
| 🙈 **Never Have I Ever** ✨ | Tap your sins — live confession tally | 2–16 |
| 🤥 **Two Truths & a Lie** ✨ | Spin two truths + one lie, fool the room | 3–12 |
| 📡 **Wavelength** ✨ | Read each other's minds on a spectrum | 2–12 |
| 🧠 **Trivia Showdown** ✨ | Buzz in, out-smart the room | 2–20 |
| 🕵️ **Mafia** ✨ | Social deduction — survive the night | 4–12 |

✨ = added in the revamp.

---

## ✨ Platform Features

- **Real-time multiplayer** — every game runs on its own Socket.IO namespace (`/scribble`, `/mafia`, …).
- **Room-based** — 6-character room codes, an active-rooms browser, owner controls, ownership auto-transfer.
- **Reconnection** — a 30-second grace period holds your seat across refreshes/drops; the snapshot restores full phase state, not just the screen.
- **Live presence** — a `/platform` namespace broadcasts per-game online counts to the lobby.
- **SPA shell** — one age gate, one shared identity, instant client-side navigation; each game's fragment + assets are lazy-loaded.
- **18+ gate** + shared player identity across every game.
- **Glassmorphism design system** — a single shared token + component layer (`public/shared/`) so all 14 games look cohesive and stay mobile-friendly.

---

## 🚀 Getting Started

```bash
npm install
npm run dev        # nodemon + hot-reload of static files
# or
npm start          # production
```

Then open **http://localhost:3000**.

Optional env: `PORT`, `REDIS_HOST` / `REDIS_PORT` (score cache — the app runs fine without Redis), `RENDER_EXTERNAL_URL` (keep-alive self-ping).

---

## 🏗️ Architecture

```
server.js              Express + Socket.IO bootstrap; iterates the registry to
                       mount each game's static dir + Socket.IO namespace.
gameRegistry.js        Central catalog — one object per game.
game.js  words.js      Scribble engine + word packs.
playerTracker.js       In-memory live player counts → /platform namespace.
redisCache.js          Optional, fail-soft score persistence.

public/
  index.html           SPA shell (age gate, navbar, #game-container).
  router.js            Client router: route table → fetch fragment + lazy-load assets.
  platform.css         Home / hubs / game cards (glass).
  shared/
    theme.css          Design tokens + premium background + navbar + age gate.
    components.css     Shared glass component library (buttons, lobby, game
                       layout, chat, overlays, badges, timers…).
    identity.js  agegate.js  navbar.js  chaosSystem.js  titles.js

games/<id>/
  socket.js            exports { register(io) } → io.of('/<id>')
  <gameClass>.js       state machine (rooms, turns, scoring, timers)
  public/
    fragment.html      SPA fragment (built from shared component classes)
    app.js             client (connects to /<id>, manages screens)
    style.css          :root accent override + game-specific glass bits only
```

### Design system

Every game inherits `shared/theme.css` (tokens, glass background, navbar, age gate) and `shared/components.css` (glass styling for the common in-game vocabulary). A game's own `style.css` only sets its `--accent` / `--accent-2` and styles the bits unique to it (canvas, vote bars, sliders, role cards…). This keeps the look cohesive and per-game CSS small.

### Adding a new game

1. Add an entry to `gameRegistry.js`.
2. Create `games/<id>/public/` with at least `fragment.html`, `app.js`, `style.css`.
3. (Realtime) add `games/<id>/socket.js` exporting `{ register(io) }`.
4. Add a route to `public/router.js` (`ROUTES`, `ICONS`, `COLORS`) and, if it should appear in a hub, to `COUPLE_GAME_IDS` / `BACHELOR_GAME_IDS`.

The server auto-discovers the static mount and socket namespace from the registry on boot.

---

## 🧪 Conventions

- Flow-driving `setTimeout`s are stored on the game and cleared in `clearTimers()`; callbacks re-check room + phase before acting.
- Reconnect / `joinedRoom` snapshots carry the **full** current-phase payload so a returning player can act immediately.
- Owner-only buttons (start / play again) are disabled for non-owners.
- Any vocabulary shared by client + server (categories, thresholds, durations) has a single source of truth.

---

## ⚠️ Content notice

After Dark Games is intended for adults (18+). Content ranges from flirty to explicit depending on the game and heat level.
