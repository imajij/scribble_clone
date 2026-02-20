// ========================================
// Shared Identity — User name & session
// ========================================

const STORAGE_KEY = 'afterdark_identity';

function _get() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
  catch { return {}; }
}

function _set(obj) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
}

export function getPlayerName() {
  return _get().playerName || '';
}

export function setPlayerName(name) {
  const id = _get();
  id.playerName = name;
  _set(id);
}

export function getSessionId() {
  const id = _get();
  if (!id.sessionId) {
    id.sessionId = 'ad_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    _set(id);
  }
  return id.sessionId;
}
