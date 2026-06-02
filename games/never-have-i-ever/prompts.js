// ========================================
// NEVER HAVE I EVER — Prompt Bank
// ========================================
// Live confession game. Each prompt is a "Never have I ever ..." statement.
// Players secretly pick "I have 🙋" or "Never 🙅"; the reveal shows who's guilty.
//
// Heat levels (single source of truth shared with the server):
//   1 = mild     — silly / harmless
//   2 = spicy    — flirty / cheeky
//   3 = extreme  — NSFW / unhinged
//
// getPrompts(heat) returns every prompt AT OR BELOW the given heat,
// so a higher heat lobby still mixes in the tamer ones.

const HEAT = { MILD: 1, SPICY: 2, EXTREME: 3 };

const prompts = [
  // ── Mild (heat 1) — silly / harmless ──
  { text: 'pretended to be sick to skip something', heat: 1 },
  { text: 'sung in the shower at the top of my lungs', heat: 1 },
  { text: 'eaten food off the floor (5-second rule)', heat: 1 },
  { text: 'cried during a Disney movie', heat: 1 },
  { text: 'stalked an ex on social media', heat: 1 },
  { text: 'laughed so hard I snorted', heat: 1 },
  { text: 'fallen asleep in a public place', heat: 1 },
  { text: 'lied about my age', heat: 1 },
  { text: 'forgotten someone\'s name mid-conversation', heat: 1 },
  { text: 'rehearsed a conversation in the mirror', heat: 1 },
  { text: 'ghosted someone over text', heat: 1 },
  { text: 'eaten an entire pizza by myself', heat: 1 },
  { text: 'tripped in public and played it cool', heat: 1 },
  { text: 'pretended to laugh at a joke I didn\'t get', heat: 1 },
  { text: 'snooped through someone\'s phone', heat: 1 },
  { text: 'binged a whole series in one day', heat: 1 },
  { text: 'said "you too" when the waiter said "enjoy your meal"', heat: 1 },
  { text: 'worn the same outfit two days in a row', heat: 1 },
  { text: 'screenshotted a chat to send to a friend', heat: 1 },
  { text: 'googled my own name', heat: 1 },

  // ── Spicy (heat 2) — flirty / cheeky ──
  { text: 'sent a flirty text to the wrong person', heat: 2 },
  { text: 'had a crush on a friend\'s partner', heat: 2 },
  { text: 'kissed someone on a first date', heat: 2 },
  { text: 'lied about being single', heat: 2 },
  { text: 'made out with a stranger', heat: 2 },
  { text: 'had a one-night stand', heat: 2 },
  { text: 'dated two people at once', heat: 2 },
  { text: 'sent a risky photo', heat: 2 },
  { text: 'faked being interested to get a free drink', heat: 2 },
  { text: 'flirted to get out of a ticket or fine', heat: 2 },
  { text: 'hooked up with a coworker', heat: 2 },
  { text: 'gone skinny dipping', heat: 2 },
  { text: 'kissed someone whose name I forgot', heat: 2 },
  { text: 'crushed on a teacher or boss', heat: 2 },
  { text: 'sent a "u up?" text', heat: 2 },
  { text: 'used a dating app while in a relationship', heat: 2 },
  { text: 'left a date early by faking an emergency', heat: 2 },
  { text: 'slid into someone\'s DMs', heat: 2 },
  { text: 'kissed someone at a party I shouldn\'t have', heat: 2 },
  { text: 'lied about how many people I\'ve kissed', heat: 2 },

  // ── Extreme (heat 3) — NSFW / unhinged ──
  { text: 'had a friends-with-benefits situation', heat: 3 },
  { text: 'done it in a public place', heat: 3 },
  { text: 'used a fake name with a hookup', heat: 3 },
  { text: 'hooked up with someone\'s ex', heat: 3 },
  { text: 'sent a nude', heat: 3 },
  { text: 'had a threesome', heat: 3 },
  { text: 'role-played in the bedroom', heat: 3 },
  { text: 'been caught in the act', heat: 3 },
  { text: 'used a sex toy', heat: 3 },
  { text: 'had a one-night stand on vacation', heat: 3 },
  { text: 'cheated on a partner', heat: 3 },
  { text: 'fantasized about someone in this room', heat: 3 },
  { text: 'hooked up on the first date', heat: 3 },
  { text: 'done it somewhere I could have been caught', heat: 3 },
  { text: 'made a private video with a partner', heat: 3 },
  { text: 'rebounded the same night a relationship ended', heat: 3 },
  { text: 'hooked up with two people in one day', heat: 3 },
  { text: 'kept a secret hookup from everyone', heat: 3 },
  { text: 'said the wrong name in bed', heat: 3 },
  { text: 'lied about my "number"', heat: 3 },
];

/**
 * Get every prompt at or below the given heat level.
 * @param {number} heat — 1..3 (defaults to spicy)
 * @returns {Array<{text:string, heat:number}>}
 */
function getPrompts(heat = HEAT.SPICY) {
  const max = Math.min(Math.max(Number(heat) || HEAT.SPICY, HEAT.MILD), HEAT.EXTREME);
  return prompts.filter((p) => p.heat <= max);
}

/**
 * Pick a random prompt at or below `heat`, avoiding any in `usedSet`
 * (a Set of prompt texts). Resets the pool when exhausted.
 */
function getRandomPrompt(heat, usedSet) {
  const pool = getPrompts(heat);
  const fresh = pool.filter((p) => !usedSet.has(p.text));
  const source = fresh.length > 0 ? fresh : pool;
  if (fresh.length === 0) usedSet.clear();
  return source[Math.floor(Math.random() * source.length)];
}

module.exports = { prompts, getPrompts, getRandomPrompt, HEAT };
