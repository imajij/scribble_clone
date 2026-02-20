// ========================================
// SCENARIO — Scenario Bank (Couples Edition 18+)
// ========================================
// Designed for couples / partners.
// Each scenario: { id, text, category, intensity }
//   category  : 'romantic' | 'spicy' | 'fantasy' | 'awkward' | 'wildcard'
//   intensity : 1 (mild) | 2 (medium) | 3 (extreme)

const scenarios = [
  // ── Romantic ──
  { id: 1,   text: 'You and your partner get one free day with zero responsibilities. Plan the perfect day together — every hour.',                         category: 'romantic',  intensity: 1 },
  { id: 2,   text: 'You can relive any one day from your relationship. Which day do you pick and why?',                                                     category: 'romantic',  intensity: 1 },
  { id: 3,   text: 'You wake up and your partner has planned a surprise trip. Where did they take you and what do you do together?',                         category: 'romantic',  intensity: 1 },
  { id: 4,   text: 'Write the most romantic love letter you can in 60 seconds and read it to your partner.',                                                 category: 'romantic',  intensity: 1 },
  { id: 5,   text: 'You can give your partner one superpower that would make your relationship better. What is it?',                                         category: 'romantic',  intensity: 1 },
  { id: 6,   text: 'A genie says your partner can know ONE thing you\'ve never told them. What do you reveal?',                                             category: 'romantic',  intensity: 2 },
  { id: 7,   text: 'You\'re on a couples retreat and asked to describe your partner using only 5 words. What are they?',                                    category: 'romantic',  intensity: 1 },
  { id: 8,   text: 'You\'re both given truth serum for 1 hour. What\'s the first question you ask each other?',                                             category: 'romantic',  intensity: 2 },
  { id: 9,   text: 'Describe what you think your partner was like before they met you — and how you\'ve changed each other.',                                category: 'romantic',  intensity: 1 },
  { id: 10,  text: 'You find a journal from the future describing your 10th anniversary. What does it say?',                                                category: 'romantic',  intensity: 1 },
  { id: 11,  text: 'Your partner is feeling low — you have unlimited money and 24 hours. How do you make it the most special day ever?',                     category: 'romantic',  intensity: 1 },
  { id: 12,  text: 'You\'re writing your wedding vows right now. What do you say?',                                                                         category: 'romantic',  intensity: 2 },
  { id: 13,  text: 'You wake up in a movie. What genre is your relationship in and what\'s the plot twist?',                                                 category: 'romantic',  intensity: 1 },
  { id: 14,  text: 'You can give your partner one physical experience they\'ve always wanted (skydiving, travel, etc). What is it?',                         category: 'romantic',  intensity: 1 },
  { id: 15,  text: 'Describe the moment you knew your partner was "the one" — or when you first felt butterflies.',                                          category: 'romantic',  intensity: 2 },
  { id: 16,  text: 'You\'re stuck in a time loop of one date with your partner. Which date do you choose?',                                                 category: 'romantic',  intensity: 1 },
  { id: 17,  text: 'Your partner can read your mind for the next 5 minutes. What thoughts are you most worried about?',                                     category: 'romantic',  intensity: 2 },
  { id: 18,  text: 'You both swap love languages for a week. How does your life change?',                                                                   category: 'romantic',  intensity: 1 },
  { id: 19,  text: 'You get to re-do your first date with everything you know now. What do you do differently?',                                            category: 'romantic',  intensity: 2 },
  { id: 20,  text: 'You can freeze one moment with your partner and live in it forever. Which moment?',                                                     category: 'romantic',  intensity: 1 },

  // ── Spicy ──
  { id: 21,  text: 'Your partner dares you to initiate something bold tonight. What\'s your move?',                                                         category: 'spicy',    intensity: 2 },
  { id: 22,  text: 'You find a note from your partner listing 3 things they want to try in the bedroom. What do you HOPE is on it?',                        category: 'spicy',    intensity: 3 },
  { id: 23,  text: 'You\'re at a fancy hotel with your partner. Room service just arrived. What happens next?',                                              category: 'spicy',    intensity: 2 },
  { id: 24,  text: 'Your partner confesses a fantasy they\'ve never shared. What do you think it is? Are you in?',                                          category: 'spicy',    intensity: 3 },
  { id: 25,  text: 'You\'re stuck in an elevator alone with your partner for 2 hours. No cameras. What happens?',                                           category: 'spicy',    intensity: 2 },
  { id: 26,  text: 'Your partner sends you a spicy text by accident to your group chat. What did the text say?',                                            category: 'spicy',    intensity: 2 },
  { id: 27,  text: 'A couples therapist says you need to be more adventurous together. What\'s the first thing you try?',                                    category: 'spicy',    intensity: 2 },
  { id: 28,  text: 'You\'re playing truth or dare with just your partner. They pick dare. What do you dare them to do?',                                    category: 'spicy',    intensity: 3 },
  { id: 29,  text: 'Your partner gets to pick your outfit for an entire weekend. What do they choose and how do you feel?',                                  category: 'spicy',    intensity: 2 },
  { id: 30,  text: 'You discover a couples challenge app on your partner\'s phone. What challenges do you hope are in it?',                                  category: 'spicy',    intensity: 2 },
  { id: 31,  text: 'You\'re both given a hall pass for one celebrity. Who do you each pick — and how jealous are you?',                                      category: 'spicy',    intensity: 2 },
  { id: 32,  text: 'Your partner suggests a weekend where you only communicate through touch. How does it go?',                                              category: 'spicy',    intensity: 3 },
  { id: 33,  text: 'You\'re at a party and your partner whispers something outrageous in your ear. What did they say and do you leave early?',               category: 'spicy',    intensity: 3 },
  { id: 34,  text: 'You walk in on your partner setting up a surprise in the bedroom. Candles, music, the works. What comes next?',                          category: 'spicy',    intensity: 2 },
  { id: 35,  text: 'Your partner asks you to rate them out of 10 in bed. What do you say — and what constructive feedback do you give?',                     category: 'spicy',    intensity: 3 },
  { id: 36,  text: 'You can both try a couples bucket list item tonight. What\'s at the top of your list?',                                                 category: 'spicy',    intensity: 2 },
  { id: 37,  text: 'Your partner buys you lingerie / underwear as a gift. Describe what you hope they picked.',                                              category: 'spicy',    intensity: 3 },
  { id: 38,  text: 'A love psychic says there\'s one unspoken desire between you two. What is it?',                                                         category: 'spicy',    intensity: 3 },
  { id: 39,  text: 'You get to role-play as different people for one evening. Who do you each become?',                                                     category: 'spicy',    intensity: 3 },
  { id: 40,  text: 'Describe the perfect "do not disturb" evening with your partner in detail.',                                                             category: 'spicy',    intensity: 2 },

  // ── Fantasy ──
  { id: 41,  text: 'You and your partner swap bodies for 24 hours. What\'s the first thing you do?',                                                        category: 'fantasy',  intensity: 1 },
  { id: 42,  text: 'You win an all-expenses-paid couples trip anywhere in the world. Where do you go and what\'s day one look like?',                        category: 'fantasy',  intensity: 1 },
  { id: 43,  text: 'You both wake up with superpowers. What powers do you each have and how do you use them together?',                                      category: 'fantasy',  intensity: 1 },
  { id: 44,  text: 'You\'re cast as a couple in a movie. What genre and what\'s your couple dynamic?',                                                      category: 'fantasy',  intensity: 1 },
  { id: 45,  text: 'A magic potion lets you experience one night in any era. When do you go and what do you do?',                                           category: 'fantasy',  intensity: 2 },
  { id: 46,  text: 'You both become invisible for a day. What mischief do you get up to together?',                                                         category: 'fantasy',  intensity: 2 },
  { id: 47,  text: 'You can design your dream home together. Describe the most outrageous room you include.',                                               category: 'fantasy',  intensity: 1 },
  { id: 48,  text: 'You discover a secret room in your house that transforms into whatever you want. What do you create?',                                   category: 'fantasy',  intensity: 2 },
  { id: 49,  text: 'A genie gives you both one wish — but you have to agree on it. What do you wish for?',                                                  category: 'fantasy',  intensity: 1 },
  { id: 50,  text: 'You\'re trapped in a romantic comedy. What\'s the one cliché scene that definitely happens to you two?',                                 category: 'fantasy',  intensity: 1 },
  { id: 51,  text: 'Time freezes for everyone except you two for 24 hours. What do you do?',                                                                category: 'fantasy',  intensity: 2 },
  { id: 52,  text: 'You can relive each other\'s past for one day (before you met). What day do you choose from your partner\'s life?',                      category: 'fantasy',  intensity: 1 },
  { id: 53,  text: 'You\'re both hired as spies. What are your code names and what\'s your first couples mission?',                                          category: 'fantasy',  intensity: 1 },
  { id: 54,  text: 'A parallel universe version of your partner shows up. How are they different? Do you prefer this one?',                                  category: 'fantasy',  intensity: 2 },
  { id: 55,  text: 'You win a private island. What rules do you set for your couples paradise?',                                                            category: 'fantasy',  intensity: 1 },
  { id: 56,  text: 'You can read each other\'s dreams every morning. What are you most excited — or terrified — to discover?',                               category: 'fantasy',  intensity: 2 },
  { id: 57,  text: 'AI creates a perfect date based on your combined data. What does it plan?',                                                             category: 'fantasy',  intensity: 1 },
  { id: 58,  text: 'You\'re both characters in a video game. What are your special abilities and what\'s your co-op quest?',                                 category: 'fantasy',  intensity: 1 },
  { id: 59,  text: 'You can live in any TV show together. Which show do you pick and what characters are you?',                                              category: 'fantasy',  intensity: 1 },
  { id: 60,  text: 'A love potion makes your partner confess EVERYTHING. What do you think they\'d say?',                                                   category: 'fantasy',  intensity: 2 },

  // ── Awkward ──
  { id: 61,  text: 'Your partner accidentally sends a very intimate text to the family group chat. What did it say and how do you recover?',                 category: 'awkward',  intensity: 2 },
  { id: 62,  text: 'You\'re caught by your partner\'s parents in a compromising situation. What\'s your cover story?',                                       category: 'awkward',  intensity: 3 },
  { id: 63,  text: 'Your partner accidentally calls you by their ex\'s name during an intimate moment. How do you react?',                                  category: 'awkward',  intensity: 3 },
  { id: 64,  text: 'You accidentally "like" your partner\'s ex\'s thirst trap at 2 AM. Your partner sees the notification. What do you say?',               category: 'awkward',  intensity: 2 },
  { id: 65,  text: 'Your smart speaker plays your search history out loud when your partner\'s friends are over. What comes up?',                            category: 'awkward',  intensity: 3 },
  { id: 66,  text: 'You forget your anniversary and your partner has planned something elaborate. How do you improvise?',                                    category: 'awkward',  intensity: 1 },
  { id: 67,  text: 'Your partner finds your old hidden social media account from before you met. What\'s on it?',                                           category: 'awkward',  intensity: 2 },
  { id: 68,  text: 'You accidentally match with your partner\'s friend on a dating app you forgot to delete. How do you handle it?',                        category: 'awkward',  intensity: 2 },
  { id: 69,  text: 'Your neighbor hears everything one night and mentions it casually the next morning. What do you say?',                                   category: 'awkward',  intensity: 3 },
  { id: 70,  text: 'Your partner\'s mom finds something spicy in your bedroom while visiting. How does the conversation go?',                                category: 'awkward',  intensity: 3 },
  { id: 71,  text: 'You pocket-dial your partner while talking to a friend about their surprise birthday party. But it sounds way worse than it is.',        category: 'awkward',  intensity: 1 },
  { id: 72,  text: 'Your couple\'s massage therapist is extremely attractive and your partner notices you noticing. What\'s your defense?',                   category: 'awkward',  intensity: 2 },
  { id: 73,  text: 'You both show up to a party wearing almost the exact same outfit. How do you own it?',                                                  category: 'awkward',  intensity: 1 },
  { id: 74,  text: 'You leave your dating app profile open on your laptop and your partner sees it. It was research — right?',                               category: 'awkward',  intensity: 2 },
  { id: 75,  text: 'Your partner\'s best friend innocently reveals a secret from your past. How do you damage control?',                                     category: 'awkward',  intensity: 2 },
  { id: 76,  text: 'A waiter asks if you\'re siblings — in front of your romantic dinner date. React.',                                                      category: 'awkward',  intensity: 1 },
  { id: 77,  text: 'Your couple photo goes viral for a hilarious reason. What happened in the photo?',                                                      category: 'awkward',  intensity: 1 },
  { id: 78,  text: 'You accidentally send your partner a screenshot of a conversation you were having ABOUT them. Fix it.',                                  category: 'awkward',  intensity: 2 },
  { id: 79,  text: 'During a double date, you let slip an embarrassing couples secret. What was it?',                                                       category: 'awkward',  intensity: 2 },
  { id: 80,  text: 'Your partner\'s ex is your new coworker. How do you handle the first dinner party?',                                                    category: 'awkward',  intensity: 2 },

  // ── Wildcard ──
  { id: 81,  text: 'You and your partner become famous overnight as a couples influencer. What\'s your brand?',                                              category: 'wildcard', intensity: 1 },
  { id: 82,  text: 'You must pitch the WORST couples activity ever and convince your partner to try it. Go.',                                                category: 'wildcard', intensity: 1 },
  { id: 83,  text: 'Create a new couples holiday. What is it, when is it, and how do you celebrate?',                                                       category: 'wildcard', intensity: 1 },
  { id: 84,  text: 'Your couple has a theme song. What is it and why?',                                                                                     category: 'wildcard', intensity: 1 },
  { id: 85,  text: 'You must survive 48 hours handcuffed to your partner. What\'s your survival strategy?',                                                 category: 'wildcard', intensity: 2 },
  { id: 86,  text: 'You\'re both on a reality dating show — but you\'re already together. How do you play it?',                                             category: 'wildcard', intensity: 2 },
  { id: 87,  text: 'An AI writes a romance novel about your relationship. What\'s the plot?',                                                               category: 'wildcard', intensity: 1 },
  { id: 88,  text: 'You get one text to make your partner drop everything and come home immediately. What does it say?',                                     category: 'wildcard', intensity: 2 },
  { id: 89,  text: 'Your relationship is a cocktail. Name it, list the ingredients, and describe the taste.',                                                category: 'wildcard', intensity: 1 },
  { id: 90,  text: 'You can add one ridiculous rule to your relationship. What is it?',                                                                     category: 'wildcard', intensity: 1 },
  { id: 91,  text: 'You write a Yelp review of your partner as a romantic partner. What does it say?',                                                      category: 'wildcard', intensity: 2 },
  { id: 92,  text: 'A fortune teller tells you one specific thing about your couple\'s future. What do you hope they say?',                                  category: 'wildcard', intensity: 1 },
  { id: 93,  text: 'You\'re both secret agents. What\'s your code name for each other and what\'s your safe word?',                                         category: 'wildcard', intensity: 2 },
  { id: 94,  text: 'Describe your couple dynamic as a pair of fictional characters. Who are you?',                                                          category: 'wildcard', intensity: 1 },
  { id: 95,  text: 'You get to create a couples dare that the other couple in the game must do. What is it?',                                               category: 'wildcard', intensity: 3 },
  { id: 96,  text: 'Create the most over-the-top proposal scenario for your partner. Money is no object.',                                                  category: 'wildcard', intensity: 1 },
  { id: 97,  text: 'Your partner\'s browser history is projected at your anniversary party. Narrate the highlights.',                                        category: 'wildcard', intensity: 3 },
  { id: 98,  text: 'Describe the worst possible double date — location, other couple, and what goes wrong.',                                                 category: 'wildcard', intensity: 1 },
  { id: 99,  text: 'A movie about your love life is releasing. What\'s the title, the tagline, and who plays you both?',                                    category: 'wildcard', intensity: 1 },
  { id: 100, text: 'You must plan the ultimate couples prank on each other. What do you do?',                                                               category: 'wildcard', intensity: 2 },
  { id: 101, text: 'You have an unlimited budget for one night with your partner. Plan every detail.',                                                       category: 'wildcard', intensity: 2 },
  { id: 102, text: 'Your couple\'s memoir is being written. What\'s the most scandalous chapter title?',                                                     category: 'wildcard', intensity: 3 },
  { id: 103, text: 'You can swap one personality trait with your partner for a week. Which trait and why?',                                                  category: 'wildcard', intensity: 1 },
  { id: 104, text: 'Design a couples escape room. What\'s the theme and what challenges are inside?',                                                       category: 'wildcard', intensity: 1 },
  { id: 105, text: 'Confess something to your partner right now that you\'ve been holding back — big or small.',                                             category: 'wildcard', intensity: 3 },
];

// ── Categories ──
const CATEGORIES = ['romantic', 'spicy', 'fantasy', 'awkward', 'wildcard'];

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
