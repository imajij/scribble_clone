// ========================================
// CONFESSIONS — Prompt Bank (Couples Edition 18+)
// ========================================
// Designed for couples / partners.
// Each prompt guides players to write a confession.
// heat: 1=mild, 2=spicy, 3=extreme

const PROMPTS = [
  // ── Mild (heat 1) ──
  { text: 'The first thing I noticed about my partner was…', heat: 1 },
  { text: 'Something adorable my partner does that they don\'t know I notice…', heat: 1 },
  { text: 'I secretly love it when my partner…', heat: 1 },
  { text: 'The cheesiest thing I\'ve done to impress my partner is…', heat: 1 },
  { text: 'I pretend not to care, but I actually love when my partner…', heat: 1 },
  { text: 'The most embarrassing thing I\'ve done around my partner is…', heat: 1 },
  { text: 'Something I was too nervous to say on our first date was…', heat: 1 },
  { text: 'I once lied to my partner about something small — it was…', heat: 1 },
  { text: 'My partner\'s habit that secretly drives me crazy is…', heat: 1 },
  { text: 'The moment I knew I was falling for my partner was when…', heat: 1 },
  { text: 'I\'ve stalked my partner\'s old social media posts and found…', heat: 1 },
  { text: 'Something I\'ve never had the courage to tell my partner is…', heat: 1 },
  { text: 'The silliest argument we\'ve had as a couple was about…', heat: 1 },
  { text: 'A weird habit I have that my partner doesn\'t know about yet…', heat: 1 },
  { text: 'The thing my partner does that instantly makes me smile is…', heat: 1 },

  // ── Spicy (heat 2) ──
  { text: 'The biggest thing I\'ve been too shy to ask my partner to try is…', heat: 2 },
  { text: 'I once had a dream about my partner that I never told them — it was…', heat: 2 },
  { text: 'The hottest thing my partner ever did without realizing it was…', heat: 2 },
  { text: 'Something I pretend not to enjoy in the bedroom but actually love is…', heat: 2 },
  { text: 'I\'ve been jealous of someone my partner interacts with — they are…', heat: 2 },
  { text: 'The most romantic thing I\'ve secretly planned (or wanted to plan) for my partner is…', heat: 2 },
  { text: 'I once faked something for my partner\'s sake — it was…', heat: 2 },
  { text: 'The outfit my partner wears that does something to me every time is…', heat: 2 },
  { text: 'If I could change one thing about our love life, it would be…', heat: 2 },
  { text: 'My secret fantasy involving my partner is…', heat: 2 },
  { text: 'Something I want my partner to do more of in bed is…', heat: 2 },
  { text: 'The time I was most turned on by my partner was when…', heat: 2 },
  { text: 'I\'ve compared my partner to someone else and the result was…', heat: 2 },
  { text: 'Something my partner whispered to me that I still think about is…', heat: 2 },
  { text: 'A place I\'ve secretly wanted to get intimate with my partner is…', heat: 2 },

  // ── Extreme (heat 3) ──
  { text: 'My deepest bedroom fantasy that I\'ve never shared with my partner is…', heat: 3 },
  { text: 'The kinkiest thing I\'ve ever wanted to try with my partner is…', heat: 3 },
  { text: 'Something I did before this relationship that would shock my partner…', heat: 3 },
  { text: 'If my partner could read my mind during sex, they\'d be surprised that I think about…', heat: 3 },
  { text: 'The most scandalous text I\'ve almost sent my partner is…', heat: 3 },
  { text: 'I once role-played (or wanted to role-play) a scenario with my partner — it was…', heat: 3 },
  { text: 'The wildest thing my partner and I have done together that nobody knows about is…', heat: 3 },
  { text: 'A sexual experience before my partner that shaped what I want now is…', heat: 3 },
  { text: 'If there were zero consequences, the one thing I\'d try with my partner tonight is…', heat: 3 },
  { text: 'The naughtiest thought I\'ve had about my partner in public is…', heat: 3 },
  { text: 'Something I\'ve watched or read that made me want to try it with my partner…', heat: 3 },
  { text: 'The most daring place I\'ve been intimate (or want to be) with my partner is…', heat: 3 },
  { text: 'I have a secret turn-on that I\'ve never admitted to anyone — it\'s…', heat: 3 },
  { text: 'The one taboo thing I\'d let my partner talk me into is…', heat: 3 },
  { text: 'If I wrote an anonymous confession about our love life, it would say…', heat: 3 },
];

/**
 * Get random prompts filtered by max heat level.
 * @param {number} maxHeat — 1, 2, or 3
 * @param {number} count — number of prompts needed
 * @param {Set} usedSet — set of used prompt texts to avoid duplicates
 * @returns {Array} array of prompt objects
 */
function getRandomPrompts(maxHeat, count, usedSet) {
  const pool = PROMPTS.filter(p => p.heat <= maxHeat && !usedSet.has(p.text));
  // Shuffle
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

function getPromptStats() {
  const byHeat = { 1: 0, 2: 0, 3: 0 };
  PROMPTS.forEach(p => byHeat[p.heat]++);
  return { total: PROMPTS.length, byHeat };
}

module.exports = { PROMPTS, getRandomPrompts, getPromptStats };
