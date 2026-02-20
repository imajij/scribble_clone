// ========================================
// DARE ROULETTE — Dare Bank
// ========================================
// Each dare: { id, text, category, intensity }
//   category  : 'physical' | 'social' | 'creative' | 'embarrassing' | 'wildcard'
//   intensity : 1 (mild) | 2 (medium) | 3 (extreme)

const dares = [
  // ── Physical ──
  { id: 1,  text: 'Do 15 push-ups right now — on camera.',                         category: 'physical',      intensity: 1 },
  { id: 2,  text: 'Hold a plank for 30 seconds while everyone counts.',             category: 'physical',      intensity: 1 },
  { id: 3,  text: 'Do your best impression of a yoga pose and hold it for 20 sec.', category: 'physical',      intensity: 1 },
  { id: 4,  text: 'Sprint to the nearest door, touch it, and sprint back.',          category: 'physical',      intensity: 1 },
  { id: 5,  text: 'Do 10 jumping jacks in the most dramatic way possible.',          category: 'physical',      intensity: 1 },
  { id: 6,  text: 'Balance a book on your head for 1 full minute.',                  category: 'physical',      intensity: 2 },
  { id: 7,  text: 'Do the worm (or attempt it) on the floor.',                       category: 'physical',      intensity: 2 },
  { id: 8,  text: 'Wall-sit for 45 seconds while singing a nursery rhyme.',          category: 'physical',      intensity: 2 },
  { id: 9,  text: 'Spin around 10 times, then try to walk in a straight line.',      category: 'physical',      intensity: 2 },
  { id: 10, text: 'Do a handstand (or try) against a wall for 15 seconds.',          category: 'physical',      intensity: 3 },
  { id: 11, text: 'Army-crawl across the room and back.',                            category: 'physical',      intensity: 3 },
  { id: 12, text: 'Do burpees until the next person spins.',                         category: 'physical',      intensity: 3 },

  // ── Social ──
  { id: 13, text: 'Text the 5th person in your contacts "I have a confession…" and screenshot the reply.', category: 'social', intensity: 2 },
  { id: 14, text: 'Call a friend and sing Happy Birthday — even if it\'s not their birthday.',              category: 'social', intensity: 2 },
  { id: 15, text: 'Post "I lost a bet" on your social media story.',                  category: 'social',      intensity: 2 },
  { id: 16, text: 'Let the group compose a text and send it to someone you choose.',  category: 'social',      intensity: 3 },
  { id: 17, text: 'DM your crush (or a random contact) a compliment right now.',      category: 'social',      intensity: 3 },
  { id: 18, text: 'Record a 10-sec voice note saying "I love you" and send it to a random contact.', category: 'social', intensity: 3 },
  { id: 19, text: 'Give a 30-second motivational speech to the group like a coach.',  category: 'social',      intensity: 1 },
  { id: 20, text: 'Compliment every other player — one unique compliment each.',      category: 'social',      intensity: 1 },
  { id: 21, text: 'Share the last photo in your camera roll with the group.',         category: 'social',      intensity: 2 },
  { id: 22, text: 'Read aloud the last text message you sent.',                       category: 'social',      intensity: 2 },

  // ── Creative ──
  { id: 23, text: 'Freestyle rap for 30 seconds about the person who spun before you.', category: 'creative',  intensity: 2 },
  { id: 24, text: 'Draw a portrait of the player to your left — in under 20 seconds.', category: 'creative',  intensity: 1 },
  { id: 25, text: 'Write a haiku about your current mood and read it aloud.',           category: 'creative',  intensity: 1 },
  { id: 26, text: 'Invent a new word and use it in three sentences.',                   category: 'creative',  intensity: 1 },
  { id: 27, text: 'Do an accent (British, Australian, etc.) for the next 2 minutes.',   category: 'creative',  intensity: 2 },
  { id: 28, text: 'Compose a 4-line love poem about pizza and recite it passionately.', category: 'creative',  intensity: 2 },
  { id: 29, text: 'Narrate the next 30 seconds of the room like a nature documentary.', category: 'creative',  intensity: 2 },
  { id: 30, text: 'Come up with a jingle for the player across from you in 15 seconds.', category: 'creative', intensity: 2 },
  { id: 31, text: 'Do a dramatic Shakespeare-style monologue about doing the dishes.',   category: 'creative',  intensity: 3 },
  { id: 32, text: 'Write and perform a 15-second stand-up comedy bit.',                  category: 'creative',  intensity: 3 },

  // ── Embarrassing ──
  { id: 33, text: 'Do your best celebrity impression and hold it for 20 seconds.',       category: 'embarrassing', intensity: 1 },
  { id: 34, text: 'Talk in a baby voice for the next 2 minutes.',                        category: 'embarrassing', intensity: 1 },
  { id: 35, text: 'Let another player style your hair however they want.',                category: 'embarrassing', intensity: 2 },
  { id: 36, text: 'Act out your most embarrassing moment in charades.',                   category: 'embarrassing', intensity: 2 },
  { id: 37, text: 'Wear your shirt inside-out for the rest of the game.',                 category: 'embarrassing', intensity: 2 },
  { id: 38, text: 'Do a runway walk across the room with commentary.',                    category: 'embarrassing', intensity: 2 },
  { id: 39, text: 'Let the group pick a song — you must dance to the whole chorus.',      category: 'embarrassing', intensity: 2 },
  { id: 40, text: 'Speak only in questions for the next 3 minutes.',                      category: 'embarrassing', intensity: 1 },
  { id: 41, text: 'Serenade the person to your right with a love song.',                  category: 'embarrassing', intensity: 3 },
  { id: 42, text: 'Do your best TikTok dance — no excuses.',                              category: 'embarrassing', intensity: 3 },
  { id: 43, text: 'Let the group give you a ridiculous nickname you must answer to.',      category: 'embarrassing', intensity: 2 },
  { id: 44, text: 'Mimic the last player who spun — voice, posture, everything.',         category: 'embarrassing', intensity: 2 },

  // ── Wildcard ──
  { id: 45, text: 'Swap an article of clothing with the person to your left.',            category: 'wildcard', intensity: 2 },
  { id: 46, text: 'Let the group decide your phone wallpaper for 24 hours.',              category: 'wildcard', intensity: 2 },
  { id: 47, text: 'Eat a spoonful of a condiment chosen by the group.',                   category: 'wildcard', intensity: 3 },
  { id: 48, text: 'Let someone draw on your face with a marker.',                         category: 'wildcard', intensity: 3 },
  { id: 49, text: 'Go outside and do 5 star jumps. Proof required.',                      category: 'wildcard', intensity: 2 },
  { id: 50, text: 'Close your eyes and let the group rearrange 3 things near you.',       category: 'wildcard', intensity: 1 },
  { id: 51, text: 'Speak in only movie quotes for the next 2 minutes.',                   category: 'wildcard', intensity: 1 },
  { id: 52, text: 'Take a selfie pulling your worst face and share it.',                  category: 'wildcard', intensity: 2 },
  { id: 53, text: 'Do everything with your non-dominant hand for the next 5 minutes.',    category: 'wildcard', intensity: 1 },
  { id: 54, text: 'Let the group write one word on your arm with a pen.',                 category: 'wildcard', intensity: 2 },
  { id: 55, text: 'Pick truth instead — answer any ONE question the group asks.',         category: 'wildcard', intensity: 3 },
  { id: 56, text: 'The dare is passed to the player of your choice — they must do it.',   category: 'wildcard', intensity: 3 },
];

// ── Categories ──
const CATEGORIES = ['physical', 'social', 'creative', 'embarrassing', 'wildcard'];

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
