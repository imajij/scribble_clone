// ========================================
// ADULTS-ONLY (18+) WORD LIST
// Strictly NSFW — for the Scribble After Dark game
// ========================================

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

// Flatten and deduplicate
const allWords = [...new Set(Object.values(wordCategories).flat())];

function getRandomWords(count = 3) {
  const shuffled = [...allWords].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function getRandomWord() {
  return allWords[Math.floor(Math.random() * allWords.length)];
}

module.exports = { wordCategories, allWords, getRandomWords, getRandomWord };
