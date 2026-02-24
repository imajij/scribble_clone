// ========================================
// AFTER DARK GAMES — Redis Score Cache
// ========================================
// Gracefully wraps ioredis so that if Redis is not available the
// platform keeps running with in-memory data only.

let Redis;
try { Redis = require('ioredis'); } catch (_) { Redis = null; }

const SCORE_TTL_SECS = 7200; // 2 hours

let client = null;
let available = false;

function getClient() {
  if (client) return client;
  if (!Redis) return null;

  client = new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    lazyConnect: true,
    enableOfflineQueue: false,
    connectTimeout: 2000,
    maxRetriesPerRequest: 1,
  });

  client.on('ready', () => { available = true; console.log('[redis] Connected ✓'); });
  client.on('error', (err) => {
    if (available) console.warn('[redis] Error:', err.message);
    available = false;
  });
  client.on('close', () => { available = false; });

  // Attempt initial connect (non-blocking)
  client.connect().catch(() => {});
  return client;
}

// Initialise connection on module load
getClient();

// ── Key helper ──
function scoreKey(gameId, sessionId) {
  return `adg:score:${gameId}:${sessionId}`;
}

/**
 * Persist a player's score so it survives grace-period expiry / server restarts.
 * Fire-and-forget — never throws.
 */
async function saveScore(gameId, sessionId, score) {
  if (!sessionId || !available) return;
  try {
    await client.setex(scoreKey(gameId, sessionId), SCORE_TTL_SECS, String(score));
  } catch (e) {
    // silently ignore
  }
}

/**
 * Load a previously saved score.  Returns null when unavailable or not found.
 */
async function loadScore(gameId, sessionId) {
  if (!sessionId || !available) return null;
  try {
    const val = await client.get(scoreKey(gameId, sessionId));
    if (val === null) return null;
    const n = Number(val);
    return isNaN(n) ? null : n;
  } catch (e) {
    return null;
  }
}

/**
 * Remove a cached score (e.g. when game ends).
 */
async function deleteScore(gameId, sessionId) {
  if (!sessionId || !available) return;
  try {
    await client.del(scoreKey(gameId, sessionId));
  } catch (e) {
    // silently ignore
  }
}

module.exports = { saveScore, loadScore, deleteScore };
