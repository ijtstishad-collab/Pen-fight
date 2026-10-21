const test = require('node:test');
const assert = require('node:assert');
const PF = require('../profile.js');

function seeded(seed) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}

test('player ids look right and never repeat on a device', () => {
  const taken = [];
  for (let i = 0; i < 500; i++) {
    const id = PF.newPlayerId(taken);
    assert.match(id, /^PF-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    assert.ok(!taken.includes(id));
    taken.push(id);
  }
});

test('profiles need a name and get a valid avatar', () => {
  assert.throws(() => PF.createProfile({ name: '   ' }, []));
  const p = PF.createProfile({ name: '  Tishad   the   Great  ', avatar: 'not-an-avatar' }, []);
  assert.strictEqual(p.name, 'Tishad the Great');
  assert.strictEqual(p.avatar, PF.AVATARS[0]);
  assert.strictEqual(p.points, 0);
});

test('points scale with difficulty and friend games earn nothing', () => {
  const p = PF.createProfile({ name: 'A' }, []);
  PF.award(p, 'round', { difficulty: 'easy' });
  PF.award(p, 'round', { difficulty: 'hard' });
  assert.strictEqual(p.points, 10 + 30);
  assert.deepStrictEqual(PF.award(p, 'match-win', { difficulty: 'friend' }), []);
  assert.strictEqual(p.points, 40);
});

test('first win of the day and win streaks give bonuses', () => {
  const p = PF.createProfile({ name: 'A' }, []);
  const day = '2026-10-21';
  const first = PF.award(p, 'match-win', { difficulty: 'normal', day });
  assert.deepStrictEqual(first.map((i) => i.amount), [100, 25]);
  PF.award(p, 'match-win', { difficulty: 'normal', day });
  const third = PF.award(p, 'match-win', { difficulty: 'normal', day });
  assert.deepStrictEqual(third.map((i) => i.amount), [100, 25]); // no daily bonus again, streak bonus instead
  assert.strictEqual(p.stats.bestStreak, 3);
  PF.award(p, 'match-loss', { difficulty: 'normal', day });
  assert.strictEqual(p.stats.streak, 0);
  assert.strictEqual(p.stats.matches, 4);
});

test('redeeming spends points, returns a voucher and refuses when short', () => {
  const p = PF.createProfile({ name: 'A' }, []);
  const item = PF.SHOP[0];
  assert.strictEqual(PF.redeem(p, item.id).ok, false);
  p.points = item.points + 5;
  const r = PF.redeem(p, item.id, seeded(3));
  assert.ok(r.ok);
  assert.match(r.code, /^FRESH-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.strictEqual(p.points, 5);
  assert.strictEqual(p.redemptions[0].code, r.code);
  assert.strictEqual(PF.redeem(p, 'nope').ok, false);
});

test('state survives a save and load, and bad storage falls back to empty', () => {
  const mem = { data: {}, getItem(k) { return this.data[k] || null; }, setItem(k, v) { this.data[k] = v; } };
  const state = PF.emptyState();
  state.profiles.push(PF.createProfile({ name: 'A' }, []));
  state.activeId = state.profiles[0].id;
  assert.ok(PF.save(mem, state));
  assert.deepStrictEqual(PF.load(mem), state);
  const broken = { getItem() { throw new Error('blocked'); } };
  assert.deepStrictEqual(PF.load(broken), PF.emptyState());
});

test('every shop item has a product image', () => {
  const fs = require('fs');
  for (const item of PF.SHOP) assert.ok(fs.existsSync(`${__dirname}/../assets/shop/${item.id}.webp`), item.id);
});
