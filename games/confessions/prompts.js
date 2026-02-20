// ========================================
// CONFESSIONS — Prompt Bank
// ========================================
// Each prompt guides players to write a confession.
// heat: 1=mild, 2=spicy, 3=extreme

const PROMPTS = [
  // ── Mild (heat 1) ──
  { text: 'The most embarrassing thing I\'ve done in public is…', heat: 1 },
  { text: 'My secret guilty pleasure is…', heat: 1 },
  { text: 'The weirdest thing I\'ve ever googled is…', heat: 1 },
  { text: 'I once pretended to like something just to impress someone. It was…', heat: 1 },
  { text: 'The pettiest thing I\'ve ever done is…', heat: 1 },
  { text: 'I have an irrational fear of…', heat: 1 },
  { text: 'The dumbest lie I ever told was…', heat: 1 },
  { text: 'Something I\'ve never told my best friend is…', heat: 1 },
  { text: 'My most cringe childhood memory is…', heat: 1 },
  { text: 'The most ridiculous thing I\'ve cried over is…', heat: 1 },
  { text: 'I once got caught…', heat: 1 },
  { text: 'My most unpopular opinion is…', heat: 1 },
  { text: 'The strangest habit I have is…', heat: 1 },
  { text: 'I once wasted money on…', heat: 1 },
  { text: 'Something that gives me the ick is…', heat: 1 },

  // ── Spicy (heat 2) ──
  { text: 'The biggest secret I\'m keeping from someone in this room is…', heat: 2 },
  { text: 'I once had a crush on someone completely inappropriate—they were…', heat: 2 },
  { text: 'The worst date I\'ve ever been on was when…', heat: 2 },
  { text: 'I once stalked someone\'s social media so deep that…', heat: 2 },
  { text: 'The most toxic thing I\'ve done in a relationship is…', heat: 2 },
  { text: 'I\'ve lied to get out of plans by saying…', heat: 2 },
  { text: 'My biggest regret involving alcohol is…', heat: 2 },
  { text: 'Something I did that I\'d be mortified if my parents found out…', heat: 2 },
  { text: 'I once faked…', heat: 2 },
  { text: 'The most savage thing I\'ve said to someone is…', heat: 2 },
  { text: 'I once broke up with / ghosted someone because…', heat: 2 },
  { text: 'My most questionable life choice was…', heat: 2 },
  { text: 'I secretly judge people who…', heat: 2 },
  { text: 'The most jealous I\'ve ever been was when…', heat: 2 },
  { text: 'I once threw someone under the bus by…', heat: 2 },

  // ── Extreme (heat 3) ──
  { text: 'The biggest lie I\'ve told someone I love is…', heat: 3 },
  { text: 'I once did something illegal and it was…', heat: 3 },
  { text: 'My most shameful hookup story is…', heat: 3 },
  { text: 'The darkest thought I\'ve had about someone here is…', heat: 3 },
  { text: 'Something I\'ve done that could ruin a friendship if it came out…', heat: 3 },
  { text: 'The most unhinged thing I\'ve done out of jealousy is…', heat: 3 },
  { text: 'I once betrayed someone\'s trust by…', heat: 3 },
  { text: 'My biggest "I can\'t believe I did that" moment is…', heat: 3 },
  { text: 'The worst thing I\'ve ever said behind someone\'s back is…', heat: 3 },
  { text: 'I have a secret that could change how everyone sees me—it\'s…', heat: 3 },
  { text: 'The most reckless decision I ever made at night was…', heat: 3 },
  { text: 'Something I did drunk that I will take to my grave is…', heat: 3 },
  { text: 'I once sent a text to the wrong person and it said…', heat: 3 },
  { text: 'My body count is actually…', heat: 3 },
  { text: 'The worst thing I\'ve done for money is…', heat: 3 },
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
