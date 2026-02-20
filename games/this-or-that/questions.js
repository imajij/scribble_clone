// ========================================
// THIS OR THAT — Question Bank
// ========================================
// Each question has { text, optionA, optionB, category, heat }
// heat: 1 = mild, 2 = spicy, 3 = extreme

const questions = [
  // ── Mild (heat 1) ──
  { text: "Would you rather...", optionA: "Know everyone's secrets", optionB: "Have no one know yours", category: 'social', heat: 1 },
  { text: "Would you rather...", optionA: "Be famous on TikTok", optionB: "Be rich but anonymous", category: 'social', heat: 1 },
  { text: "Would you rather...", optionA: "Always speak your mind", optionB: "Never offend anyone", category: 'social', heat: 1 },
  { text: "Would you rather...", optionA: "Only eat pizza forever", optionB: "Only eat sushi forever", category: 'fun', heat: 1 },
  { text: "Would you rather...", optionA: "Time travel to the past", optionB: "Time travel to the future", category: 'fun', heat: 1 },
  { text: "Would you rather...", optionA: "Have unlimited money", optionB: "Have unlimited free time", category: 'fun', heat: 1 },
  { text: "Would you rather...", optionA: "Live in the mountains", optionB: "Live on the beach", category: 'fun', heat: 1 },
  { text: "Would you rather...", optionA: "Be a morning person", optionB: "Be a night owl forever", category: 'fun', heat: 1 },
  { text: "Would you rather...", optionA: "Know how you die", optionB: "Know when you die", category: 'deep', heat: 1 },
  { text: "Would you rather...", optionA: "Read minds", optionB: "Be invisible", category: 'fun', heat: 1 },
  { text: "Would you rather...", optionA: "Live without music", optionB: "Live without movies", category: 'fun', heat: 1 },
  { text: "Would you rather...", optionA: "Have a rewind button for life", optionB: "Have a pause button for life", category: 'deep', heat: 1 },
  { text: "Would you rather...", optionA: "Never use social media again", optionB: "Never watch TV again", category: 'social', heat: 1 },
  { text: "Would you rather...", optionA: "Always be 10 min late", optionB: "Always be 20 min early", category: 'fun', heat: 1 },
  { text: "Would you rather...", optionA: "Speak every language fluently", optionB: "Play every instrument perfectly", category: 'fun', heat: 1 },

  // ── Spicy (heat 2) ──
  { text: "Would you rather...", optionA: "Date your best friend's ex", optionB: "Have your ex date your best friend", category: 'relationship', heat: 2 },
  { text: "Would you rather...", optionA: "Have your partner read all your DMs", optionB: "Read all of theirs", category: 'relationship', heat: 2 },
  { text: "Would you rather...", optionA: "Accidentally like an ex's old photo", optionB: "Send a text meant for your ex to your current partner", category: 'social', heat: 2 },
  { text: "Would you rather...", optionA: "Be with someone who's bad at texting", optionB: "Be with someone who's too clingy", category: 'relationship', heat: 2 },
  { text: "Would you rather...", optionA: "Have an open phone policy", optionB: "Have total phone privacy", category: 'relationship', heat: 2 },
  { text: "Would you rather...", optionA: "Kiss a stranger for $1000", optionB: "Let your partner kiss a stranger for $1000", category: 'relationship', heat: 2 },
  { text: "Would you rather...", optionA: "Be cheated on and never know", optionB: "Be cheated on and find out immediately", category: 'relationship', heat: 2 },
  { text: "Would you rather...", optionA: "Have a rebound fling that goes wrong", optionB: "Stay heartbroken for 6 months", category: 'relationship', heat: 2 },
  { text: "Would you rather...", optionA: "Have an amazing first date but terrible relationship", optionB: "Terrible first date but amazing relationship", category: 'relationship', heat: 2 },
  { text: "Would you rather...", optionA: "Date someone who's way too honest", optionB: "Date someone who's a great liar", category: 'relationship', heat: 2 },
  { text: "Would you rather...", optionA: "Be ghosted after 3 amazing dates", optionB: "Be rejected on the first date honestly", category: 'relationship', heat: 2 },
  { text: "Would you rather...", optionA: "Your partner forgets your birthday", optionB: "Your partner posts a cringey public tribute", category: 'social', heat: 2 },
  { text: "Would you rather...", optionA: "Go through your crush's search history", optionB: "Have them go through yours", category: 'social', heat: 2 },
  { text: "Would you rather...", optionA: "Have one epic love that ends badly", optionB: "Have a safe, comfortable forever relationship", category: 'deep', heat: 2 },
  { text: "Would you rather...", optionA: "Always get caught lying", optionB: "Never know if someone is lying to you", category: 'deep', heat: 2 },

  // ── Extreme (heat 3) ──
  { text: "Would you rather...", optionA: "Have your browser history projected at your wedding", optionB: "Have your DMs read at your funeral", category: 'extreme', heat: 3 },
  { text: "Would you rather...", optionA: "Your partner sees your hidden folder", optionB: "Your boss sees your hidden folder", category: 'extreme', heat: 3 },
  { text: "Would you rather...", optionA: "Send your most embarrassing selfie to everyone", optionB: "Have your most embarrassing moment on YouTube", category: 'extreme', heat: 3 },
  { text: "Would you rather...", optionA: "Walk in on your parents", optionB: "Have them walk in on you", category: 'extreme', heat: 3 },
  { text: "Would you rather...", optionA: "Sext a stranger by accident", optionB: "Have a stranger sext you by accident", category: 'extreme', heat: 3 },
  { text: "Would you rather...", optionA: "Date someone with terrible hygiene but great personality", optionB: "Date someone gorgeous but painfully boring", category: 'extreme', heat: 3 },
  { text: "Would you rather...", optionA: "Hook up with someone who talks too much during", optionB: "Hook up with someone completely silent", category: 'extreme', heat: 3 },
  { text: "Would you rather...", optionA: "Have a one-night stand that's unforgettable", optionB: "A long relationship that's mediocre in bed", category: 'extreme', heat: 3 },
  { text: "Would you rather...", optionA: "Have your ex at every party you go to", optionB: "Never go to parties again", category: 'extreme', heat: 3 },
  { text: "Would you rather...", optionA: "Loud and embarrassing in bed", optionB: "Silent and awkward in bed", category: 'extreme', heat: 3 },
  { text: "Would you rather...", optionA: "Your crush reads your diary", optionB: "Your crush sees your screen time report", category: 'extreme', heat: 3 },
  { text: "Would you rather...", optionA: "Someone you despise finds you irresistible", optionB: "Someone you adore finds you repulsive", category: 'extreme', heat: 3 },
  { text: "Would you rather...", optionA: "Your partner's body count is 100+", optionB: "Your partner's body count is 0", category: 'extreme', heat: 3 },
  { text: "Would you rather...", optionA: "Be amazing at flirting but terrible in relationships", optionB: "Be awful at flirting but amazing in relationships", category: 'extreme', heat: 3 },
  { text: "Would you rather...", optionA: "Your parents see your OnlyFans", optionB: "Your coworkers see your OnlyFans", category: 'extreme', heat: 3 },
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
