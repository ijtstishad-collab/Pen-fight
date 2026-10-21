const test = require('node:test');
const assert = require('node:assert');
const P = require('../physics.js');
const AI = require('../ai.js');

function seeded(seed) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}

test('a flicked pen slides and comes to rest on the desk', () => {
  const pen = P.makePen(500, 320, 0, 0);
  P.flick(pen, 0, 1, 0, 0.3);
  const t = P.simulate([pen], 10);
  assert.ok(t < 10, 'pen should stop');
  assert.ok(pen.x > 520, 'pen should have moved right');
  assert.ok(!pen.out);
});

test('a full-power flick towards the edge knocks a pen off', () => {
  const pen = P.makePen(800, 320, Math.PI / 2, 0);
  P.flick(pen, 0, 1, 0, 1);
  P.simulate([pen], 10);
  assert.ok(pen.out);
});

test('an off-centre flick spins the pen, a centred one does not', () => {
  const a = P.makePen(500, 320, 0, 0);
  const b = P.makePen(500, 320, 0, 0);
  P.flick(a, 0, 0, 1, 0.5);
  P.flick(b, a.len / 2, 0, 1, 0.5);
  assert.strictEqual(a.w, 0);
  assert.ok(Math.abs(b.w) > 1);
});

test('collisions transfer momentum and separate the pens', () => {
  const a = P.makePen(400, 320, Math.PI / 2, 0);
  const b = P.makePen(500, 320, Math.PI / 2, 1);
  P.flick(a, 0, 1, 0, 0.6);
  P.simulate([a, b], 10);
  assert.ok(b.x > 520, 'struck pen should be pushed');
  const e1 = P.endpoints(a), e2 = P.endpoints(b);
  const cp = P.closestSegments(...e1, ...e2);
  if (!a.out && !b.out) assert.ok(Math.hypot(cp.bx - cp.ax, cp.by - cp.ay) >= a.r + b.r - 0.5);
});

test('hard AI finds a knockout when the opponent sits on the edge', () => {
  const me = P.makePen(650, 320, Math.PI / 2, 0);
  const foe = P.makePen(880, 320, Math.PI / 2, 1);
  const shot = AI.chooseShot([me, foe], 0, 'hard', seeded(42));
  assert.ok(shot.expected >= 1000, `expected a knockout, got ${shot.expected}`);
  const sim = P.clonePens([me, foe]);
  P.flick(sim[0], shot.s, shot.dx, shot.dy, shot.power);
  P.simulate(sim, 10);
  assert.ok(sim[1].out && !sim[0].out);
});

test('AI never mutates the real pens', () => {
  const pens = [P.makePen(300, 320, 1, 0), P.makePen(700, 320, 2, 1)];
  const before = JSON.stringify(pens);
  AI.chooseShot(pens, 1, 'easy', seeded(1));
  assert.strictEqual(JSON.stringify(pens), before);
});

test('rounds last several flicks rather than one knockout shot', () => {
  const { DESK } = P;
  const rand = seeded(11);
  let flicks = 0;
  let oneShot = 0;
  const rounds = 12;
  for (let r = 0; r < rounds; r++) {
    const cy = DESK.y + DESK.h / 2;
    const pens = [
      P.makePen(DESK.x + DESK.w * 0.3, cy + (rand() - 0.5) * 120, Math.PI / 2, 0),
      P.makePen(DESK.x + DESK.w * 0.7, cy + (rand() - 0.5) * 120, Math.PI / 2, 1),
    ];
    let cur = r % 2;
    let n = 0;
    while (n < 20 && !pens.some((p) => p.out)) {
      const s = AI.chooseShot(pens, cur, cur ? 'normal' : 'easy', rand);
      P.flick(pens[cur], s.s, s.dx, s.dy, s.power);
      P.simulate(pens, 12);
      n++;
      cur = 1 - cur;
    }
    flicks += n;
    if (n === 1) oneShot++;
  }
  assert.ok(flicks / rounds >= 4, `average ${flicks / rounds} flicks per round`);
  assert.ok(oneShot <= rounds * 0.34, `${oneShot} of ${rounds} rounds ended on the first flick`);
});
