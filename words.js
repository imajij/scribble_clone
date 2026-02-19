// Adult-themed word lists for the drawing game
// Categories: Party & Nightlife, Relationships, Adulting, Pop Culture, Innuendos, etc.

const wordCategories = {
  partyAndNightlife: [
    "hangover", "beer pong", "cocktail", "designated driver", "karaoke night",
    "bar crawl", "happy hour", "body shots", "bouncer", "last call",
    "wine tasting", "pub quiz", "strip poker", "keg stand", "toga party",
    "beer goggles", "liquid courage", "pregame", "after party", "VIP section",
    "dance floor", "jukebox", "bottle service", "open bar", "tequila sunrise"
  ],

  relationships: [
    "blind date", "speed dating", "one night stand", "friends with benefits",
    "walk of shame", "catfish", "ghosting", "Netflix and chill", "love triangle",
    "rebound", "sugar daddy", "trophy wife", "prenup", "midlife crisis",
    "couples therapy", "jealous ex", "stalker", "booty call", "wingman",
    "pickup line", "third wheel", "swiping right", "deal breaker", "spark",
    "butterflies"
  ],

  adulting: [
    "mortgage", "tax season", "credit score", "student loans", "rush hour",
    "cubicle", "passive aggressive email", "office politics", "midlife crisis",
    "existential dread", "burnout", "brunch", "meal prep", "therapy session",
    "wine o'clock", "adulting", "spam folder", "parking ticket", "jury duty",
    "overdue bills", "retirement plan", "noise complaint", "HOA meeting",
    "awkward elevator", "Monday morning"
  ],

  popCulture: [
    "walk of fame", "paparazzi", "wardrobe malfunction", "reality TV",
    "guilty pleasure", "binge watching", "spoiler alert", "plot twist",
    "cliffhanger", "cancelled", "influencer", "viral video", "meme lord",
    "thirst trap", "photobomb", "selfie stick", "cancel culture", "stan",
    "simp", "Karen", "OK boomer", "main character energy", "red carpet",
    "talent show", "celebrity roast"
  ],

  innuendos: [
    "bedpost notch", "morning wood", "skinny dipping", "handcuffs",
    "whipped cream", "banana split", "eggplant", "peach emoji", "pearl necklace",
    "black book", "hot tub", "seven minutes in heaven", "spin the bottle",
    "truth or dare", "strip tease", "lap dance", "body paint", "blindfold",
    "pillow talk", "walk of shame", "hickey", "French kiss", "dirty martini",
    "getting lucky", "bubble bath"
  ],

  awkwardSituations: [
    "walk in on parents", "wrong bathroom", "toilet paper on shoe",
    "fly is open", "double text", "drunk text", "sent to wrong person",
    "accidental like", "group chat drama", "food in teeth", "loud stomach",
    "wrong name in bed", "browser history", "read receipts", "pocket dial",
    "awkward silence", "elevator fart", "tangled earbuds", "autocorrect fail",
    "wrong meeting link", "camera still on", "unmuted mic", "reply all",
    "seen zone", "crop dust"
  ],

  bodyAndHealth: [
    "beer belly", "love handles", "tramp stamp", "hangover cure",
    "walk of shame outfit", "bed head", "morning breath", "tan lines",
    "razor burn", "bikini wax", "walk of shame", "chiropractor",
    "colonoscopy", "vasectomy", "botox", "dad bod", "hot yoga",
    "sauna", "massage parlor", "acupuncture", "detox", "probiotics",
    "intermittent fasting", "protein shake", "foam roller"
  ],

  foodAndDrink: [
    "oysters", "aphrodisiac", "espresso martini", "bloody mary",
    "bottomless mimosa", "edible arrangement", "sushi roll", "hot dog",
    "stuffed crust", "all you can eat", "food baby", "guilty pleasure meal",
    "midnight snack", "raw bar", "fondue", "chocolate covered strawberry",
    "whipped cream", "champagne toast", "tequila worm", "absinthe",
    "Irish car bomb", "jello shot", "long island iced tea", "mai tai",
    "sex on the beach"
  ]
};

// Flatten all words into one array
const allWords = Object.values(wordCategories).flat();

// Remove duplicates
const uniqueWords = [...new Set(allWords)];

// Get random words for selection
function getRandomWords(count = 3) {
  const shuffled = [...uniqueWords].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

// Get a single random word
function getRandomWord() {
  return uniqueWords[Math.floor(Math.random() * uniqueWords.length)];
}

module.exports = { wordCategories, allWords: uniqueWords, getRandomWords, getRandomWord };
