// ========================================
// TITLES — Global end-of-game title assignment
// ========================================
// assignTitles(players, stats) → Map<playerId, {title, emoji, description}>
//
// players: Array<{ id, name, score }>
// stats:   Map<playerId, { chaosActions, redFlagsReceived, liesDetected, skipCount, correctGuesses }>

const TITLES = {
  menace:       { title: 'Certified Menace',       emoji: '😈', description: 'Maximum chaos energy' },
  dramaStarter: { title: 'Drama Starter',           emoji: '🎭', description: 'Started at least 3 drama moments' },
  greenFlag:    { title: 'Green Flag',              emoji: '🟩', description: 'Suspiciously well-behaved (Rare)' },
  redFlag:      { title: 'Walking Red Flag',        emoji: '🚩', description: 'Community concern' },
  survivor:     { title: 'Situationship Survivor',  emoji: '💀', description: 'Made it to the end somehow' },
};

export function assignTitles(players, stats) {
  if (!players || players.length === 0) return new Map();

  const result = new Map();

  // Find max values for each stat
  let maxChaos = 0, maxRedFlags = 0, maxLies = 0;
  players.forEach(p => {
    const s = (stats && stats.get ? stats.get(p.id) : null) || {};
    if ((s.chaosActions || 0) > maxChaos)    maxChaos    = s.chaosActions || 0;
    if ((s.redFlagsReceived || 0) > maxRedFlags) maxRedFlags = s.redFlagsReceived || 0;
    if ((s.liesDetected || 0) > maxLies)     maxLies     = s.liesDetected || 0;
  });

  players.forEach(p => {
    const s = (stats && stats.get ? stats.get(p.id) : null) || {};
    const chaos = s.chaosActions || 0;
    const red   = s.redFlagsReceived || 0;
    const lies  = s.liesDetected || 0;

    let assigned = 'survivor';

    if (maxChaos > 0 && chaos === maxChaos) {
      assigned = 'menace';
    } else if (maxLies > 0 && lies === maxLies && lies >= 2) {
      assigned = 'dramaStarter';
    } else if (maxRedFlags > 0 && red === maxRedFlags && red >= 2) {
      assigned = 'redFlag';
    } else if (red === 0 && lies === 0 && chaos === 0) {
      assigned = 'greenFlag';
    }

    result.set(p.id, TITLES[assigned]);
  });

  return result;
}

export function renderTitlesHTML(players, titles) {
  return players.map(p => {
    const t = titles.get(p.id) || TITLES.survivor;
    return (
      '<div class="title-card">' +
      '<span class="title-emoji">' + t.emoji + '</span>' +
      '<span class="title-name">' + escapeHtml(p.name) + '</span>' +
      '<span class="title-label">' + t.title + '</span>' +
      '</div>'
    );
  }).join('');
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(str));
  return d.innerHTML;
}
