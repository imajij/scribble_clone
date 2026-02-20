// ========================================
// SCENARIO — Scenario Bank
// ========================================
// Each scenario: { id, text, category, intensity }
//   category  : 'awkward' | 'spicy' | 'absurd' | 'moral' | 'wildcard'
//   intensity : 1 (mild) | 2 (medium) | 3 (extreme)

const scenarios = [
  // ── Awkward ──
  { id: 1,   text: 'You accidentally send a very personal text to your boss. What do you do?',                         category: 'awkward',  intensity: 1 },
  { id: 2,   text: 'You walk into the wrong wedding and everyone thinks you\'re a guest. How do you handle it?',       category: 'awkward',  intensity: 1 },
  { id: 3,   text: 'You wave back at someone who wasn\'t waving at you — in front of 50 people. What now?',            category: 'awkward',  intensity: 1 },
  { id: 4,   text: 'Your ex sits down right next to you on a 12-hour flight. What\'s your move?',                      category: 'awkward',  intensity: 2 },
  { id: 5,   text: 'You\'re on a first date and accidentally call them by your ex\'s name. How do you recover?',       category: 'awkward',  intensity: 2 },
  { id: 6,   text: 'You accidentally "like" your crush\'s photo from 3 years ago at 2 AM. What do you do?',            category: 'awkward',  intensity: 1 },
  { id: 7,   text: 'You\'re stuck in an elevator with the person who fired you last week. What happens?',              category: 'awkward',  intensity: 2 },
  { id: 8,   text: 'Your phone reads your most embarrassing search out loud via Siri in a meeting. What do you say?',  category: 'awkward',  intensity: 3 },
  { id: 9,   text: 'You realize you\'ve been on mute for a 30-minute presentation. How do you restart?',               category: 'awkward',  intensity: 1 },
  { id: 10,  text: 'You show up to a costume party but it\'s actually a formal dinner. What do you do?',               category: 'awkward',  intensity: 1 },
  { id: 11,  text: 'You run into someone and confidently greet them — but you have NO idea who they are. Go.',         category: 'awkward',  intensity: 1 },
  { id: 12,  text: 'Your stomach growls LOUDLY during a moment of silence at a funeral. How do you react?',            category: 'awkward',  intensity: 2 },
  { id: 13,  text: 'You accidentally send a screenshot of a conversation TO the person in the screenshot. Go.',        category: 'awkward',  intensity: 3 },
  { id: 14,  text: 'You trip and fall on stage in front of 500 people. How do you play it off?',                       category: 'awkward',  intensity: 2 },
  { id: 15,  text: 'You open your laptop in class and it auto-plays the last video you watched — LOUDLY. React.',      category: 'awkward',  intensity: 2 },
  { id: 16,  text: 'You\'re introduced to someone and immediately forget their name. You need it in 5 seconds.',       category: 'awkward',  intensity: 1 },
  { id: 17,  text: 'You realize you\'ve had spinach in your teeth during your entire job interview. What now?',         category: 'awkward',  intensity: 1 },
  { id: 18,  text: 'You walk into a glass door at a fancy restaurant while everyone watches. What do you do?',         category: 'awkward',  intensity: 1 },
  { id: 19,  text: 'You pocket-dial someone while talking about them. They heard everything. How do you handle it?',   category: 'awkward',  intensity: 3 },
  { id: 20,  text: 'You\'re at a party and someone asks when you\'re due — you\'re not pregnant. React.',              category: 'awkward',  intensity: 2 },

  // ── Spicy ──
  { id: 21,  text: 'Your partner\'s best friend confesses feelings for you. What do you do?',                          category: 'spicy',    intensity: 2 },
  { id: 22,  text: 'You find a flirty DM on your partner\'s phone from someone you know. What\'s the play?',           category: 'spicy',    intensity: 3 },
  { id: 23,  text: 'Two people you\'re dating show up at the same party. How do you handle it?',                       category: 'spicy',    intensity: 3 },
  { id: 24,  text: 'Your celebrity crush DMs you but you\'re in a relationship. What do you do?',                      category: 'spicy',    intensity: 2 },
  { id: 25,  text: 'Someone offers you $10,000 to NOT talk to your best friend for a year. Do you take it?',           category: 'spicy',    intensity: 2 },
  { id: 26,  text: 'Your best friend\'s partner is hitting on you at a party. What do you do?',                        category: 'spicy',    intensity: 3 },
  { id: 27,  text: 'You can read minds for one day but you can\'t turn it off. How do you survive a date?',            category: 'spicy',    intensity: 1 },
  { id: 28,  text: 'You match with your friend\'s ex on a dating app. Swipe right or left? Explain.',                  category: 'spicy',    intensity: 2 },
  { id: 29,  text: 'You\'re dared to text your most recent ex "I miss us." Do you do it? What happens next?',          category: 'spicy',    intensity: 3 },
  { id: 30,  text: 'Someone very attractive asks for your number right in front of your partner. React.',              category: 'spicy',    intensity: 2 },
  { id: 31,  text: 'Your ex wants to get back together and your current relationship is rocky. What do you choose?',   category: 'spicy',    intensity: 3 },
  { id: 32,  text: 'You find out your date has been live-streaming the entire dinner. What do you do?',                category: 'spicy',    intensity: 2 },
  { id: 33,  text: 'You accidentally match with your boss on a dating app. How do you handle Monday?',                 category: 'spicy',    intensity: 2 },
  { id: 34,  text: 'Your partner asks you to rate them honestly out of 10 in front of friends. What\'s your move?',    category: 'spicy',    intensity: 2 },
  { id: 35,  text: 'A fortune teller says your current relationship ends in 6 months. Do you act differently?',        category: 'spicy',    intensity: 1 },
  { id: 36,  text: 'You discover your partner has a secret Instagram account. What do you do?',                        category: 'spicy',    intensity: 2 },
  { id: 37,  text: 'Your best friend asks you to be their fake date to make an ex jealous. Do you agree?',             category: 'spicy',    intensity: 1 },
  { id: 38,  text: 'You find out your new date is your sibling\'s ex. Do you keep dating them?',                       category: 'spicy',    intensity: 2 },
  { id: 39,  text: 'Your partner\'s parent low-key flirts with you every holiday. How do you deal with it?',           category: 'spicy',    intensity: 3 },
  { id: 40,  text: 'You\'re offered a free trip to Bali but you MUST go with your most annoying ex. Take it?',         category: 'spicy',    intensity: 2 },

  // ── Absurd ──
  { id: 41,  text: 'You wake up and you\'re now the president. Your first 3 executive orders?',                        category: 'absurd',   intensity: 1 },
  { id: 42,  text: 'All animals can now talk. What\'s the most awkward conversation you\'d have?',                      category: 'absurd',   intensity: 1 },
  { id: 43,  text: 'You can only communicate through song lyrics for a week. How do you order coffee?',                category: 'absurd',   intensity: 1 },
  { id: 44,  text: 'You swap bodies with your pet for 24 hours. What\'s your plan?',                                   category: 'absurd',   intensity: 1 },
  { id: 45,  text: 'Gravity reverses for 10 minutes. Where are you and what do you do?',                               category: 'absurd',   intensity: 1 },
  { id: 46,  text: 'You\'re shrunk to 2 inches tall at work. How do you survive the day?',                             category: 'absurd',   intensity: 1 },
  { id: 47,  text: 'Your Google search history is projected on a billboard in Times Square. How do you react?',         category: 'absurd',   intensity: 3 },
  { id: 48,  text: 'Every lie you\'ve ever told appears as a tattoo on your body. Which one are you most worried about?', category: 'absurd', intensity: 2 },
  { id: 49,  text: 'You can only eat one food for the rest of your life but it\'s the last thing you Googled. What is it?', category: 'absurd', intensity: 1 },
  { id: 50,  text: 'You find a button that pauses time for everyone except you. What do you do first?',                category: 'absurd',   intensity: 2 },
  { id: 51,  text: 'An alien lands in your backyard and asks you to explain humanity in 30 seconds. Go.',              category: 'absurd',   intensity: 1 },
  { id: 52,  text: 'You become invisible but ONLY when you\'re embarrassed. Describe your worst day.',                 category: 'absurd',   intensity: 2 },
  { id: 53,  text: 'Every time you sneeze, $100 appears but a random person loses their pants. Do you sneeze more?',   category: 'absurd',   intensity: 2 },
  { id: 54,  text: 'You can travel back in time but you arrive naked every time. When and where do you go?',           category: 'absurd',   intensity: 2 },
  { id: 55,  text: 'You must survive 24 hours in IKEA with no phone. What\'s your strategy?',                          category: 'absurd',   intensity: 1 },
  { id: 56,  text: 'You discover you\'re actually a side character in someone else\'s sitcom. What\'s your catchphrase?', category: 'absurd', intensity: 1 },
  { id: 57,  text: 'Every emoji you\'ve ever sent becomes a real creature. Which one attacks first?',                  category: 'absurd',   intensity: 1 },
  { id: 58,  text: 'You\'re given a pet dragon but you live in an apartment. How do you make it work?',                category: 'absurd',   intensity: 1 },
  { id: 59,  text: 'A zombie apocalypse starts but the zombies are polite and just want to chat. How do you cope?',    category: 'absurd',   intensity: 1 },
  { id: 60,  text: 'You win a lifetime supply of the last thing you complained about. What is it?',                    category: 'absurd',   intensity: 1 },

  // ── Moral ──
  { id: 61,  text: 'You find a wallet with $5,000 cash and an ID. Do you return it? What if you really need the money?', category: 'moral', intensity: 1 },
  { id: 62,  text: 'You can save 5 strangers or 1 close friend. Who do you choose and why?',                           category: 'moral',    intensity: 3 },
  { id: 63,  text: 'You witness your best friend cheating on an exam. Do you report them?',                            category: 'moral',    intensity: 2 },
  { id: 64,  text: 'You discover your company is doing something illegal but reporting it means losing your job. Go.',  category: 'moral',    intensity: 3 },
  { id: 65,  text: 'A genie grants one wish but someone you dislike gets double. What do you wish for?',               category: 'moral',    intensity: 1 },
  { id: 66,  text: 'You can erase one memory from everyone\'s mind. Which memory do you choose?',                      category: 'moral',    intensity: 2 },
  { id: 67,  text: 'You find out your friend\'s partner is cheating. Do you tell them? How?',                          category: 'moral',    intensity: 3 },
  { id: 68,  text: 'You\'re offered your dream job but your best friend also applied and you know they need it more.',  category: 'moral',    intensity: 2 },
  { id: 69,  text: 'You can know the exact date of your death. Do you want to know? Why or why not?',                  category: 'moral',    intensity: 2 },
  { id: 70,  text: 'You can undo one mistake from your past but it changes the present. Do you do it?',                category: 'moral',    intensity: 2 },
  { id: 71,  text: 'You win $1 million but you must cut contact with one friend forever. Who and would you do it?',    category: 'moral',    intensity: 3 },
  { id: 72,  text: 'You can make one law that everyone must follow. What is it?',                                      category: 'moral',    intensity: 1 },
  { id: 73,  text: 'A stranger asks you to lie to the police to save their innocent family member. Do you help?',      category: 'moral',    intensity: 3 },
  { id: 74,  text: 'You can read everyone\'s thoughts but they also know you can. How does your life change?',         category: 'moral',    intensity: 1 },
  { id: 75,  text: 'You\'re on a lifeboat with 6 people but it only holds 4. How do you decide who stays?',           category: 'moral',    intensity: 3 },
  { id: 76,  text: 'You find proof that your childhood hero is a terrible person. Do you expose them?',                category: 'moral',    intensity: 2 },
  { id: 77,  text: 'You can guarantee world peace but no one will ever know it was because of you. Worth it?',         category: 'moral',    intensity: 1 },
  { id: 78,  text: 'Your friend confides a serious secret in you but keeping it could hurt someone else. What do you do?', category: 'moral', intensity: 2 },
  { id: 79,  text: 'You accidentally overhear your friend group ranking you. Do you confront them?',                   category: 'moral',    intensity: 2 },
  { id: 80,  text: 'A stranger online sends you proof of a crime. Do you get involved?',                               category: 'moral',    intensity: 2 },

  // ── Wildcard ──
  { id: 81,  text: 'You have 60 seconds to hide a giraffe from the police. What\'s your plan?',                        category: 'wildcard', intensity: 1 },
  { id: 82,  text: 'You must pitch the WORST business idea possible and convince investors to fund it. Go.',            category: 'wildcard', intensity: 1 },
  { id: 83,  text: 'You\'re a villain in a movie. What\'s your evil scheme and what\'s your fatal flaw?',              category: 'wildcard', intensity: 1 },
  { id: 84,  text: 'Design the most chaotic theme park ride ever. What\'s it called and what happens on it?',          category: 'wildcard', intensity: 1 },
  { id: 85,  text: 'You wake up 500 years in the future. What\'s the first question you ask?',                         category: 'wildcard', intensity: 1 },
  { id: 86,  text: 'You must give a TED talk on a topic you know NOTHING about. Choose the topic and wing it.',        category: 'wildcard', intensity: 2 },
  { id: 87,  text: 'You can add one ridiculous rule to any sport. Which sport and what rule?',                          category: 'wildcard', intensity: 1 },
  { id: 88,  text: 'You\'re writing the fortune cookie message that will go to 1 million people. What does it say?',   category: 'wildcard', intensity: 1 },
  { id: 89,  text: 'Describe your life as a clickbait article headline.',                                              category: 'wildcard', intensity: 1 },
  { id: 90,  text: 'You must create a new holiday. What is it, when is it, and how do people celebrate?',              category: 'wildcard', intensity: 1 },
  { id: 91,  text: 'You\'re a ghost haunting your own house. What petty things do you do?',                            category: 'wildcard', intensity: 1 },
  { id: 92,  text: 'You can only speak in questions for 24 hours. How do you order food? Get through work?',           category: 'wildcard', intensity: 1 },
  { id: 93,  text: 'You must plan the worst possible surprise party. What goes wrong?',                                category: 'wildcard', intensity: 1 },
  { id: 94,  text: 'You become the CEO of the last company whose product you used. What changes do you make?',         category: 'wildcard', intensity: 1 },
  { id: 95,  text: 'You\'re trapped in the last TV show you watched. How do you survive the storyline?',               category: 'wildcard', intensity: 1 },
  { id: 96,  text: 'Create a conspiracy theory about something in this room. Make it convincing.',                      category: 'wildcard', intensity: 2 },
  { id: 97,  text: 'You must explain the internet to someone from 1800. How do you do it without sounding insane?',    category: 'wildcard', intensity: 1 },
  { id: 98,  text: 'You get to rename any country. Which one and why?',                                                category: 'wildcard', intensity: 1 },
  { id: 99,  text: 'You have an unlimited budget to prank ONE world leader. What do you do?',                          category: 'wildcard', intensity: 2 },
  { id: 100, text: 'Describe the most useless superpower and explain how you\'d still use it to take over the world.',  category: 'wildcard', intensity: 1 },
  { id: 101, text: 'You\'re stuck in a time loop of the most boring day ever. How do you make it entertaining?',       category: 'wildcard', intensity: 1 },
  { id: 102, text: 'Write a 1-star review of a place that doesn\'t exist.',                                            category: 'wildcard', intensity: 1 },
  { id: 103, text: 'You can swap lives with anyone for a week but they live yours too. Who do you pick?',              category: 'wildcard', intensity: 2 },
  { id: 104, text: 'You have to survive on a deserted island with only the last 3 things you bought. How screwed are you?', category: 'wildcard', intensity: 1 },
  { id: 105, text: 'A movie is being made about your life. What\'s the title and who plays you?',                      category: 'wildcard', intensity: 1 },
];

// ── Categories ──
const CATEGORIES = ['awkward', 'spicy', 'absurd', 'moral', 'wildcard'];

/**
 * Get a random scenario, optionally filtered.
 * @param {Object} opts
 * @param {string[]} [opts.categories] - Subset of CATEGORIES to pick from
 * @param {number}   [opts.maxIntensity] - 1 | 2 | 3
 * @param {Set}      [opts.exclude] - Set of scenario ids to skip
 * @returns {{ id, text, category, intensity } | null}
 */
function getRandomScenario({ categories, maxIntensity = 3, exclude } = {}) {
  let pool = scenarios;
  if (categories && categories.length > 0) {
    pool = pool.filter(s => categories.includes(s.category));
  }
  pool = pool.filter(s => s.intensity <= maxIntensity);
  if (exclude && exclude.size > 0) {
    pool = pool.filter(s => !exclude.has(s.id));
  }
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Get multiple random scenarios (no repeats).
 */
function getRandomScenarios(count, opts = {}) {
  const picked = [];
  const localExclude = new Set(opts.exclude || []);
  for (let i = 0; i < count; i++) {
    const s = getRandomScenario({ ...opts, exclude: localExclude });
    if (!s) break;
    picked.push(s);
    localExclude.add(s.id);
  }
  return picked;
}

function getScenarioStats() {
  const byCat = {};
  CATEGORIES.forEach(c => { byCat[c] = scenarios.filter(s => s.category === c).length; });
  return { total: scenarios.length, byCategory: byCat };
}

module.exports = { scenarios, CATEGORIES, getRandomScenario, getRandomScenarios, getScenarioStats };
