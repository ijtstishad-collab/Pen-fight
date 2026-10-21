// Computer opponent: tries candidate flicks in a copy of the world and keeps the best outcome.
(function (root) {
  'use strict';

  const P = typeof module !== 'undefined' && module.exports ? require('./physics.js') : root.PenPhysics;

  const LEVELS = {
    easy: { samples: 30, aimNoise: 0.2, powerNoise: 0.18 },
    normal: { samples: 90, aimNoise: 0.07, powerNoise: 0.07 },
    hard: { samples: 220, aimNoise: 0.02, powerNoise: 0.02 },
  };

  function score(pens, me) {
    const self = pens[me];
    const foe = pens[1 - me];
    if (self.out) return -1000;
    if (foe.out) return 1000 + Math.min(P.edgeDistance(self), 150);
    // Push the opponent towards an edge while staying away from one.
    return (260 - P.edgeDistance(foe)) + Math.min(P.edgeDistance(self), 160) * 0.8;
  }

  function evaluate(pens, me, shot) {
    const sim = P.clonePens(pens);
    P.flick(sim[me], shot.s, shot.dx, shot.dy, shot.power);
    P.simulate(sim, 8);
    return score(sim, me);
  }

  function candidate(pens, me, rand) {
    const self = pens[me];
    const foe = pens[1 - me];
    const s = (rand() * 2 - 1) * self.len * 0.42;
    let dx, dy;
    if (rand() < 0.85) {
      // Aim at a random spot along the opponent pen.
      const t = (rand() * 2 - 1) * foe.len * 0.45;
      const tx = foe.x + Math.cos(foe.a) * t;
      const ty = foe.y + Math.sin(foe.a) * t;
      const ang = Math.atan2(ty - self.y, tx - self.x) + (rand() - 0.5) * 0.3;
      dx = Math.cos(ang);
      dy = Math.sin(ang);
    } else {
      const ang = rand() * Math.PI * 2;
      dx = Math.cos(ang);
      dy = Math.sin(ang);
    }
    return { s, dx, dy, power: 0.3 + rand() * 0.7 };
  }

  function gauss(rand) {
    return (rand() + rand() + rand() - 1.5) / 1.5;
  }

  // Picks a shot for player `me`. `rand` defaults to Math.random (pass a seeded one for tests).
  function chooseShot(pens, me, level, rand) {
    rand = rand || Math.random;
    const cfg = LEVELS[level] || LEVELS.normal;
    let best = null;
    let bestScore = -Infinity;
    for (let i = 0; i < cfg.samples; i++) {
      const shot = candidate(pens, me, rand);
      const sc = evaluate(pens, me, shot);
      if (sc > bestScore) {
        bestScore = sc;
        best = shot;
      }
    }
    // Human-ish execution error.
    const ang = Math.atan2(best.dy, best.dx) + gauss(rand) * cfg.aimNoise;
    return {
      s: best.s,
      dx: Math.cos(ang),
      dy: Math.sin(ang),
      power: Math.max(0.15, Math.min(1, best.power + gauss(rand) * cfg.powerNoise)),
      expected: bestScore,
    };
  }

  const api = { LEVELS, chooseShot, score };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PenAI = api;
})(typeof window !== 'undefined' ? window : globalThis);
