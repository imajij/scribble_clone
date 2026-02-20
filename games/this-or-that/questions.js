// ========================================
// THIS OR THAT — Question Bank (Couples Edition 18+)
// ========================================
// Designed for couples / partners playing together.
// Each question has { text, optionA, optionB, category, heat }
// heat: 1 = mild, 2 = spicy, 3 = extreme

const questions = [
  // ── Mild (heat 1) — romantic / fun ──
  { text: "Would you rather...", optionA: "Relive your first date forever", optionB: "Fast-forward to your 50th anniversary", category: 'romance', heat: 1 },
  { text: "Would you rather...", optionA: "Get a couples massage every week", optionB: "Have a private chef cook dinner every week", category: 'romance', heat: 1 },
  { text: "Would you rather...", optionA: "Know exactly what your partner is thinking", optionB: "Have them always know what you're thinking", category: 'deep', heat: 1 },
  { text: "Would you rather...", optionA: "Have matching tattoos", optionB: "Have matching piercings", category: 'fun', heat: 1 },
  { text: "Would you rather...", optionA: "Spend a weekend in a cabin together", optionB: "Spend a weekend on a tropical beach together", category: 'romance', heat: 1 },
  { text: "Would you rather...", optionA: "Your partner cooks for you every night", optionB: "Your partner surprises you with date nights", category: 'romance', heat: 1 },
  { text: "Would you rather...", optionA: "Receive a handwritten love letter", optionB: "Receive a surprise playlist made just for you", category: 'romance', heat: 1 },
  { text: "Would you rather...", optionA: "Stay in with a movie night", optionB: "Go out dancing until midnight", category: 'fun', heat: 1 },
  { text: "Would you rather...", optionA: "Be the big spoon forever", optionB: "Be the little spoon forever", category: 'fun', heat: 1 },
  { text: "Would you rather...", optionA: "Your partner always picks the restaurant", optionB: "You always pick the restaurant", category: 'fun', heat: 1 },
  { text: "Would you rather...", optionA: "Never argue but never make up passionately", optionB: "Argue sometimes but always have amazing make-up moments", category: 'deep', heat: 1 },
  { text: "Would you rather...", optionA: "Your partner writes you a poem daily", optionB: "Your partner gives you a morning kiss daily", category: 'romance', heat: 1 },
  { text: "Would you rather...", optionA: "Have a couples bucket list you check off together", optionB: "Surprise each other with spontaneous adventures", category: 'fun', heat: 1 },
  { text: "Would you rather...", optionA: "Live in a tiny apartment together in Paris", optionB: "Live in a big house together in the countryside", category: 'fun', heat: 1 },
  { text: "Would you rather...", optionA: "Your partner always says 'I love you' first", optionB: "You always say 'I love you' first", category: 'deep', heat: 1 },

  // ── Spicy (heat 2) — intimate / relationship ──
  { text: "Would you rather...", optionA: "Your partner reads all your texts", optionB: "You read all of your partner's texts", category: 'relationship', heat: 2 },
  { text: "Would you rather...", optionA: "Have an incredible one-night honeymoon phase", optionB: "A slow-burn romance that gets better every year", category: 'relationship', heat: 2 },
  { text: "Would you rather...", optionA: "Your partner gives amazing massages", optionB: "Your partner is an incredible kisser", category: 'intimate', heat: 2 },
  { text: "Would you rather...", optionA: "Only have morning intimacy", optionB: "Only have late-night intimacy", category: 'intimate', heat: 2 },
  { text: "Would you rather...", optionA: "Receive a sensual text right now", optionB: "Send a sensual text right now", category: 'intimate', heat: 2 },
  { text: "Would you rather...", optionA: "Your partner initiates every time", optionB: "You initiate every time", category: 'intimate', heat: 2 },
  { text: "Would you rather...", optionA: "Have a surprise romantic weekend planned for you", optionB: "Plan a surprise romantic weekend for your partner", category: 'relationship', heat: 2 },
  { text: "Would you rather...", optionA: "Your partner is amazing at dirty talk", optionB: "Your partner is amazing at setting the mood", category: 'intimate', heat: 2 },
  { text: "Would you rather...", optionA: "Be handcuffed by your partner for an hour", optionB: "Handcuff your partner for an hour", category: 'intimate', heat: 2 },
  { text: "Would you rather...", optionA: "Play truth or dare with just your partner all night", optionB: "Play strip poker with just your partner all night", category: 'intimate', heat: 2 },
  { text: "Would you rather...", optionA: "Your partner whispers something filthy in public", optionB: "Your partner grabs you unexpectedly in private", category: 'intimate', heat: 2 },
  { text: "Would you rather...", optionA: "Take a steamy shower together every day", optionB: "Take a long bubble bath together every week", category: 'intimate', heat: 2 },
  { text: "Would you rather...", optionA: "Get a full-body massage from your partner", optionB: "Give a full-body massage to your partner", category: 'intimate', heat: 2 },
  { text: "Would you rather...", optionA: "Your partner slowly undresses you", optionB: "You slowly undress your partner", category: 'intimate', heat: 2 },
  { text: "Would you rather...", optionA: "Dance provocatively for your partner", optionB: "Have your partner dance provocatively for you", category: 'intimate', heat: 2 },

  // ── Extreme (heat 3) — NSFW couples ──
  { text: "Would you rather...", optionA: "Try a new position every time", optionB: "Perfect the one you both love most", category: 'nsfw', heat: 3 },
  { text: "Would you rather...", optionA: "Use a blindfold tonight", optionB: "Use handcuffs tonight", category: 'nsfw', heat: 3 },
  { text: "Would you rather...", optionA: "Watch your partner do a strip tease", optionB: "Do a strip tease for your partner", category: 'nsfw', heat: 3 },
  { text: "Would you rather...", optionA: "Have a completely silent intimate session", optionB: "Be as loud as you possibly can", category: 'nsfw', heat: 3 },
  { text: "Would you rather...", optionA: "Your partner takes charge completely", optionB: "You take charge completely", category: 'nsfw', heat: 3 },
  { text: "Would you rather...", optionA: "Quickie in a risky location", optionB: "Long session in a luxury hotel", category: 'nsfw', heat: 3 },
  { text: "Would you rather...", optionA: "Only foreplay for an entire evening", optionB: "Skip to the main event right away", category: 'nsfw', heat: 3 },
  { text: "Would you rather...", optionA: "Try role play with costumes", optionB: "Try something from your partner's fantasy list", category: 'nsfw', heat: 3 },
  { text: "Would you rather...", optionA: "Your partner ties you up", optionB: "You tie up your partner", category: 'nsfw', heat: 3 },
  { text: "Would you rather...", optionA: "Use whipped cream and chocolate sauce", optionB: "Use ice cubes and warm oil", category: 'nsfw', heat: 3 },
  { text: "Would you rather...", optionA: "Let your partner pick your outfit for a date night, no veto", optionB: "Let your partner pick what you wear to bed, no veto", category: 'nsfw', heat: 3 },
  { text: "Would you rather...", optionA: "Intimate session with candles and music", optionB: "Spontaneous, passionate, no-planning-needed session", category: 'nsfw', heat: 3 },
  { text: "Would you rather...", optionA: "Wake up to your partner's mouth on yours", optionB: "Wake up to your partner's hands exploring", category: 'nsfw', heat: 3 },
  { text: "Would you rather...", optionA: "Leave a hickey on your partner wherever they choose", optionB: "Let your partner leave a hickey on you wherever they choose", category: 'nsfw', heat: 3 },
  { text: "Would you rather...", optionA: "Film a private video together you never show anyone", optionB: "Take polaroids of each other you hide in a drawer", category: 'nsfw', heat: 3 },
];

/**
 * Get a random question at or below given heat level, avoiding used ones.
 */
function getRandomQuestion(maxHeat, usedSet) {
  const pool = questions.filter(q => q.heat <= maxHeat && !usedSet.has(q.optionA + '|' + q.optionB));
  if (pool.length === 0) {
    // Reset if exhausted
    usedSet.clear();
    return questions.filter(q => q.heat <= maxHeat)[Math.floor(Math.random() * questions.filter(q => q.heat <= maxHeat).length)];
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

function getQuestionStats() {
  return {
    total: questions.length,
    byHeat: {
      mild: questions.filter(q => q.heat === 1).length,
      spicy: questions.filter(q => q.heat === 2).length,
      extreme: questions.filter(q => q.heat === 3).length,
    }
  };
}

module.exports = { questions, getRandomQuestion, getQuestionStats };
