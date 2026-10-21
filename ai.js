// Computer opponent: tries candidate flicks in a copy of the world and keeps the best outcome.
(function (root) {
  'use strict';

  const P = typeof module !== 'undefined' && module.exports ? require('./physics.js') : root.PenPhysics;

  // Each level plays differently, not just more or less accurately:
  //   samples   - shots considered        aimNoise/powerNoise - execution error
  //   maxPower  - strongest flick it dares  pickFrom - picks randomly among the best this share of shots
  //   lookahead - checks the human's best reply and avoids leaving its own pen exposed
  const LEVELS = {
    easy: { samples: 24, aimNoise: 0.16, powerNoise: 0.16, maxPower: 0.95, pickFrom: 0.12, lookahead: 0 },
    normal: { samples: 60, aimNoise: 0.14, powerNoise: 0.12, maxPower: 1, pickFrom: 0, lookahead: 0 },
    hard: { samples: 160, aimNoise: 0.02, powerNoise: 0.02, maxPower: 1, pickFrom: 0, lookahead: 8 },
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

  // Best score the opponent could reach from this position (a quick, noise-free search).
  function bestReply(pens, them, rand, tries) {
    let best = -Infinity;
    for (let i = 0; i < tries; i++) {
      const shot = candidate(pens, them, rand);
      const sim = P.clonePens(pens);
      P.flick(sim[them], shot.s, shot.dx, shot.dy, shot.power);
      P.simulate(sim, 8);
      best = Math.max(best, score(sim, them));
      if (best >= 1000) break;
    }
    return best;
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
    const maxPower = cfg.maxPower || 1;
    const scored = [];
    for (let i = 0; i < cfg.samples; i++) {
      const shot = candidate(pens, me, rand);
      shot.power = Math.min(shot.power, maxPower);
      scored.push({ shot, score: evaluate(pens, me, shot) });
    }
    scored.sort((a, b) => b.score - a.score);

    let pick = scored[0];
    if (cfg.lookahead) {
      // Look one move ahead for the most promising shots: a shot that wins outright is taken,
      // otherwise prefer ones that leave the opponent no easy knockout.
      let bestValue = -Infinity;
      for (const c of scored.slice(0, cfg.lookahead)) {
        if (c.score >= 1000) {
          pick = c;
          break;
        }
        const sim = P.clonePens(pens);
        P.flick(sim[me], c.shot.s, c.shot.dx, c.shot.dy, c.shot.power);
        P.simulate(sim, 8);
        const reply = bestReply(sim, 1 - me, rand, 24);
        const value = c.score - (reply >= 1000 ? 600 : Math.max(0, reply) * 0.5);
        if (value > bestValue) {
          bestValue = value;
          pick = c;
        }
      }
    } else if (cfg.pickFrom) {
      // A beginner: some decent shot, not necessarily the best one.
      const pool = scored.slice(0, Math.max(1, Math.round(scored.length * cfg.pickFrom)));
      pick = pool[Math.floor(rand() * pool.length)];
    }

    // Human-ish execution error.
    const best = pick.shot;
    const ang = Math.atan2(best.dy, best.dx) + gauss(rand) * cfg.aimNoise;
    return {
      s: best.s,
      dx: Math.cos(ang),
      dy: Math.sin(ang),
      power: Math.max(0.15, Math.min(maxPower, best.power + gauss(rand) * cfg.powerNoise)),
      expected: pick.score,
    };
  }

  const api = { LEVELS, chooseShot, score };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PenAI = api;
})(typeof window !== 'undefined' ? window : globalThis);
