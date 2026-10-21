const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const P = require('../physics.js');
const { PEN_STATS, STAT_NAMES, STYLES, QUIZ, quizResult } = require('../pen-stats.js');

const lines = JSON.parse(fs.readFileSync(__dirname + '/../pens.js', 'utf8').match(/= (\[.*\]);/s)[1]);

test('every pen line has balanced stats', () => {
  for (const line of lines) {
    const st = PEN_STATS[line.id];
    assert.ok(st, `${line.id} has stats`);
    const sum = STAT_NAMES.reduce((t, [k]) => t + st[k], 0);
    assert.strictEqual(sum, 24, `${line.id} spends 24 points`);
    for (const [k] of STAT_NAMES) assert.ok(st[k] >= 1 && st[k] <= 10, `${line.id}.${k} in 1-10`);
  }
});

test('average stats reproduce the baseline pen', () => {
  const t = P.tuning({ speed: 5, power: 5, grip: 5, spin: 5 });
  for (const k of ['m', 'launch', 'fric', 'spinK']) assert.ok(Math.abs(t[k] - 1) < 1e-9, k);
});

function travel(stats) {
  const p = P.makePen(200, 320, Math.PI / 2, 0, stats);
  P.flick(p, 0, 1, 0, 0.5);
  P.simulate([p], 10);
  return p.x - 200;
}

function shoved(stats) {
  const hitter = P.makePen(300, 320, Math.PI / 2, 0);
  const target = P.makePen(420, 320, Math.PI / 2, 1, stats);
  P.flick(hitter, 0, 1, 0, 0.6);
  P.simulate([hitter, target], 10);
  return target.x - 420;
}

test('speed sends a pen further', () => {
  assert.ok(travel({ speed: 9 }) > travel({ speed: 5 }) * 1.15);
});

test('grip stops a pen sooner', () => {
  assert.ok(travel({ grip: 9 }) < travel({ grip: 5 }) * 0.9);
});

test('power resists being knocked away', () => {
  assert.ok(shoved({ power: 9 }) < shoved({ power: 5 }) * 0.9);
});

test("each pen's style is led by its strongest stat", () => {
  for (const [id, st] of Object.entries(PEN_STATS)) {
    const style = STYLES[st.style];
    assert.ok(style, `${id} has a known style`);
    if (!style.lead) continue;
    for (const [k] of STAT_NAMES) {
      if (k !== style.lead) assert.ok(st[style.lead] > st[k], `${id}: ${style.lead} beats ${k}`);
    }
  }
  for (const key of Object.keys(STYLES)) {
    assert.ok(Object.values(PEN_STATS).some((st) => st.style === key), `${key} has at least one pen`);
  }
});

test('the quiz picks the most-chosen style, or all-rounder on a tie', () => {
  assert.strictEqual(quizResult(['trickster', 'speedster', 'trickster']), 'trickster');
  assert.strictEqual(quizResult(['speedster', 'powerhouse', 'precision']), 'allrounder');
  for (const q of QUIZ) for (const [, style] of q.a) assert.ok(STYLES[style], style);
});

test('spin turns off-centre flicks into more rotation', () => {
  const spin = (s) => {
    const p = P.makePen(500, 320, 0, 0, { spin: s });
    P.flick(p, p.len * 0.4, 0, 1, 0.5);
    return Math.abs(p.w);
  };
  assert.ok(spin(9) > spin(5) * 1.3);
});
