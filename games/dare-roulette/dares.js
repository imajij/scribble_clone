// ========================================
// DARE ROULETTE — Dare Bank (Couples Edition 18+)
// ========================================
// Designed for couples / partners.
// Each dare: { id, text, category, intensity }
//   category  : 'sensual' | 'romantic' | 'naughty' | 'tease' | 'wildcard'
//   intensity : 1 (mild) | 2 (medium) | 3 (extreme)

const dares = [
  // ── Sensual ──
  { id: 1,  text: 'Give your partner a 30-second shoulder massage.',                                                  category: 'sensual',   intensity: 1 },
  { id: 2,  text: 'Trace your finger slowly along your partner\'s jawline.',                                          category: 'sensual',   intensity: 1 },
  { id: 3,  text: 'Hold your partner\'s face in your hands and look into their eyes for 30 seconds — no talking.',    category: 'sensual',   intensity: 1 },
  { id: 4,  text: 'Whisper something you love about your partner\'s body in their ear.',                              category: 'sensual',   intensity: 2 },
  { id: 5,  text: 'Kiss your partner\'s neck for 10 seconds.',                                                        category: 'sensual',   intensity: 2 },
  { id: 6,  text: 'Feed your partner something using only your fingers.',                                              category: 'sensual',   intensity: 1 },
  { id: 7,  text: 'Give your partner a slow hand massage while maintaining eye contact.',                              category: 'sensual',   intensity: 1 },
  { id: 8,  text: 'Run your fingers through your partner\'s hair for 20 seconds.',                                    category: 'sensual',   intensity: 1 },
  { id: 9,  text: 'Blindfold your partner and let them guess where you\'re touching them.',                           category: 'sensual',   intensity: 3 },
  { id: 10, text: 'Kiss your partner\'s inner wrist and whisper a compliment.',                                        category: 'sensual',   intensity: 2 },
  { id: 11, text: 'Give your partner a back massage for 1 minute — they rate your technique after.',                   category: 'sensual',   intensity: 2 },
  { id: 12, text: 'Hold an ice cube in your mouth and kiss your partner\'s neck.',                                     category: 'sensual',   intensity: 3 },

  // ── Romantic ──
  { id: 13, text: 'Look your partner in the eyes and list 3 reasons you fell for them.',                               category: 'romantic',  intensity: 1 },
  { id: 14, text: 'Slow dance with your partner for 30 seconds — no music needed.',                                   category: 'romantic',  intensity: 1 },
  { id: 15, text: 'Write a two-line love note to your partner and read it aloud.',                                     category: 'romantic',  intensity: 1 },
  { id: 16, text: 'Recreate the moment you first kissed your partner — as accurately as you can.',                    category: 'romantic',  intensity: 2 },
  { id: 17, text: 'Serenade your partner with any love song — full commitment.',                                       category: 'romantic',  intensity: 2 },
  { id: 18, text: 'Hold your partner close and describe your dream future together.',                                  category: 'romantic',  intensity: 1 },
  { id: 19, text: 'Give your partner a forehead kiss and tell them one thing they make better in your life.',          category: 'romantic',  intensity: 1 },
  { id: 20, text: 'Describe in detail the perfect date night with your partner.',                                      category: 'romantic',  intensity: 1 },
  { id: 21, text: 'Send your partner the sweetest text you can write — right now, even though they\'re next to you.', category: 'romantic',  intensity: 1 },
  { id: 22, text: 'Do a dramatic "movie confession of love" scene starring your partner.',                             category: 'romantic',  intensity: 2 },

  // ── Naughty ──
  { id: 23, text: 'Do a slow, 20-second strip tease — at least one layer must come off.',                             category: 'naughty',   intensity: 3 },
  { id: 24, text: 'Sit on your partner\'s lap and whisper your biggest turn-on.',                                     category: 'naughty',   intensity: 3 },
  { id: 25, text: 'Let your partner draw something on your body with their finger — you guess what it is.',           category: 'naughty',   intensity: 2 },
  { id: 26, text: 'Demonstrate your best "come here" look for your partner.',                                          category: 'naughty',   intensity: 2 },
  { id: 27, text: 'Describe what you want to do to your partner after this game — in detail.',                         category: 'naughty',   intensity: 3 },
  { id: 28, text: 'Remove one article of your partner\'s clothing — slowly.',                                          category: 'naughty',   intensity: 3 },
  { id: 29, text: 'Give your partner a lap dance for 20 seconds.',                                                    category: 'naughty',   intensity: 3 },
  { id: 30, text: 'Whisper the filthiest compliment you can think of in your partner\'s ear.',                         category: 'naughty',   intensity: 3 },
  { id: 31, text: 'Let your partner take a suggestive photo of you (for their eyes only).',                           category: 'naughty',   intensity: 3 },
  { id: 32, text: 'Act out your partner\'s favorite bedroom move using only gestures.',                                category: 'naughty',   intensity: 3 },

  // ── Tease ──
  { id: 33, text: 'Bite your lip while making eye contact with your partner for 15 seconds.',                         category: 'tease',     intensity: 1 },
  { id: 34, text: 'Do your sexiest walk across the room for your partner.',                                            category: 'tease',     intensity: 2 },
  { id: 35, text: 'Describe your partner\'s best physical feature — in the most flattering way possible.',            category: 'tease',     intensity: 1 },
  { id: 36, text: 'Let your partner choose a body part — you have to kiss it.',                                        category: 'tease',     intensity: 2 },
  { id: 37, text: 'Lean in like you\'re about to kiss your partner… then pull away at the last second. Repeat twice.', category: 'tease',    intensity: 2 },
  { id: 38, text: 'Text your partner something flirty as if you just started dating.',                                 category: 'tease',     intensity: 1 },
  { id: 39, text: 'Mimic your partner\'s "bedroom voice" — let them judge the accuracy.',                             category: 'tease',     intensity: 2 },
  { id: 40, text: 'Your partner picks a song — you have to dance seductively to the chorus.',                          category: 'tease',     intensity: 2 },
  { id: 41, text: 'Pose for your partner like a model in a sexy photoshoot. Hold it for 10 seconds.',                 category: 'tease',     intensity: 2 },
  { id: 42, text: 'Describe the outfit your partner could wear that would drive you wild.',                            category: 'tease',     intensity: 2 },
  { id: 43, text: 'Play with the hem of your shirt like you\'re about to take it off — but don\'t.',                  category: 'tease',     intensity: 2 },
  { id: 44, text: 'Breathe softly on your partner\'s neck without touching them. 10 seconds.',                        category: 'tease',     intensity: 3 },

  // ── Wildcard ──
  { id: 45, text: 'Swap an article of clothing with your partner.',                                                    category: 'wildcard',  intensity: 2 },
  { id: 46, text: 'Let your partner set your phone wallpaper to a couples photo of their choice.',                     category: 'wildcard',  intensity: 1 },
  { id: 47, text: 'Your partner picks a dare from any category — you must do it, no complaints.',                     category: 'wildcard',  intensity: 3 },
  { id: 48, text: 'Take a couples selfie in the most romantic pose you can manage right now.',                         category: 'wildcard',  intensity: 1 },
  { id: 49, text: 'Let your partner ask you any one question — you MUST answer honestly.',                            category: 'wildcard',  intensity: 3 },
  { id: 50, text: 'Role-play introducing yourself to your partner as if you\'re meeting for the first time — flirt hard.', category: 'wildcard', intensity: 2 },
  { id: 51, text: 'Close your eyes while your partner guides your hand somewhere on their body. Guess where.',        category: 'wildcard',  intensity: 3 },
  { id: 52, text: 'Make up a couples secret handshake — it must include at least one kiss.',                           category: 'wildcard',  intensity: 1 },
  { id: 53, text: 'Your partner picks your outfit for tomorrow. No vetoes.',                                           category: 'wildcard',  intensity: 2 },
  { id: 54, text: 'Create a 10-second TikTok-style couples video together.',                                          category: 'wildcard',  intensity: 1 },
  { id: 55, text: 'Confess something to your partner you\'ve been holding back — big or small.',                      category: 'wildcard',  intensity: 3 },
  { id: 56, text: 'Your partner dares you — they whisper a custom dare right now. You must do it.',                    category: 'wildcard',  intensity: 3 },
];

// ── Categories ──
const CATEGORIES = ['sensual', 'romantic', 'naughty', 'tease', 'wildcard'];

/**
 * Get a random dare, optionally filtered.
 * @param {Object} opts
 * @param {string[]} [opts.categories] - Subset of CATEGORIES to pick from
 * @param {number}   [opts.maxIntensity] - 1 | 2 | 3
 * @param {Set}      [opts.exclude] - Set of dare ids to skip
 * @returns {{ id, text, category, intensity } | null}
 */
function getRandomDare({ categories, maxIntensity = 3, exclude } = {}) {
  let pool = dares;
  if (categories && categories.length > 0) {
    pool = pool.filter(d => categories.includes(d.category));
  }
  pool = pool.filter(d => d.intensity <= maxIntensity);
  if (exclude && exclude.size > 0) {
    pool = pool.filter(d => !exclude.has(d.id));
  }
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Get multiple random dares (no repeats within the result).
 */
function getRandomDares(count, opts = {}) {
  const picked = [];
  const localExclude = new Set(opts.exclude || []);
  for (let i = 0; i < count; i++) {
    const d = getRandomDare({ ...opts, exclude: localExclude });
    if (!d) break;
    picked.push(d);
    localExclude.add(d.id);
  }
  return picked;
}

function getDareStats() {
  const byCat = {};
  CATEGORIES.forEach(c => { byCat[c] = dares.filter(d => d.category === c).length; });
  return { total: dares.length, byCategory: byCat };
}

module.exports = { dares, CATEGORIES, getRandomDare, getRandomDares, getDareStats };
