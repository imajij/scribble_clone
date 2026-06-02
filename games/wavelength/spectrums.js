// ========================================
// WAVELENGTH — Spectrum Data
// ========================================
// Single source of truth for the opposite-label pairs used by both the
// server (round generation) and the client (label rendering via snapshot).
//
// Each entry: [leftLabel, rightLabel]  where 0 = left, 100 = right.
// A mix of fun + after-dark spicy prompts.

const SPECTRUMS = [
  ['Overrated', 'Underrated'],
  ['Totally Innocent', 'Absolutely Filthy'],
  ['Ick', 'Iconic'],
  ['Green Flag', 'Red Flag'],
  ['Boring', 'Unhinged'],
  ['Cringe', 'Based'],
  ['Sweet', 'Spicy'],
  ['A Turn-Off', 'A Turn-On'],
  ['Forgettable', 'Unforgettable'],
  ['Vanilla', 'Kinky'],
  ['Wholesome', 'Cursed'],
  ['Cheap Date', 'Lavish Date'],
  ['Friend Zone', 'Soulmate'],
  ['Mild', 'Wild'],
  ['Awkward', 'Smooth'],
  ['Big Turn Off in Bed', 'Big Turn On in Bed'],
  ['Underdressed', 'Overdressed'],
  ['Clingy', 'Distant'],
  ['Casual Fling', 'Marriage Material'],
  ['Total Buzzkill', 'Life of the Party'],
  ['Beige Flag', 'Major Red Flag'],
  ['Should Stay Secret', 'Should Be Public'],
  ['Sober Idea', 'Drunk Idea'],
  ['Tame Texts', 'Risky Texts'],
  ['Romantic', 'Trashy'],
  ['Slow Burn', 'Instant Spark'],
  ['Embarrassing', 'Impressive'],
  ['Bad Kisser', 'Great Kisser'],
  ['Keep It PG', 'Keep It NSFW'],
  ['Gentle', 'Rough'],
  ['Modest', 'Shameless'],
  ['A Bad Habit', 'A Power Move'],
  ['First-Date No-No', 'First-Date Win'],
  ['Quiet Night In', 'Chaotic Night Out'],
  ['Forgivable', 'Unforgivable'],
  ['A Compliment', 'An Insult'],
  ['Low-Key', 'Extra'],
  ['Soft Launch', 'Hard Launch'],
  ['Definitely Cheating', 'Totally Fine'],
  ['Worst Pickup Line', 'Best Pickup Line'],
  ['Comfort Zone', 'Bucket List'],
  ['A Total Gentleman', 'A Menace'],
  ['Would Never', 'Would Absolutely'],
  ['Settle Down', 'Stay Single'],
];

/**
 * Pick a random spectrum pair, optionally excluding a set of indices.
 * Returns { index, left, right } or null if none available.
 */
function getRandomSpectrum(exclude) {
  const available = [];
  for (let i = 0; i < SPECTRUMS.length; i++) {
    if (!exclude || !exclude.has(i)) available.push(i);
  }
  if (available.length === 0) return null;
  const index = available[Math.floor(Math.random() * available.length)];
  return { index, left: SPECTRUMS[index][0], right: SPECTRUMS[index][1] };
}

module.exports = { SPECTRUMS, getRandomSpectrum };
