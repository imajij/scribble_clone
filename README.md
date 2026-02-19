# 🌙 Scribble After Dark

> **The drawing & guessing game for grown-ups** — A real-time multiplayer Skribbl.io-style party game with an adults-only (18+) word list. Draw dirty, guess dirtier.

![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-5.x-000000?logo=express&logoColor=white)
![Socket.IO](https://img.shields.io/badge/Socket.IO-4.x-010101?logo=socket.io&logoColor=white)
![License](https://img.shields.io/badge/License-ISC-blue)

---

## 🎮 Live Demo

**[https://scribbleclone-production.up.railway.app](https://scribbleclone-production.up.railway.app)**

---

## ✨ Features

### Core Gameplay
- **Real-time multiplayer** — Draw and guess with friends via WebSocket (Socket.IO)
- **Room-based** — Create private rooms with 6-character codes or join from the active rooms list
- **Turn-based rounds** — Each player takes a turn drawing while others guess
- **Timed rounds** — 80-second draw timer with progressive letter hints
- **Smart scoring** — Points based on guess speed; drawer earns bonus per correct guesser
- **Close guess detection** — Alerts when a guess is within 1–2 characters of the answer

### Room Management
- **Room owner system** — Room creator (👑) is the only one who can start the game
- **Ownership transfer** — If the owner leaves, ownership auto-transfers to the next player
- **Join ongoing games** — Late-joiners spectate the current round (see live drawing, hints, timer) and participate from the next turn
- **Active rooms browser** — Lobby displays all joinable rooms with player count and status (Waiting / Playing)
- **Configurable rounds** — Choose 2, 3, 5, or 8 rounds per game

### Drawing Tools
- **12-color palette** — Black, white, red, orange, yellow, green, blue, purple, pink, brown, gray, cream
- **4 brush sizes** — Fine to thick strokes
- **Eraser** — Switch to eraser mode
- **Fill bucket** — Flood-fill tool for quick coloring
- **Undo** — Step back through drawing history
- **Clear canvas** — Wipe the entire canvas

### 18+ Word List
- **250+ adult-themed words** across 10 categories:
  - Anatomy & Body Parts
  - Bedroom Activities
  - Kink & Fetish
  - Adult Toys
  - Dirty Innuendos
  - Adult Entertainment
  - Risqué Clothing
  - Naughty Scenarios
  - Party & Drinking
  - Relationships

### UI / UX
- **Age gate** — 18+ verification screen before entry
- **Dark neon theme** — Purple/pink gradient aesthetic with glow effects
- **Fully responsive** — 4 CSS breakpoints (desktop → tablet → phone → landscape phone)
- **Viewport-locked game screen** — No scrolling during gameplay; players, canvas, and chat all fit on screen
- **Touch support** — Full drawing support on mobile/tablet devices
- **Real-time chat** — In-game chat with system messages, correct guess announcements, and close guess alerts

---

## 🏗️ Tech Stack

| Layer      | Technology                      |
|------------|---------------------------------|
| **Server** | Node.js + Express 5             |
| **Realtime** | Socket.IO 4                   |
| **Frontend** | Vanilla JS + HTML5 Canvas     |
| **Styling** | Custom CSS (CSS Variables)     |
| **Fonts**  | Google Fonts (Fredoka One, Nunito) |
| **Deploy** | Railway                         |

---

## 📁 Project Structure

```
scribble_clone/
├── server.js          # Express + Socket.IO server, room management, game orchestration
├── game.js            # Game state machine (waiting → choosing → drawing → gameOver)
├── words.js           # 18+ word list (250+ words, 10 categories)
├── package.json       # Dependencies & scripts
├── render.yaml        # Render deployment config (alternative)
├── .gitignore
└── public/
    ├── index.html     # Full UI — age gate, lobby, waiting room, game screen, overlays
    ├── style.css      # Dark theme + responsive layout (4 breakpoints)
    ├── canvas.js      # DrawingCanvas class — brush, eraser, fill, undo, touch events
    └── app.js         # Client-side Socket.IO handlers, DOM management, game flow
```

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher
- npm (comes with Node.js)

### Installation

```bash
# Clone the repo
git clone https://github.com/imajij/scribble_clone.git
cd scribble_clone

# Install dependencies
npm install

# Start the server
npm start
```

The server will start at **http://localhost:3000**.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT`   | `3000`  | Server port |
| `NODE_ENV` | —     | Set to `production` for deployment |

---

## 🎯 How to Play

1. **Open the app** and confirm you're 18+
2. **Enter your name** in the lobby
3. **Create a room** or **join** one via room code / active rooms list
4. **Wait** for at least 2 players
5. The **room owner** (👑) clicks **Start Game**
6. Each turn:
   - The **drawer** picks 1 of 3 words
   - Everyone else **guesses** in the chat
   - Letters are **revealed** as hints over time
   - Points are awarded based on **speed**
7. After all rounds, the **final scoreboard** shows the winner 🏆

---

## 🔧 Game Configuration

| Setting | Value | Location |
|---------|-------|----------|
| Max players per room | 8 | `server.js` |
| Turn duration | 80 seconds | `game.js` |
| Word choose duration | 15 seconds | `game.js` |
| Hint reveal timing | 40% and 65% of turn | `game.js` |
| Word choices per turn | 3 | `game.js` |
| Rounds options | 2, 3, 5, 8 | `index.html` |

---

## 🌐 Deployment

### Railway (Current)

The project is deployed on Railway. To deploy your own:

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login and deploy
railway login
railway init
railway up
```

Then generate a public domain under **Settings → Networking**.

### Render (Alternative)

A `render.yaml` is included. Connect your GitHub repo on [render.com](https://render.com) and it will auto-detect the config:

- **Build command:** `npm install`
- **Start command:** `node server.js`

### Other Platforms

Works on any Node.js host (Fly.io, Heroku, DigitalOcean, etc.) — just set the `PORT` environment variable and run `npm start`.

---

## 🔌 Socket.IO Events

### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `createRoom` | `{ playerName, rounds }` | Create a new room |
| `joinRoom` | `{ roomId, playerName }` | Join existing room (waiting or in-progress) |
| `startGame` | — | Start the game (owner only) |
| `wordChosen` | `word` | Drawer selects a word |
| `draw` | `{ x, y, ... }` | Drawing stroke data |
| `clearCanvas` | — | Clear the canvas |
| `chatMessage` | `message` | Send a chat message / guess |

### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `roomList` | `[{ id, players, state }]` | Active rooms for lobby browser |
| `joinedRoom` | `{ roomId, players, state, isOwner, gameState? }` | Joined a room (includes game state for mid-game joins) |
| `ownerUpdate` | `{ owner }` | Room ownership changed |
| `playerJoined` / `playerLeft` | `{ playerName, players }` | Player roster changes |
| `choosing` | `{ drawer, drawerName, roundNum }` | Drawer is choosing a word |
| `wordChoices` | `{ choices }` | Word options (sent to drawer only) |
| `turnStart` | `{ drawer, hint, duration }` | Drawing turn begins |
| `yourWord` | `{ word }` | The actual word (sent to drawer only) |
| `draw` | stroke data | Relayed drawing data |
| `hint` | `{ hint }` | Progressive letter reveal |
| `correctGuess` | `{ playerName, score }` | Someone guessed correctly |
| `turnEnd` | `{ word, scores }` | Turn over, word revealed |
| `gameOver` | `{ scores }` | Final scoreboard |

---

## 🤝 Contributing

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes (`git commit -m 'Add my feature'`)
4. Push to the branch (`git push origin feature/my-feature`)
5. Open a Pull Request

---

## 📜 License

This project is licensed under the **ISC License** — see the [package.json](package.json) for details.

---

## ⚠️ Disclaimer

This game contains **adult-themed content** intended for players aged **18 and older**. The word list includes explicit and suggestive terms. Play responsibly.

---

<p align="center">
  Made with 🔥 and way too much imagination
</p>
