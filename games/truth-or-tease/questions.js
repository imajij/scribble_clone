// ========================================
// TRUTH OR TEASE LIVE — Question Bank
// ========================================
//
// Categories: truth-mild, truth-spicy, truth-extreme,
//             tease-mild, tease-spicy, tease-extreme
//
// Each question has { text, category, heat }
// heat: 1 = mild, 2 = spicy, 3 = extreme

const questions = [
  // ---- Truth — Mild (heat 1) ----
  { text: "What's the most embarrassing thing on your phone right now?", category: 'truth', heat: 1 },
  { text: "What's your guilty pleasure that you'd never post about?", category: 'truth', heat: 1 },
  { text: "Who in this room would you trust with your deepest secret?", category: 'truth', heat: 1 },
  { text: "What's the weirdest thing you've Googled this week?", category: 'truth', heat: 1 },
  { text: "What's the most childish thing you still do?", category: 'truth', heat: 1 },
  { text: "What white lie do you tell the most?", category: 'truth', heat: 1 },
  { text: "What's the pettiest reason you stopped talking to someone?", category: 'truth', heat: 1 },
  { text: "What's the longest you've gone without showering?", category: 'truth', heat: 1 },
  { text: "What's the most awkward date you've ever been on?", category: 'truth', heat: 1 },
  { text: "What's a deal-breaker most people would think is weird?", category: 'truth', heat: 1 },
  { text: "What's the worst fashion choice you've ever made?", category: 'truth', heat: 1 },
  { text: "What celebrity do you have an unexplainable crush on?", category: 'truth', heat: 1 },
  { text: "What's the most cringe thing you did in middle school?", category: 'truth', heat: 1 },
  { text: "Have you ever stalked an ex on social media? How deep?", category: 'truth', heat: 1 },
  { text: "What's something you pretend to like but secretly hate?", category: 'truth', heat: 1 },

  // ---- Truth — Spicy (heat 2) ----
  { text: "What's the biggest lie you've told a partner?", category: 'truth', heat: 2 },
  { text: "What's the most 'unhinged' DM you've ever sent?", category: 'truth', heat: 2 },
  { text: "Have you ever caught feelings for a friend's partner?", category: 'truth', heat: 2 },
  { text: "What's your most controversial hot take about relationships?", category: 'truth', heat: 2 },
  { text: "What's the fastest you've ever fallen for someone?", category: 'truth', heat: 2 },
  { text: "Have you ever faked an excuse to leave a bad date?", category: 'truth', heat: 2 },
  { text: "What's the most toxic trait you know you have?", category: 'truth', heat: 2 },
  { text: "What would your ex say is the reason things ended?", category: 'truth', heat: 2 },
  { text: "Have you ever gone back to someone you swore you were done with?", category: 'truth', heat: 2 },
  { text: "What secret about yourself would change how people see you?", category: 'truth', heat: 2 },
  { text: "What's the most jealous you've ever been?", category: 'truth', heat: 2 },
  { text: "Have you ever had a crush on someone in this room?", category: 'truth', heat: 2 },
  { text: "What's the most reckless thing you've done for love?", category: 'truth', heat: 2 },
  { text: "What's the worst thing you've done while drunk?", category: 'truth', heat: 2 },
  { text: "What's a red flag you willingly ignore?", category: 'truth', heat: 2 },

  // ---- Truth — Extreme (heat 3) ----
  { text: "What's the biggest secret you're keeping from someone close to you?", category: 'truth', heat: 3 },
  { text: "What's the most scandalous thing you've done that nobody knows about?", category: 'truth', heat: 3 },
  { text: "Who is someone you regret hooking up with?", category: 'truth', heat: 3 },
  { text: "What's the most embarrassing thing that happened to you in the bedroom?", category: 'truth', heat: 3 },
  { text: "What's the wildest message in your 'hidden' chat folder?", category: 'truth', heat: 3 },
  { text: "Have you ever had feelings for two people at the same time? Spill.", category: 'truth', heat: 3 },
  { text: "What's the worst betrayal you've ever committed?", category: 'truth', heat: 3 },
  { text: "What's a kink or preference you've never told anyone about?", category: 'truth', heat: 3 },
  { text: "What's the most inappropriate thought you've had about someone here?", category: 'truth', heat: 3 },
  { text: "If everyone's browser history was leaked, whose would shock you most?", category: 'truth', heat: 3 },

  // ---- Tease / Dare-lite — Mild (heat 1) ----
  { text: "Do your best impression of the person to your left.", category: 'tease', heat: 1 },
  { text: "Send a winking emoji to the last person in your DMs.", category: 'tease', heat: 1 },
  { text: "Let someone in the room write your next social media bio.", category: 'tease', heat: 1 },
  { text: "Talk in a seductive voice for the rest of this round.", category: 'tease', heat: 1 },
  { text: "Show the last photo in your camera roll (no deleting first!).", category: 'tease', heat: 1 },
  { text: "Give your best pick-up line to the person across from you.", category: 'tease', heat: 1 },
  { text: "Do 10 push-ups or take a sip of your drink.", category: 'tease', heat: 1 },
  { text: "Let someone go through your Spotify recently played.", category: 'tease', heat: 1 },
  { text: "Post an embarrassing selfie to your Story (you can delete in 1 min).", category: 'tease', heat: 1 },
  { text: "Text 'I miss you' to the third contact in your phone.", category: 'tease', heat: 1 },

  // ---- Tease — Spicy (heat 2) ----
  { text: "Let the group read your last 5 outgoing texts.", category: 'tease', heat: 2 },
  { text: "Call your crush and put it on speaker for 10 seconds.", category: 'tease', heat: 2 },
  { text: "Describe your ideal date in the most dramatic way possible.", category: 'tease', heat: 2 },
  { text: "Give a 30-second roast of the person who last spoke.", category: 'tease', heat: 2 },
  { text: "Demonstrate your go-to 'flirting technique' on camera.", category: 'tease', heat: 2 },
  { text: "Share the last thirst-trap you saved (screenshot counts).", category: 'tease', heat: 2 },
  { text: "Let the group pick someone — text them 'thinking about you 😏'.", category: 'tease', heat: 2 },
  { text: "Rate everyone in the room on a vibe scale 1-10 (explain why).", category: 'tease', heat: 2 },
  { text: "Whisper something flirty to the person the group picks.", category: 'tease', heat: 2 },
  { text: "Show the room the last person you searched on Instagram.", category: 'tease', heat: 2 },

  // ---- Tease — Extreme (heat 3) ----
  { text: "Read aloud the spiciest text you've ever sent.", category: 'tease', heat: 3 },
  { text: "Let the group compose a DM and send it from your account.", category: 'tease', heat: 3 },
  { text: "Confess your most embarrassing turn-on.", category: 'tease', heat: 3 },
  { text: "Narrate a fake steamy movie trailer starring you and whoever the group picks.", category: 'tease', heat: 3 },
  { text: "Describe the last dream you had about someone (keep it PG-13… ish).", category: 'tease', heat: 3 },
  { text: "Post 'I'm single and ready to mingle' on any social platform (delete in 1 min).", category: 'tease', heat: 3 },
  { text: "Let the room scroll through your DMs for 15 seconds.", category: 'tease', heat: 3 },
  { text: "Record a 10s voice note saying the cheesiest possible compliment to whoever the group picks.", category: 'tease', heat: 3 },
  { text: "Act out your most embarrassing moment — the group guesses what happened.", category: 'tease', heat: 3 },
  { text: "Send a fire emoji to the 7th person in your recent contacts.", category: 'tease', heat: 3 },
];

// ----------------------------------------
// Helpers
// ----------------------------------------

/**
 * Return `count` random questions, optionally filtered by maxHeat.
 * @param {number} count
 * @param {number} maxHeat  1 | 2 | 3  (default 3)
 * @returns {object[]}
 */
function getRandomQuestions(count = 1, maxHeat = 3) {
  const pool = questions.filter(q => q.heat <= maxHeat);
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

/**
 * Get a single random question.
 * @param {number} maxHeat
 * @returns {object}
 */
function getRandomQuestion(maxHeat = 3) {
  return getRandomQuestions(1, maxHeat)[0] || questions[0];
}

/**
 * Stats about the question bank.
 */
function getQuestionStats() {
  const truths = questions.filter(q => q.category === 'truth').length;
  const teases = questions.filter(q => q.category === 'tease').length;
  return { total: questions.length, truths, teases };
}

module.exports = { questions, getRandomQuestion, getRandomQuestions, getQuestionStats };
