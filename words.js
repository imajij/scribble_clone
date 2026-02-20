// ========================================
// ADULTS-ONLY (18+) WORD LIST
// Strictly NSFW — for the Scribble After Dark game
// ========================================

// ----------------------------------------
// Raw word categories (source of truth)
// ----------------------------------------

const wordCategories = {

  anatomy: [
    "boobs", "butt", "nipple", "cleavage", "six pack",
    "thigh gap", "love handles", "beer belly", "happy trail", "camel toe",
    "boner", "erection", "booty", "moobs", "areola",
    "bush", "treasure trail", "muffin top", "bikini line", "sideboob",
    "underboob", "abs", "bulge", "tongue", "belly button"
  ],

  bedroomActivities: [
    "doggy style", "missionary", "reverse cowgirl", "sixty nine", "spooning",
    "lap dance", "strip tease", "pole dance", "twerking", "grinding",
    "skinny dipping", "body shot", "whipped cream", "blindfold", "handcuffs",
    "role play", "dirty talk", "pillow talk", "morning wood", "walk of shame",
    "one night stand", "booty call", "quickie", "foreplay", "afterglow",
    "friends with benefits", "Netflix and chill", "safe word", "tantric", "make out"
  ],

  kinkAndFetish: [
    "BDSM", "dominatrix", "bondage", "submission", "whip",
    "leather", "latex", "corset", "gag ball", "collar",
    "spanking", "paddle", "riding crop", "ankle cuffs", "blindfolded",
    "foot fetish", "body worship", "costume play", "hot wax", "rope play",
    "feather tickle", "ice cube play", "silk ropes", "edging", "dungeon"
  ],

  adultToys: [
    "vibrator", "dildo", "butt plug", "fuzzy handcuffs", "riding crop",
    "lingerie", "thong", "g string", "fishnet stockings", "garter belt",
    "body oil", "massage candle", "love swing", "sleep mask", "feather duster",
    "nipple clamps", "cock ring", "love beads", "lube", "body paint",
    "edible underwear", "fuzzy dice", "silk sheets", "mirror ceiling", "stripper pole"
  ],

  dirtyInnuendos: [
    "banana", "peach", "eggplant", "cherry", "melons",
    "pearl necklace", "taco", "sausage", "hot dog", "buns",
    "cucumber", "donuts", "popsicle", "lollipop", "cream pie",
    "stuffed turkey", "juicy steak", "wet noodle", "banana split", "cherry pop",
    "meatball sub", "clam", "oyster", "honey pot", "sugar walls"
  ],

  adultEntertainment: [
    "strip club", "private dance", "pole dancer", "bachelor party", "bachelorette party",
    "body shots", "beer pong", "spin the bottle", "seven minutes in heaven", "truth or dare",
    "strip poker", "adult film", "peep show", "burlesque", "go go dancer",
    "bottle service", "VIP room", "casting couch", "centerfold", "playboy bunny",
    "cam show", "sugar daddy", "sugar baby", "escort", "call girl"
  ],

  risqueClothing: [
    "thong", "g string", "push up bra", "crotchless panties", "see through",
    "bikini", "micro bikini", "string bikini", "pasties", "body stocking",
    "teddy", "babydoll", "negligee", "stiletto heels", "leather pants",
    "crop top", "booty shorts", "wet t shirt", "tube top", "mesh top",
    "fishnet", "corset", "garter", "suspenders", "birthday suit"
  ],

  naughtyScenarios: [
    "mile high club", "back seat", "elevator quickie", "skinny dipping", "hot tub",
    "caught in the act", "walk of shame", "hickey", "closet hookup", "pool boy",
    "hotel room", "champagne room", "jacuzzi", "beach at night", "under the desk",
    "phone sex", "sexting", "nude selfie", "accidental sext", "wrong chat",
    "browser history", "incognito mode", "earbuds fell out", "thin walls", "morning after"
  ],

  partyAndDrinking: [
    "body shots", "keg stand", "beer bong", "toga party", "foam party",
    "jello shots", "tequila body shot", "wet t shirt contest", "limbo", "dirty dancing",
    "drunk text", "booty call", "walk of shame", "hangover", "beer goggles",
    "liquid courage", "last call", "open bar", "bar crawl", "after party",
    "happy ending", "drunk dial", "designated driver", "pregame", "power hour"
  ],

  relationships: [
    "friends with benefits", "one night stand", "rebound", "catfish", "ghosting",
    "sugar daddy", "trophy wife", "prenup", "love triangle", "third wheel",
    "open relationship", "swinger", "cougar", "MILF", "DILF",
    "sugar mama", "boy toy", "arm candy", "side piece", "hall pass",
    "speed dating", "blind date", "wingman", "pickup line", "booty text"
  ]
};

// ----------------------------------------
// Word packs — curated subsets of categories
// ----------------------------------------

const WORD_PACKS = {
  classic: {
    label: 'Classic',
    description: 'Innuendos, anatomy & bedroom basics',
    categories: ['anatomy', 'bedroomActivities', 'dirtyInnuendos', 'risqueClothing']
  },
  extreme: {
    label: 'Extreme',
    description: 'Kink, fetish & adult toys',
    categories: ['kinkAndFetish', 'adultToys', 'adultEntertainment', 'naughtyScenarios']
  },
  romantic: {
    label: 'Romantic',
    description: 'Bedroom activities, relationships & clothing',
    categories: ['bedroomActivities', 'relationships', 'risqueClothing', 'anatomy']
  },
  party: {
    label: 'Party',
    description: 'Drinking games, scenarios & entertainment',
    categories: ['partyAndDrinking', 'adultEntertainment', 'naughtyScenarios', 'dirtyInnuendos']
  },
  mixed: {
    label: 'Mixed (All)',
    description: 'Every category combined',
    categories: Object.keys(wordCategories)
  }
};

// ----------------------------------------
// Build deduplicated word lists per pack
// ----------------------------------------

function buildPackWords(packId) {
  const pack = WORD_PACKS[packId];
  if (!pack) return [];
  const words = pack.categories.flatMap(cat => wordCategories[cat] || []);
  return [...new Set(words)];
}

// Pre-build for quick access
const packWordLists = {};
for (const id of Object.keys(WORD_PACKS)) {
  packWordLists[id] = buildPackWords(id);
}

// ----------------------------------------
// Public helpers
// ----------------------------------------

const VALID_PACKS = Object.keys(WORD_PACKS);
const DEFAULT_PACK = 'mixed';

/**
 * Return `count` random words from the given pack.
 * Falls back to 'mixed' if packId is invalid.
 */
function getRandomWords(count = 3, packId = DEFAULT_PACK) {
  const list = packWordLists[packId] || packWordLists[DEFAULT_PACK];
  const shuffled = [...list].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

/**
 * Return a single random word from the given pack.
 */
function getRandomWord(packId = DEFAULT_PACK) {
  const list = packWordLists[packId] || packWordLists[DEFAULT_PACK];
  return list[Math.floor(Math.random() * list.length)];
}

/**
 * Return metadata for all packs (id, label, description, wordCount).
 */
function getPackList() {
  return VALID_PACKS.map(id => ({
    id,
    label: WORD_PACKS[id].label,
    description: WORD_PACKS[id].description,
    wordCount: packWordLists[id].length
  }));
}

module.exports = {
  wordCategories,
  WORD_PACKS,
  VALID_PACKS,
  DEFAULT_PACK,
  getRandomWords,
  getRandomWord,
  getPackList
};
