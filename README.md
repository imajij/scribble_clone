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
- **Smart scoring** — Points based on guess speed (100–500 pts); drawer earns bonus (50–150 pts) per correct guesser
- **Close guess detection** — Alerts when a guess is within 1–2 characters of the answer
- **Auto-select** — If the drawer doesn't pick a word within 15 seconds, one is chosen automatically

### Room Management
- **Room owner system** — Room creator (👑) is the only one who can start the game
- **Ownership transfer** — If the owner leaves, ownership auto-transfers to the next player
- **Join ongoing games** — Late-joiners spectate the current round (see live drawing, hints, timer) and participate from the next turn
- **Active rooms browser** — Lobby displays all joinable rooms with player count and status (Waiting / Playing)
- **Configurable rounds** — Choose 2, 3, 5, or 8 rounds per game

### Session Persistence & Reconnection
- **Auto-reconnect** — If you disconnect (page refresh, network drop), the server holds your seat for 30 seconds
- **Session-based identity** — Uses `sessionStorage` to persist your session ID, room, and name across page reloads
- **State restoration** — Reconnected players get full game state: scores, drawing data, turn info, and ownership
- **Graceful degradation** — If the grace period expires, the seat is released and you can rejoin as a new player

### Drawing Tools
- **12-color palette** — Black, white, red, orange, yellow, green, blue, purple, pink, brown, gray, cream
- **4 brush sizes** — Fine (2px), medium (5px), thick (10px), and extra-thick (20px)
- **Eraser** — Switch to eraser mode (3× brush width)
- **Fill bucket** — Flood-fill tool with color tolerance for quick coloring
- **Undo** — Step back through drawing history (up to 20 snapshots)
- **Clear canvas** — Wipe the entire canvas

### 18+ Word Packs
- **5 selectable word packs** — chosen by the room owner at creation:
  | Pack | Description | Categories |
  |------|-------------|------------|
  | **Classic** | Innuendos, anatomy & bedroom basics | Anatomy, Bedroom Activities, Dirty Innuendos, Risqué Clothing |
  | **Extreme** | Kink, fetish & adult toys | Kink & Fetish, Adult Toys, Adult Entertainment, Naughty Scenarios |
  | **Romantic** | Bedroom activities, relationships & clothing | Bedroom Activities, Relationships, Risqué Clothing, Anatomy |
  | **Party** | Drinking games, scenarios & entertainment | Party & Drinking, Adult Entertainment, Naughty Scenarios, Dirty Innuendos |
  | **Mixed** *(default)* | Every category combined | All 10 categories (246 unique words) |

### UI / UX
- **Age gate** — 18+ verification screen before entry (remembered per session)
- **Dark neon theme** — Purple/pink gradient aesthetic with glow effects
- **Fully responsive** — 4 CSS breakpoints (desktop → tablet → phone → landscape phone)
- **Viewport-locked game screen** — No scrolling during gameplay; players, canvas, and chat all fit on screen
- **Touch support** — Full drawing support on mobile/tablet devices
- **Real-time chat** — In-game chat with system messages, correct guess announcements, and close guess alerts
- **Dynamic avatars** — Color-coded player avatars auto-assigned from a 15-color palette

---

## 🏗️ Tech Stack

| Layer        | Technology                          |
|--------------|-------------------------------------|
| **Server**   | Node.js + Express 5.2              |
| **Realtime** | Socket.IO 4.8                      |
| **Frontend** | Vanilla JS + HTML5 Canvas          |
| **Styling**  | Custom CSS (CSS Variables)         |
| **Fonts**    | Google Fonts (Fredoka One, Nunito) |
| **Deploy**   | Railway / Render                   |

---

## 📁 Project Structure

```
scribble_clone/
├── server.js          # Express + Socket.IO server, room management, game orchestration
├── game.js            # Game state machine (waiting → choosing → drawing → roundEnd → gameOver)
├── words.js           # 18+ word packs (5 packs from 10 categories, 246 unique words)
├── package.json       # Dependencies & scripts
├── render.yaml        # Render deployment config
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

| Variable   | Default | Description                        |
|------------|---------|------------------------------------|
| `PORT`     | `3000`  | Server port                        |
| `NODE_ENV` | —       | Set to `production` for deployment |

---

## 🎯 How to Play

1. **Open the app** and confirm you're 18+
2. **Enter your name** in the lobby
3. **Create a room** or **join** one via room code / active rooms list
4. **Wait** for at least 2 players
5. The **room owner** (👑) clicks **Start Game**
6. Each turn:
   - The **drawer** picks 1 of 3 words (or one is auto-selected after 15s)
   - Everyone else **guesses** in the chat
   - Letters are **revealed** as hints over time (at 40% and 65% of the turn)
   - Points are awarded based on **speed**
7. After all rounds, the **final scoreboard** shows the winner 🏆
8. If you get **disconnected**, just refresh — the server holds your seat for 30 seconds

---

## 🔧 Game Configuration

| Setting                  | Value           | Location     |
|--------------------------|-----------------|--------------|
| Max players per room     | 8               | `server.js`  |
| Turn duration            | 80 seconds      | `game.js`    |
| Word choose duration     | 15 seconds      | `game.js`    |
| Hint reveal timing       | 40% and 65%     | `game.js`    |
| Word choices per turn    | 3               | `game.js`    |
| Rounds options           | 2, 3, 5, 8     | `index.html` |
| Reconnect grace period   | 30 seconds      | `server.js`  |
| Undo history limit       | 20 snapshots    | `canvas.js`  |
| Flood-fill tolerance     | 30              | `canvas.js`  |

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

| Event              | Payload                                    | Description                                        |
|--------------------|--------------------------------------------|----------------------------------------------------|
| `reconnectSession` | `{ sessionId, roomId, playerName }`        | Attempt to reconnect to a held seat                |
| `createRoom`       | `{ playerName, rounds, sessionId, wordPack }` | Create a new room with selected word pack        |
| `joinRoom`         | `{ roomId, playerName, sessionId }`        | Join existing room (waiting or in-progress)        |
| `startGame`        | —                                          | Start the game (owner only)                        |
| `wordChosen`       | `word`                                     | Drawer selects a word                              |
| `draw`             | `{ type, x, y, color, size, canvasW, … }`  | Drawing stroke data (dot, line, or fill)           |
| `clearCanvas`      | —                                          | Clear the canvas                                   |
| `chatMessage`      | `message`                                  | Send a chat message / guess                        |

### Server → Client

| Event               | Payload                                            | Description                                                |
|---------------------|----------------------------------------------------|------------------------------------------------------------|
| `roomList`          | `[{ id, players, state, maxPlayers, wordPack }]`   | Active rooms for lobby browser                             |
| `joinedRoom`        | `{ roomId, players, state, isOwner, owner, wordPack, gameState?, reconnected? }` | Joined/reconnected to a room (includes game state for mid-game joins) |
| `reconnectFailed`   | `{ message }`                                      | Session reconnect was unsuccessful                         |
| `playerReconnected` | `{ playerName, players }`                          | A disconnected player reconnected                          |
| `ownerUpdate`       | `{ owner }`                                        | Room ownership changed                                     |
| `playerJoined`      | `{ playerName, players }`                          | A new player joined                                        |
| `playerLeft`        | `{ playerName, players, mayReconnect }`            | A player disconnected or left                              |
| `playerList`        | `[{ id, name, score, avatar, isDrawing }]`         | Updated player list with scores                            |
| `choosing`          | `{ drawer, drawerName, roundNum, maxRounds }`      | Drawer is choosing a word                                  |
| `wordChoices`       | `{ choices }`                                      | Word options (sent to drawer only)                         |
| `turnStart`         | `{ drawer, drawerName, hint, wordLength, duration }` | Drawing turn begins                                      |
| `yourWord`          | `{ word }`                                         | The actual word (sent to drawer only)                      |
| `draw`              | stroke data                                        | Relayed drawing data                                       |
| `clearCanvas`       | —                                                  | Canvas was cleared                                         |
| `hint`              | `{ hint }`                                         | Progressive letter reveal                                  |
| `correctGuess`      | `{ playerName, playerId, score }`                  | Someone guessed correctly                                  |
| `closeGuess`        | `{ message }`                                      | Guess was close (sent to guesser only)                     |
| `chatMessage`       | `{ playerName, playerId, message, color }`         | Chat message from a player                                 |
| `systemMessage`     | `{ message }`                                      | System notification (e.g. answer leak blocked)             |
| `turnEnd`           | `{ word, allGuessed, scores }`                     | Turn over, word revealed                                   |
| `gameOver`          | `{ scores }`                                       | Final scoreboard                                           |
| `gameReset`         | `{ message, players }`                             | Game reset (not enough players)                            |
| `error`             | `{ message }`                                      | Error notification                                         |

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
