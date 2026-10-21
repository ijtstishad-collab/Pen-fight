// Performance stats for each Fresh pen line, on a 1-10 scale (5 is average).
// Every line spends the same 24 points, so each one trades something for its strength.
//   speed  - how fast (and so how far) a flick sends the pen
//   weight - heavier pens hit harder and are harder to knock away, but launch a little slower
//   grip   - high grip stops sooner and stays on the desk; low grip glides further
//   spin   - how much an off-centre flick spins the pen
(function (root) {
  'use strict';

  const PEN_STATS = {
    icon: { speed: 7, weight: 5, grip: 5, spin: 7, tagline: 'The crowd favourite. Quick with a wicked curve.' },
    'icon-signature': { speed: 7, weight: 6, grip: 7, spin: 4, tagline: 'Precise and planted. Goes where you aim it.' },
    inkforce: { speed: 5, weight: 9, grip: 6, spin: 4, tagline: 'Built like a tank. Shrugs off hits, lands heavy ones.' },
    pastello: { speed: 7, weight: 3, grip: 5, spin: 9, tagline: 'Light as a feather, twirls like a dancer.' },
    allrounder: { speed: 6, weight: 6, grip: 6, spin: 6, tagline: 'No weak spots. The safe pick for any desk.' },
    emoji: { speed: 6, weight: 4, grip: 4, spin: 10, tagline: 'Spin king. Hook shots nobody sees coming.' },
    shine: { speed: 9, weight: 5, grip: 3, spin: 7, tagline: 'Slick finish, blistering pace. Mind the edge.' },
    sailor: { speed: 8, weight: 5, grip: 4, spin: 7, tagline: 'Fast and smooth, rides the grain like a wave.' },
    classroom: { speed: 5, weight: 8, grip: 7, spin: 4, tagline: 'Sturdy and steady. Hard to move, harder to beat.' },
    campus: { speed: 6, weight: 7, grip: 6, spin: 5, tagline: 'Solid all-rounder with extra muscle.' },
    'good-day': { speed: 8, weight: 4, grip: 6, spin: 6, tagline: 'Light, quick and easy to control.' },
    sprint: { speed: 10, weight: 4, grip: 3, spin: 7, tagline: 'Fastest pen on the desk. Brakes optional.' },
  };

  const STAT_NAMES = [
    ['speed', 'Speed'],
    ['weight', 'Weight'],
    ['grip', 'Grip'],
    ['spin', 'Spin'],
  ];

  const api = { PEN_STATS, STAT_NAMES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof window !== 'undefined' ? window : globalThis);
