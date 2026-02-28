// ============================================================
// BACHELOR MODE — Content
// ============================================================

// Sus Drawing: drawer has to illustrate a ridiculous scenario without words
const SUS_PROMPTS = [
  'Walk of shame at 6AM',
  'Left on read for 3 days',
  'Sliding into someone\'s DMs',
  'Drunk texting your ex',
  'Gym bro taking a mirror selfie',
  'Situationship energy',
  'Screaming into the void',
  'Ordering 3AM maggi alone',
  'Crying in the club bathroom',
  'Ghosting someone after 6 months',
  'Getting rejected on Tinder',
  'Pretending to be busy to cancel plans',
  'Friendzoned while holding flowers',
  'Falling asleep mid-date',
  'Flexing rented car on Instagram',
  'Panic buying flowers after a fight',
  'Watching Netflix instead of adulting',
  'Texting "I\'m almost there" from bed',
  'Eating ice cream and crying after a breakup',
  'Doing NPC dance at 2AM',
  'Blocking and unblocking your ex 5 times',
  'Showing up unannounced like a movie character',
  'Drinking alone and calling it "me time"',
  'Mansplaining something you clearly don\'t know',
];

// Caption This Disaster: players caption an absurd scenario
const CAPTION_SCENARIOS = [
  { scene: 'A raccoon in a suit is presenting a PowerPoint titled "Why I deserve a raise" to a board of pigeons.', label: 'Corporate Chaos' },
  { scene: 'Someone texting furiously under the table while loudly saying "I\'m totally listening."', label: 'Peak Attention Span' },
  { scene: 'Three people staring at a dog while completely ignoring each other.', label: 'We Only Like Dogs' },
  { scene: 'A man crying into his noodles at 3AM, lights off, fan at max speed.', label: '3AM Philosopher' },
  { scene: 'Someone power-walking in flip flops trying to look confident.', label: 'Work In Progress' },
  { scene: 'A person holding a glitter cannon pointed at their own face with the look of acceptance.', label: 'No Regrets' },
  { scene: 'Two people awkwardly reaching for the same samosa at a family function.', label: 'Family Function Chaos' },
  { scene: 'Someone smiling while their phone, wallet and keys are all missing.', label: 'Main Character Energy' },
  { scene: 'A person doing parkour over a tiny puddle for absolutely no reason.', label: 'Built Different' },
  { scene: 'Someone giving a TED Talk with the title "Why I\'m not the problem" to an empty room.', label: 'Self Awareness: 0%' },
  { scene: 'Two people fighting over the TV remote like it\'s a sword.', label: 'Sibling Bond' },
  { scene: 'A cat knocking a laptop off a table while its owner cries next to unpaid bills.', label: 'Support System' },
];

// Excuse Generator: players vote on whose excuse is most believable
const EXCUSE_PROMPTS = [
  'Why you were 45 minutes late to your own birthday party',
  'Why you accidentally responded to your boss\'s email with a meme',
  'Why you fell asleep during your own presentation',
  'Why you forgot your anniversary THREE years in a row',
  'Why you ate your housemate\'s labelled food',
  'Why you called your teacher "mum" in front of the whole class',
  'Why you replied to a group message at 3AM with "miss you"',
  'Why your phone was on silent during a family emergency',
  'Why you accidentally liked someone\'s post from 2016 while "not stalking"',
  'Why you told everyone you were sick but then you got caught at a concert',
  'Why you forgot to flush at a date\'s house',
  'Why you accidentally sent a voice note that changed everything',
  'Why you showed up to a formal dinner in shorts',
  'Why you started crying at a dog food commercial',
  'Why you swiped right on someone you then pretended not to know in real life',
];

// Rate the Rizz: players submit a pickup line / opener / rizz and get rated
const RIZZ_QUESTIONS = [
  'You have 10 seconds — sell yourself to someone you just met at a party',
  'Cold approach rizz: convince them to give you their number in ONE message',
  'Your situationship just posted a sad story. What do you reply?',
  'You matched with your crush. What\'s your opening line?',
  'Make a compliment so specific it becomes unhinged but somehow charming',
  'Your ex texted "hey". You have ONE reply. Make it legendary.',
  'Write the most chaotic bio you\'d actually put on a dating app',
  'You need to rizz your way out of being caught talking to two people at once. GO.',
  'Roast yourself in a way that somehow makes you more attractive',
  'Someone said you give "little sibling energy." Reclaim your power.',
  'You\'re about to be rejected — turn it around in one sentence',
];

// Lie Detector: one player makes a statement, others vote real or cap
const LIE_QUESTIONS = [
  'Tell everyone something about yourself that sounds made up but is totally real.',
  'Describe your most chaotic night out in one sentence — real or fictional.',
  'Share one story from your past that\'s either 100% true or 100% a lie. Others vote.',
  'Name a guilty pleasure habit. Others decide: real or performing for sympathy.',
  'Tell the group about a skill you claim to have. Real or cap?',
  'Describe your ideal relationship in two sentences. Real preference or what you think sounds good?',
  'Share a "conspiracy theory" you actually believe. Rate the delusion.',
  'Tell a childhood story. Everyone votes: real memory or fabricated trauma.',
  'Describe one thing you\'ve never told your parents. Real or safe cover story?',
  'Make a claim about what you were doing at 2AM last Tuesday.',
];

// Drunk Logic: vote on whose reasoning is most unhinged
const DRUNK_LOGIC_PROMPTS = [
  'Explain why pineapple on pizza is actually praxis with full confidence.',
  'Justify staying up until 4AM "for your mental health."',
  'Convince the group that ghosts are just socially anxious people.',
  'Argue: sending a contact as a reply to a DM is technically an answer.',
  '"Blocking someone is actually the most respectful thing you can do." — defend this.',
  'Convince everyone that the moon landing was staged but only because NASA was shy.',
  'Explain why ignoring 47 unread notifications is a form of minimalism.',
  '"Going to the gym once makes me a gym person now." — make your case.',
  'Defend: eating cereal as your third meal of the day is a complete protein.',
  '"Replying at 11:59PM technically counts as replying same day." — fight for this.',
  '"Netflix and sleep" is a legitimate wellness practice. Convince the group.',
  'Explain why being chronically online has made you deeply spiritual.',
];

// Brief narrator intros shown before each mini-game
const NARRATOR_INTROS = {
  sus:         { name: 'Sus Drawing',           emoji: '🖊️' },
  caption:     { name: 'Caption This Disaster', emoji: '💬' },
  excuse:      { name: 'Excuse Generator',      emoji: '🤥' },
  rizz:        { name: 'Rate the Rizz',         emoji: '🔥' },
  liedetector: { name: 'Lie Detector',          emoji: '🤔' },
  drunklogic:  { name: 'Drunk Logic',           emoji: '🍺' },
};

module.exports = {
  SUS_PROMPTS,
  CAPTION_SCENARIOS,
  EXCUSE_PROMPTS,
  RIZZ_QUESTIONS,
  LIE_QUESTIONS,
  DRUNK_LOGIC_PROMPTS,
  NARRATOR_INTROS,
};
