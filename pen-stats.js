// Play styles and performance stats for each Fresh pen line, on a 1-10 scale (5 is average).
// Every line spends the same 24 points, so each one trades something for its strength.
//   speed - how fast (and so how far) a flick sends the pen
//   power - heavier, harder-hitting pens are harder to knock away, but launch a little slower
//   grip  - high grip stops sooner and stays on the desk; low grip glides further
//   spin  - how much an off-centre flick spins the pen
(function (root) {
  'use strict';

  // A style is led by one stat (or by none, for the all-rounder).
  const STYLES = {
    speedster: {
      name: 'Speedster',
      icon: '⚡',
      lead: 'speed',
      colour: '#f0b429',
      blurb: 'Hit first, hit far. Reach across the whole desk in one flick.',
      tip: 'Low grip: ease off near the edge or you will slide straight off.',
    },
    powerhouse: {
      name: 'Powerhouse',
      icon: '💪',
      lead: 'power',
      colour: '#d1252b',
      blurb: 'Heavy hitter. Shove rivals off and shrug off their hits.',
      tip: 'Slower off the mark: close the distance before you swing.',
    },
    precision: {
      name: 'Precision',
      icon: '🎯',
      lead: 'grip',
      colour: '#2f9e6e',
      blurb: 'Stops where you aim. Line up the perfect shot and stay safe.',
      tip: 'Short glide: pull back further for long shots.',
    },
    trickster: {
      name: 'Trickster',
      icon: '🌀',
      lead: 'spin',
      colour: '#7b4fd6',
      blurb: 'Curve, twist and hook. Win with shots nobody sees coming.',
      tip: 'Grab near a tip to unleash the spin.',
    },
    allrounder: {
      name: 'All-rounder',
      icon: '⚖️',
      lead: null,
      colour: '#2f6fd6',
      blurb: 'No weak spots. Adapts to any desk and any rival.',
      tip: 'Good at everything: play the situation.',
    },
  };

  const PEN_STATS = {
    sprint: { style: 'speedster', speed: 10, power: 4, grip: 3, spin: 7, tagline: 'Fastest pen on the desk. Brakes optional.' },
    shine: { style: 'speedster', speed: 9, power: 5, grip: 3, spin: 7, tagline: 'Slick finish, blistering pace. Mind the edge.' },
    sailor: { style: 'speedster', speed: 8, power: 5, grip: 4, spin: 7, tagline: 'Fast and smooth, rides the grain like a wave.' },
    inkforce: { style: 'powerhouse', speed: 5, power: 9, grip: 6, spin: 4, tagline: 'Built like a tank. Shrugs off hits, lands heavy ones.' },
    classroom: { style: 'powerhouse', speed: 5, power: 8, grip: 7, spin: 4, tagline: 'Sturdy and steady. Hard to move, harder to beat.' },
    campus: { style: 'powerhouse', speed: 6, power: 7, grip: 6, spin: 5, tagline: 'Solid build with a mean shove.' },
    'icon-signature': { style: 'precision', speed: 6, power: 5, grip: 9, spin: 4, tagline: 'Signs off exactly where you aim.' },
    'good-day': { style: 'precision', speed: 6, power: 4, grip: 8, spin: 6, tagline: 'Light, calm and easy to control.' },
    emoji: { style: 'trickster', speed: 6, power: 4, grip: 4, spin: 10, tagline: 'Spin king. Hook shots nobody sees coming.' },
    pastello: { style: 'trickster', speed: 7, power: 3, grip: 5, spin: 9, tagline: 'Light as a feather, twirls like a dancer.' },
    icon: { style: 'trickster', speed: 7, power: 5, grip: 4, spin: 8, tagline: 'The crowd favourite. Quick with a wicked curve.' },
    allrounder: { style: 'allrounder', speed: 6, power: 6, grip: 6, spin: 6, tagline: 'No weak spots. The safe pick for any desk.' },
  };

  const STAT_NAMES = [
    ['speed', 'Speed'],
    ['power', 'Power'],
    ['grip', 'Grip'],
    ['spin', 'Spin'],
  ];

  // "Find my style" quiz: a pool of questions; each answer scores one style. Five are asked at random.
  const QUIZ = [
    {
      q: "Exam starts in 2 minutes and you can't find your pen. You…",
      a: [
        ['🏃', 'Sprint to the stationery shop and back', 'speedster'],
        ['💪', 'Borrow the biggest pen in the room', 'powerhouse'],
        ['🎒', 'You never lose your pen. It is in pocket 3.', 'precision'],
        ['🪄', 'Pull a spare from behind your ear', 'trickster'],
      ],
    },
    {
      q: 'Pick a superpower for one day:',
      a: [
        ['⚡', 'Super speed', 'speedster'],
        ['🦾', 'Super strength', 'powerhouse'],
        ['🔭', 'Perfect aim', 'precision'],
        ['🌀', 'Bend things with your mind', 'trickster'],
      ],
    },
    {
      q: "A friend borrows your pen and doesn't give it back. You…",
      a: [
        ['💨', 'Snatch it back before they notice', 'speedster'],
        ['😤', 'Walk over and demand it, loudly', 'powerhouse'],
        ['📝', 'You wrote your name on it. Case closed.', 'precision'],
        ['😏', 'Swap it for a pen that has run out', 'trickster'],
      ],
    },
    {
      q: 'Your handwriting is…',
      a: [
        ['🏎️', 'Fast. Readable? Sometimes.', 'speedster'],
        ['🖊️', 'Bold and pressed hard into the page', 'powerhouse'],
        ['📏', 'Neat enough to frame', 'precision'],
        ['🎨', 'Loops, swirls and doodles everywhere', 'trickster'],
      ],
    },
    {
      q: 'Cricket match at lunch. You are the…',
      a: [
        ['🏃', 'Fast bowler', 'speedster'],
        ['🏏', 'Big-hitting batter', 'powerhouse'],
        ['🧤', 'Wicketkeeper who never drops a catch', 'precision'],
        ['🌪️', 'Spin bowler nobody can read', 'trickster'],
      ],
    },
    {
      q: 'Your rival’s pen is right in the middle of the desk. You…',
      a: [
        ['🚀', 'Fire across at full speed', 'speedster'],
        ['🐘', 'Barge in and shove it off', 'powerhouse'],
        ['🎯', 'Wait for the perfect angle', 'precision'],
        ['🔄', 'Curve in a hook shot from the side', 'trickster'],
      ],
    },
    {
      q: 'Pick a snack for the tiffin break:',
      a: [
        ['🍫', 'Chocolate: instant energy', 'speedster'],
        ['🍛', 'A full plate of biryani', 'powerhouse'],
        ['🍎', 'An apple, cut into equal slices', 'precision'],
        ['🍬', 'A mystery sweet with a surprise filling', 'trickster'],
      ],
    },
    {
      q: 'Homework is due tomorrow. You…',
      a: [
        ['⏱️', 'Finish it in 10 minutes flat', 'speedster'],
        ['📚', 'Power through every single question', 'powerhouse'],
        ['✅', 'Did it last week, double-checked', 'precision'],
        ['💡', 'Find a clever shortcut nobody thought of', 'trickster'],
      ],
    },
    {
      q: 'Which game would you rather win?',
      a: [
        ['🏁', 'A race', 'speedster'],
        ['🤼', 'A tug of war', 'powerhouse'],
        ['🎳', 'A perfect bowling strike', 'precision'],
        ['🃏', 'A magic trick contest', 'trickster'],
      ],
    },
    {
      q: 'Your friends describe you as…',
      a: [
        ['⚡', 'Always first, always in a hurry', 'speedster'],
        ['🛡️', 'The strong one nobody messes with', 'powerhouse'],
        ['🧠', 'Careful, calm, never wrong', 'precision'],
        ['🎭', 'Full of surprises', 'trickster'],
      ],
    },
  ];
  const QUIZ_LENGTH = 5;

  // Share of answers per style, highest first: [[style, 0.6], [style, 0.2], ...].
  function quizBreakdown(answers) {
    const tally = {};
    for (const s of answers) tally[s] = (tally[s] || 0) + 1;
    return Object.entries(tally)
      .map(([s, n]) => [s, n / answers.length])
      .sort((a, b) => b[1] - a[1]);
  }

  // Most-picked style wins; a tie at the top means you like a bit of everything.
  function quizResult(answers) {
    const tally = {};
    for (const s of answers) tally[s] = (tally[s] || 0) + 1;
    const best = Math.max(...Object.values(tally));
    const top = Object.keys(tally).filter((s) => tally[s] === best);
    return top.length === 1 ? top[0] : 'allrounder';
  }

  const api = { STYLES, PEN_STATS, STAT_NAMES, QUIZ, QUIZ_LENGTH, quizResult, quizBreakdown };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof window !== 'undefined' ? window : globalThis);
