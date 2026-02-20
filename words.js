// ========================================
// ADULTS-ONLY (18+) WORD LIST — COUPLES EDITION
// Strictly NSFW — for the Scribble After Dark couples game
// ========================================

// ----------------------------------------
// Raw word categories (source of truth)
// ----------------------------------------

const wordCategories = {

  coupleAnatomy: [
    "boobs", "butt", "nipple", "cleavage", "abs",
    "inner thigh", "love handles", "happy trail", "collarbone kiss",
    "neck", "earlobe", "lower back", "hip bones", "booty",
    "areola", "bikini line", "sideboob", "underboob", "bulge",
    "tongue", "lips", "belly button", "jawline", "treasure trail", "navel"
  ],

  bedroomTogether: [
    "doggy style", "missionary", "reverse cowgirl", "sixty nine", "spooning",
    "lap dance", "strip tease", "grinding", "make out",
    "skinny dipping", "whipped cream", "blindfold", "handcuffs",
    "role play", "dirty talk", "pillow talk", "quickie", "foreplay", "afterglow",
    "morning sex", "tantric", "safe word", "shower together", "breakfast in bed",
    "body to body", "slow dance", "couples massage", "love making", "Netflix and chill"
  ],

  kinkForTwo: [
    "BDSM", "dom and sub", "bondage", "submission", "whip",
    "leather", "latex", "corset", "gag ball", "collar",
    "spanking", "paddle", "riding crop", "blindfolded",
    "body worship", "costume play", "hot wax", "rope play",
    "feather tickle", "ice cube play", "silk ropes", "edging",
    "role reversal", "power exchange", "sensation play"
  ],

  couplesToys: [
    "vibrator", "couples vibrator", "butt plug", "fuzzy handcuffs", "riding crop",
    "lingerie", "body oil", "massage candle", "love swing", "sleep mask",
    "feather duster", "nipple clamps", "cock ring", "love beads", "lube",
    "body paint", "edible underwear", "silk sheets", "remote control toy",
    "warming gel", "blindfold set", "dice game", "couples card game",
    "body chocolate", "we-vibe"
  ],

  flirtyInnuendos: [
    "banana", "peach", "eggplant", "cherry", "melons",
    "pearl necklace", "sausage", "buns", "cucumber",
    "popsicle", "lollipop", "cream pie", "banana split",
    "honey pot", "cherry pop", "juicy", "tasty",
    "mouthful", "dessert first", "midnight snack",
    "main course", "appetizer", "sugar lips", "sweet spot", "love bite"
  ],

  dateNight: [
    "hotel room", "hot tub", "jacuzzi", "beach at night", "candlelight",
    "champagne", "room service", "rooftop", "couples retreat", "wine tasting",
    "sunset", "slow dance", "moonlight", "bubble bath", "fireplace",
    "weekend getaway", "road trip", "balcony", "penthouse suite", "room key",
    "do not disturb", "late checkout", "mini bar", "private pool", "stargazing"
  ],

  intimateClothing: [
    "thong", "g string", "push up bra", "crotchless panties", "see through",
    "micro bikini", "pasties", "body stocking",
    "teddy", "babydoll", "negligee", "stiletto heels",
    "fishnet", "corset", "garter", "birthday suit",
    "silk robe", "boxer briefs", "lace bodysuit", "satin slip",
    "matching set", "kimono robe", "sheer nightgown", "halter top", "boy shorts"
  ],

  naughtyMoments: [
    "mile high club", "back seat", "elevator quickie", "skinny dipping", "hot tub",
    "caught in the act", "hickey", "hotel hallway", "kitchen counter",
    "shower steam", "road trip pull over", "balcony at night", "fitting room",
    "under the blanket", "phone sex", "sexting", "nude selfie",
    "love letter", "surprise visit", "wake up call",
    "rain kiss", "car steamy windows", "tent camping", "rooftop midnight", "first time"
  ],

  romanticVibes: [
    "love at first sight", "butterflies", "soulmate", "spark", "chemistry",
    "love language", "pillow fort", "matching pajamas", "inside joke", "pet names",
    "anniversary", "love note", "forehead kiss", "hand holding", "slow dance",
    "mixtape", "couple goals", "honeymoon", "proposal", "wedding night",
    "first kiss", "date night", "long distance", "reunited", "forever person"
  ],

  couplesCode: [
    "hall pass", "open relationship", "safe word", "Netflix and chill", "spicy night",
    "round two", "morning after", "walk of fame", "love drunk", "heart eyes",
    "crush", "desire", "tension", "chemistry", "attraction",
    "forbidden fruit", "guilty pleasure", "secret fantasy", "wish list", "bucket list",
    "couple dare", "truth or strip", "spin the bottle", "seven minutes", "no peeking"
  ]
};

// ----------------------------------------
// Word packs — curated subsets of categories
// ----------------------------------------

const WORD_PACKS = {
  classic: {
    label: 'Classic',
    description: 'Flirty anatomy, bedroom basics & innuendos for couples',
    categories: ['coupleAnatomy', 'bedroomTogether', 'flirtyInnuendos', 'intimateClothing']
  },
  extreme: {
    label: 'Extreme',
    description: 'Kink, toys & naughty moments — turn up the heat',
    categories: ['kinkForTwo', 'couplesToys', 'naughtyMoments', 'couplesCode']
  },
  romantic: {
    label: 'Romantic',
    description: 'Date nights, romance & intimate clothing',
    categories: ['dateNight', 'romanticVibes', 'intimateClothing', 'coupleAnatomy']
  },
  party: {
    label: 'Spicy Night',
    description: 'Everything you need for a hot couples night in',
    categories: ['naughtyMoments', 'couplesCode', 'flirtyInnuendos', 'dateNight']
  },
  mixed: {
    label: 'All In (Everything)',
    description: 'Every category combined — the ultimate couples mix',
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
