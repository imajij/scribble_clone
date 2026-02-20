// ========================================
// TRUTH OR TEASE LIVE — Question Bank (Couples Edition 18+)
// ========================================
//
// Designed for couples / partners playing together.
// Categories: truth, tease
// heat: 1 = mild, 2 = spicy, 3 = extreme

const questions = [
  // ---- Truth — Mild (heat 1) ----
  { text: "What was your very first impression of your partner?", category: 'truth', heat: 1 },
  { text: "What's the most attractive thing your partner does without realizing it?", category: 'truth', heat: 1 },
  { text: "What's a secret guilty pleasure you haven't told your partner about?", category: 'truth', heat: 1 },
  { text: "When did you first realize you were falling for your partner?", category: 'truth', heat: 1 },
  { text: "What's something your partner does that secretly annoys you but you've never mentioned?", category: 'truth', heat: 1 },
  { text: "What's the most romantic thing your partner has ever done for you?", category: 'truth', heat: 1 },
  { text: "What outfit does your partner wear that drives you crazy (in a good way)?", category: 'truth', heat: 1 },
  { text: "What's one thing you wish you could change about your relationship?", category: 'truth', heat: 1 },
  { text: "If you could relive one moment in your relationship, which would it be?", category: 'truth', heat: 1 },
  { text: "What's the cheesiest thing you've done to impress your partner?", category: 'truth', heat: 1 },
  { text: "What love song makes you think of your partner?", category: 'truth', heat: 1 },
  { text: "What's the weirdest dream you've had about your partner?", category: 'truth', heat: 1 },
  { text: "What were you most nervous about on your first date together?", category: 'truth', heat: 1 },
  { text: "What's your partner's most endearing habit?", category: 'truth', heat: 1 },
  { text: "What's one thing you'd like to do together that you haven't done yet?", category: 'truth', heat: 1 },

  // ---- Truth — Spicy (heat 2) ----
  { text: "What's the biggest lie you've told your partner (even a small one)?", category: 'truth', heat: 2 },
  { text: "What's the naughtiest text you've ever sent your partner?", category: 'truth', heat: 2 },
  { text: "Have you ever fantasized about someone else while with your partner?", category: 'truth', heat: 2 },
  { text: "What's the most adventurous place you'd want to get intimate with your partner?", category: 'truth', heat: 2 },
  { text: "What's something you've always wanted your partner to do in bed but haven't asked for?", category: 'truth', heat: 2 },
  { text: "What's the hottest thing your partner has ever said to you?", category: 'truth', heat: 2 },
  { text: "If you could have your partner for one hour with zero judgments, what would you do?", category: 'truth', heat: 2 },
  { text: "What part of your partner's body are you most obsessed with?", category: 'truth', heat: 2 },
  { text: "What's a role play scenario you'd be down to try together?", category: 'truth', heat: 2 },
  { text: "What's the most jealous you've ever been in this relationship?", category: 'truth', heat: 2 },
  { text: "What's one thing your partner wears (or doesn't wear) that instantly turns you on?", category: 'truth', heat: 2 },
  { text: "Have you ever snooped through your partner's phone? What did you find?", category: 'truth', heat: 2 },
  { text: "What's the most embarrassing thing that's happened during intimacy together?", category: 'truth', heat: 2 },
  { text: "Rate your first kiss with your partner — honestly.", category: 'truth', heat: 2 },
  { text: "Describe the moment you were most physically attracted to your partner.", category: 'truth', heat: 2 },

  // ---- Truth — Extreme (heat 3) ----
  { text: "What's your deepest, most secret fantasy involving your partner?", category: 'truth', heat: 3 },
  { text: "What's the kinkiest thing you've ever done together and would you do it again?", category: 'truth', heat: 3 },
  { text: "Have you ever faked it with your partner? Be honest.", category: 'truth', heat: 3 },
  { text: "What's the wildest thing you've done together that nobody else knows about?", category: 'truth', heat: 3 },
  { text: "Describe in detail your best intimate moment together.", category: 'truth', heat: 3 },
  { text: "What's a kink or fetish you've been too shy to bring up?", category: 'truth', heat: 3 },
  { text: "If you could watch a replay of one of your intimate moments together, which one?", category: 'truth', heat: 3 },
  { text: "What's something your partner does in bed that they don't know drives you absolutely wild?", category: 'truth', heat: 3 },
  { text: "What's the longest you could go without touching your partner?", category: 'truth', heat: 3 },
  { text: "If your partner dared you to do something right now, what's the one thing you secretly hope they'd ask?", category: 'truth', heat: 3 },

  // ---- Tease / Dare-lite — Mild (heat 1) ----
  { text: "Give your partner a genuine 30-second compliment — make it deep.", category: 'tease', heat: 1 },
  { text: "Re-enact the first time you met your partner.", category: 'tease', heat: 1 },
  { text: "Whisper something sweet in your partner's ear.", category: 'tease', heat: 1 },
  { text: "Give your partner a sensual hand massage for 60 seconds.", category: 'tease', heat: 1 },
  { text: "Slow dance with your partner for one full minute — no music needed.", category: 'tease', heat: 1 },
  { text: "Look into your partner's eyes for 60 seconds without laughing.", category: 'tease', heat: 1 },
  { text: "Give your partner 3 butterfly kisses on different spots.", category: 'tease', heat: 1 },
  { text: "Write a quick love note to your partner and read it aloud.", category: 'tease', heat: 1 },
  { text: "Do your best impression of your partner when they're flirting.", category: 'tease', heat: 1 },
  { text: "Feed your partner something flirtatiously.", category: 'tease', heat: 1 },

  // ---- Tease — Spicy (heat 2) ----
  { text: "Give your partner a 60-second neck and shoulder massage.", category: 'tease', heat: 2 },
  { text: "Do a seductive slow dance/strip tease for your partner (clothes stay on… for now).", category: 'tease', heat: 2 },
  { text: "Whisper your biggest turn-on into your partner's ear.", category: 'tease', heat: 2 },
  { text: "Trace a word on your partner's back with your finger — they have to guess it.", category: 'tease', heat: 2 },
  { text: "Kiss your partner's neck slowly for 15 seconds.", category: 'tease', heat: 2 },
  { text: "Demonstrate on your partner exactly how you like to be kissed.", category: 'tease', heat: 2 },
  { text: "Describe what you want to do to your partner later tonight — in detail.", category: 'tease', heat: 2 },
  { text: "Let your partner blindfold you and feed you 3 things — guess each one.", category: 'tease', heat: 2 },
  { text: "Give your partner a lap dance for 30 seconds — sell it.", category: 'tease', heat: 2 },
  { text: "Text your partner the spiciest thing you can think of — right now.", category: 'tease', heat: 2 },

  // ---- Tease — Extreme (heat 3) ----
  { text: "Remove one article of clothing — your partner's choice.", category: 'tease', heat: 3 },
  { text: "Blindfold your partner and kiss them in 5 different places.", category: 'tease', heat: 3 },
  { text: "Act out your partner's favorite bedroom move — without touching (yet).", category: 'tease', heat: 3 },
  { text: "Give your partner an ice cube kiss — hold the ice between your lips.", category: 'tease', heat: 3 },
  { text: "Let your partner draw on you anywhere they want with a marker or lip liner.", category: 'tease', heat: 3 },
  { text: "Send your partner a voice note describing your wildest fantasy about them.", category: 'tease', heat: 3 },
  { text: "Your partner picks a body part — you worship it for 30 seconds.", category: 'tease', heat: 3 },
  { text: "Role-play: introduce yourself to your partner as a stranger at a bar.", category: 'tease', heat: 3 },
  { text: "Show your partner your best 'come hither' look and hold it for 10 seconds.", category: 'tease', heat: 3 },
  { text: "Take a steamy couples selfie right now — keep or delete is your call.", category: 'tease', heat: 3 },
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
