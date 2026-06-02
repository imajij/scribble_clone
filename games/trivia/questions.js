// ========================================
// TRIVIA SHOWDOWN — Question Bank
// ========================================
// Single source of truth for the trivia question list. SERVER-ONLY data:
// the `answer` index is NEVER sent to clients before reveal.
//
// Each question: { category, q, options:[4 strings], answer:<index 0-3>, heat? }
//   category — used for the lobby filter
//   heat     — 1 = tame, 2 = flirty, 3 = after-dark (only the couples set)
//
// Categories below are also exported as CATEGORIES so client + server share
// one vocabulary. The After Dark / couples set is suggestive, not explicit.

const questions = [
  // ───────────────────────── General Knowledge ─────────────────────────
  { category: 'general', q: 'How many continents are there on Earth?', options: ['5', '6', '7', '8'], answer: 2 },
  { category: 'general', q: 'What is the largest planet in our solar system?', options: ['Saturn', 'Jupiter', 'Neptune', 'Earth'], answer: 1 },
  { category: 'general', q: 'Which gas do plants primarily absorb from the air?', options: ['Oxygen', 'Nitrogen', 'Carbon dioxide', 'Hydrogen'], answer: 2 },
  { category: 'general', q: 'How many sides does a hexagon have?', options: ['5', '6', '7', '8'], answer: 1 },
  { category: 'general', q: 'What is the tallest mountain above sea level?', options: ['K2', 'Mount Everest', 'Kilimanjaro', 'Denali'], answer: 1 },
  { category: 'general', q: 'Which ocean is the largest?', options: ['Atlantic', 'Indian', 'Arctic', 'Pacific'], answer: 3 },
  { category: 'general', q: 'What is the freezing point of water in Celsius?', options: ['-10', '0', '10', '32'], answer: 1 },
  { category: 'general', q: 'How many colors are in a rainbow?', options: ['5', '6', '7', '9'], answer: 2 },
  { category: 'general', q: 'Which language has the most native speakers worldwide?', options: ['English', 'Spanish', 'Mandarin Chinese', 'Hindi'], answer: 2 },
  { category: 'general', q: 'What is the smallest prime number?', options: ['0', '1', '2', '3'], answer: 2 },
  { category: 'general', q: 'Which country has the most time zones?', options: ['USA', 'Russia', 'China', 'France'], answer: 3 },
  { category: 'general', q: 'What does "www" stand for?', options: ['World Wide Web', 'Web World Wide', 'Wide Web World', 'World Web Wide'], answer: 0 },

  // ───────────────────────── Science & Nature ─────────────────────────
  { category: 'science', q: 'What is the chemical symbol for gold?', options: ['Go', 'Gd', 'Au', 'Ag'], answer: 2 },
  { category: 'science', q: 'How many bones are in the adult human body?', options: ['186', '206', '226', '246'], answer: 1 },
  { category: 'science', q: 'What planet is known as the Red Planet?', options: ['Venus', 'Mars', 'Mercury', 'Jupiter'], answer: 1 },
  { category: 'science', q: 'What is the powerhouse of the cell?', options: ['Nucleus', 'Ribosome', 'Mitochondria', 'Golgi body'], answer: 2 },
  { category: 'science', q: 'What is the speed of light approximately?', options: ['300,000 km/s', '150,000 km/s', '1,000 km/s', '3,000 km/s'], answer: 0 },
  { category: 'science', q: 'Which blood type is the universal donor?', options: ['A', 'B', 'AB', 'O negative'], answer: 3 },
  { category: 'science', q: 'What gas makes up most of Earth\'s atmosphere?', options: ['Oxygen', 'Nitrogen', 'Carbon dioxide', 'Argon'], answer: 1 },
  { category: 'science', q: 'What is H2O more commonly known as?', options: ['Salt', 'Water', 'Hydrogen', 'Acid'], answer: 1 },
  { category: 'science', q: 'How many hearts does an octopus have?', options: ['1', '2', '3', '4'], answer: 2 },
  { category: 'science', q: 'Which scientist proposed the theory of general relativity?', options: ['Newton', 'Einstein', 'Galileo', 'Tesla'], answer: 1 },
  { category: 'science', q: 'What is the hardest natural substance on Earth?', options: ['Gold', 'Iron', 'Diamond', 'Quartz'], answer: 2 },
  { category: 'science', q: 'Which planet has the most moons (as of recent counts)?', options: ['Jupiter', 'Saturn', 'Uranus', 'Neptune'], answer: 1 },

  // ───────────────────────── History & Geography ─────────────────────────
  { category: 'history', q: 'In which year did World War II end?', options: ['1943', '1944', '1945', '1946'], answer: 2 },
  { category: 'history', q: 'Who was the first President of the United States?', options: ['Thomas Jefferson', 'George Washington', 'Abraham Lincoln', 'John Adams'], answer: 1 },
  { category: 'history', q: 'What is the capital of Australia?', options: ['Sydney', 'Melbourne', 'Canberra', 'Perth'], answer: 2 },
  { category: 'history', q: 'The Great Wall is located in which country?', options: ['Japan', 'China', 'India', 'Korea'], answer: 1 },
  { category: 'history', q: 'Which ancient civilization built the pyramids of Giza?', options: ['Romans', 'Greeks', 'Egyptians', 'Mayans'], answer: 2 },
  { category: 'history', q: 'What is the capital of Japan?', options: ['Kyoto', 'Osaka', 'Tokyo', 'Nagoya'], answer: 2 },
  { category: 'history', q: 'Which country gifted the Statue of Liberty to the USA?', options: ['Britain', 'France', 'Spain', 'Italy'], answer: 1 },
  { category: 'history', q: 'On which continent is the Sahara Desert?', options: ['Asia', 'Australia', 'Africa', 'South America'], answer: 2 },
  { category: 'history', q: 'Who painted the Mona Lisa?', options: ['Michelangelo', 'Leonardo da Vinci', 'Raphael', 'Donatello'], answer: 1 },
  { category: 'history', q: 'What is the longest river in the world?', options: ['Amazon', 'Nile', 'Yangtze', 'Mississippi'], answer: 1 },
  { category: 'history', q: 'Which country is home to the kangaroo?', options: ['New Zealand', 'South Africa', 'Australia', 'Brazil'], answer: 2 },
  { category: 'history', q: 'The Eiffel Tower is located in which city?', options: ['London', 'Rome', 'Paris', 'Berlin'], answer: 2 },

  // ───────────────────────── Pop Culture & Entertainment ─────────────────────────
  { category: 'pop', q: 'Which movie features the quote "May the Force be with you"?', options: ['Star Trek', 'Star Wars', 'Avatar', 'Guardians of the Galaxy'], answer: 1 },
  { category: 'pop', q: 'Who is known as the "King of Pop"?', options: ['Elvis Presley', 'Michael Jackson', 'Prince', 'Freddie Mercury'], answer: 1 },
  { category: 'pop', q: 'What is the name of the wizard school in Harry Potter?', options: ['Beauxbatons', 'Durmstrang', 'Hogwarts', 'Ilvermorny'], answer: 2 },
  { category: 'pop', q: 'Which streaming show features the "Upside Down"?', options: ['Dark', 'Stranger Things', 'The OA', 'Black Mirror'], answer: 1 },
  { category: 'pop', q: 'Who played Jack in the movie Titanic?', options: ['Brad Pitt', 'Leonardo DiCaprio', 'Tom Cruise', 'Matt Damon'], answer: 1 },
  { category: 'pop', q: 'Which band performed "Bohemian Rhapsody"?', options: ['The Beatles', 'Queen', 'Led Zeppelin', 'The Rolling Stones'], answer: 1 },
  { category: 'pop', q: 'In which game do you "catch them all"?', options: ['Digimon', 'Yu-Gi-Oh', 'Pokemon', 'Bakugan'], answer: 2 },
  { category: 'pop', q: 'Who is the friendly neighborhood superhero known as Spider-Man?', options: ['Bruce Wayne', 'Peter Parker', 'Clark Kent', 'Tony Stark'], answer: 1 },
  { category: 'pop', q: 'What color is the dress nobody could agree on (the viral one)?', options: ['Definitely blue & black', 'Definitely white & gold', 'Red & green', 'Pink & gray'], answer: 0 },
  { category: 'pop', q: 'Which app is famous for short looping dance videos?', options: ['Vine', 'TikTok', 'Snapchat', 'BeReal'], answer: 1 },
  { category: 'pop', q: 'Who is the lead singer of Coldplay?', options: ['Chris Martin', 'Adam Levine', 'Bono', 'Thom Yorke'], answer: 0 },
  { category: 'pop', q: 'What is the highest-grossing film franchise (Marvel\'s)?', options: ['The Avengers / MCU', 'Fast & Furious', 'Harry Potter', 'James Bond'], answer: 0 },

  // ───────────────────────── Sports & Games ─────────────────────────
  { category: 'sports', q: 'How many players are on a soccer team on the field?', options: ['9', '10', '11', '12'], answer: 2 },
  { category: 'sports', q: 'In which sport would you perform a "slam dunk"?', options: ['Tennis', 'Basketball', 'Volleyball', 'Hockey'], answer: 1 },
  { category: 'sports', q: 'How often are the Summer Olympic Games held?', options: ['Every 2 years', 'Every 3 years', 'Every 4 years', 'Every 5 years'], answer: 2 },
  { category: 'sports', q: 'What is the maximum score in ten-pin bowling?', options: ['200', '250', '300', '350'], answer: 2 },
  { category: 'sports', q: 'In chess, which piece can only move diagonally?', options: ['Rook', 'Knight', 'Bishop', 'Pawn'], answer: 2 },
  { category: 'sports', q: 'How many points is a touchdown worth in American football?', options: ['3', '6', '7', '8'], answer: 1 },
  { category: 'sports', q: 'Which country has won the most FIFA World Cups?', options: ['Germany', 'Italy', 'Brazil', 'Argentina'], answer: 2 },
  { category: 'sports', q: 'In tennis, what is a score of zero called?', options: ['Nil', 'Love', 'Duck', 'Blank'], answer: 1 },
  { category: 'sports', q: 'How many holes are played in a standard round of golf?', options: ['9', '12', '18', '24'], answer: 2 },
  { category: 'sports', q: 'Which sport is played at Wimbledon?', options: ['Cricket', 'Tennis', 'Golf', 'Rugby'], answer: 1 },

  // ───────────────────────── After Dark / Couples (heat 2-3, suggestive) ─────────────────────────
  { category: 'afterdark', heat: 2, q: 'What scent is most commonly cited as an aphrodisiac?', options: ['Lavender', 'Vanilla', 'Pine', 'Citrus'], answer: 1 },
  { category: 'afterdark', heat: 2, q: 'Which "love language" is about words of affirmation, gifts, time, touch and...?', options: ['Acts of service', 'Acts of mischief', 'Acts of jealousy', 'Acts of patience'], answer: 0 },
  { category: 'afterdark', heat: 2, q: 'In the famous play, who does Romeo fall head-over-heels for?', options: ['Rosaline', 'Juliet', 'Ophelia', 'Beatrice'], answer: 1 },
  { category: 'afterdark', heat: 2, q: 'What hormone is nicknamed the "love" or "cuddle" hormone?', options: ['Adrenaline', 'Oxytocin', 'Cortisol', 'Insulin'], answer: 1 },
  { category: 'afterdark', heat: 2, q: 'Which day is celebrated as the day for lovers worldwide?', options: ['New Year\'s', 'Valentine\'s Day', 'Halloween', 'April Fools'], answer: 1 },
  { category: 'afterdark', heat: 3, q: 'Which spicy card game asks couples "Truth or...?"', options: ['Truth or Dare', 'Go Fish', 'Old Maid', 'War'], answer: 0 },
  { category: 'afterdark', heat: 2, q: 'A "slow burn" romance is best described as one that...', options: ['Ends instantly', 'Builds over time', 'Never starts', 'Stays platonic'], answer: 1 },
  { category: 'afterdark', heat: 3, q: 'Which fruit is often used as a flirty emoji for a peachy backside?', options: ['Apple', 'Banana', 'Peach', 'Grape'], answer: 2 },
  { category: 'afterdark', heat: 3, q: 'A blindfold is most associated with which sense being heightened?', options: ['Sight', 'Touch', 'Smell', 'Hearing'], answer: 1 },
  { category: 'afterdark', heat: 2, q: 'What is the traditional date-night first move classics suggest?', options: ['Dinner and a movie', 'Tax filing', 'Grocery run', 'Oil change'], answer: 0 },
  { category: 'afterdark', heat: 3, q: 'Which flirty emoji combo usually hints at "wink and tongue"?', options: ['Heart hands', 'Winking face with tongue', 'Thumbs up', 'Praying hands'], answer: 1 },
  { category: 'afterdark', heat: 2, q: 'Mistletoe is a holiday tradition that prompts couples to do what?', options: ['Argue', 'Kiss', 'Sleep', 'Cook'], answer: 1 },
];

// Distinct categories + display labels (shared vocabulary for client + server).
const CATEGORIES = [
  { id: 'all',       label: 'All Mixed' },
  { id: 'general',   label: 'General Knowledge' },
  { id: 'science',   label: 'Science & Nature' },
  { id: 'history',   label: 'History & Geo' },
  { id: 'pop',       label: 'Pop Culture' },
  { id: 'sports',    label: 'Sports & Games' },
  { id: 'afterdark', label: 'After Dark 🔥' },
];

// Single source of truth for shared thresholds/durations.
const CONFIG = {
  MIN_PLAYERS: 2,
  MAX_PLAYERS: 20,
  ROUND_OPTIONS: [5, 10, 15],
  DEFAULT_ROUNDS: 10,
  QUESTION_DURATION: 15,   // seconds a player has to lock an answer
  RESULT_PAUSE: 5,         // seconds the reveal/scoreboard stays up
  BASE_POINTS: 500,        // points for a correct answer
  SPEED_BONUS_MAX: 300,    // additional points scaled by remaining time
};

/**
 * Build a shuffled pool of questions for the given filter.
 * @param {string} categoryId - one of CATEGORIES ids ('all' = every category)
 * @param {number} count - how many questions wanted
 * @returns {Array} up to `count` questions (repeats only if the pool is small)
 */
function buildPool(categoryId, count) {
  let pool = categoryId && categoryId !== 'all'
    ? questions.filter(q => q.category === categoryId)
    : questions.slice();

  if (pool.length === 0) pool = questions.slice();

  // Fisher–Yates shuffle.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  // If we need more than we have unique questions, loop the (re-shuffled) pool.
  if (pool.length >= count) return pool.slice(0, count);

  const out = [];
  while (out.length < count) {
    for (let i = 0; i < pool.length && out.length < count; i++) out.push(pool[i]);
  }
  return out;
}

module.exports = { questions, CATEGORIES, CONFIG, buildPool };
