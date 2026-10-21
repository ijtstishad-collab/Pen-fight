// Player profiles, points and the Fresh rewards shop.
// Profiles live in this browser's storage. That is fine for a demo, but anyone can edit
// browser storage, so real product redemption needs these balances kept on a server.
(function (root) {
  'use strict';

  const STORAGE_KEY = 'penfight.profiles';

  const AVATARS = ['🦊', '🐼', '🦁', '🐯', '🐸', '🐵', '🦉', '🐙', '🦄', '🐲', '🐧', '🐨', '🚀', '⚡', '🎨', '🎮'];

  // Points are earned against the computer only, scaled by difficulty.
  const DIFFICULTY = { easy: 1, normal: 2, hard: 3 };
  const POINTS = {
    round: 10, // per round won, x difficulty
    match: 50, // per match won, x difficulty
    played: 5, // for finishing a match you lost
    firstWinOfDay: 25,
    streak: 25, // every win from the third in a row
  };

  // Rewards: Fresh products that can be bought with points.
  const SHOP = [
    { id: 'sprint-pack', name: 'Fresh Sprint pen pack', points: 600, blurb: 'Fast-writing Sprint ballpens in a colour pack.' },
    { id: 'captain-pencils', name: 'Fresh Captain HB pencils', points: 700, blurb: 'A box of 12 HB pencils.' },
    { id: 'emoji-pack', name: 'Fresh Emoji pen pack', points: 800, blurb: 'Fun Emoji ballpens in bright colours.' },
    { id: 'good-day-pack', name: 'Fresh Good Day pen pack', points: 800, blurb: 'Smooth Good Day ballpens.' },
    { id: 'pastello-pouch', name: 'Fresh Pastello pouch', points: 1000, blurb: 'Six pastel Pastello ballpens.' },
    { id: 'icon-signature-pack', name: 'Fresh Icon Signature pack', points: 1200, blurb: 'Premium Icon Signature pens.' },
    { id: 'pencil-box', name: 'Fresh pencil box', points: 1500, blurb: 'A Fresh pencil box for the desk.' },
    { id: 'shine-box', name: 'Fresh Shine box', points: 2000, blurb: 'A full box of Shine ballpens.' },
    { id: 'classroom-jar', name: 'Fresh Classroom jar', points: 2500, blurb: 'A jar of Classroom ballpens.' },
    { id: 'mega-bundle', name: 'Fresh mega bundle', points: 6000, blurb: 'The grand prize: a bundle of Fresh favourites.' },
  ];

  const ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I mix-ups

  function randomChars(n, rand) {
    let out = '';
    if (!rand && root.crypto && root.crypto.getRandomValues) {
      const bytes = new Uint8Array(n);
      root.crypto.getRandomValues(bytes);
      for (const b of bytes) out += ID_CHARS[b % ID_CHARS.length];
      return out;
    }
    const r = rand || Math.random;
    for (let i = 0; i < n; i++) out += ID_CHARS[Math.floor(r() * ID_CHARS.length)];
    return out;
  }

  // Player ID like PF-7KQ3-92XD, unique among the profiles on this device.
  function newPlayerId(taken, rand) {
    for (;;) {
      const id = `PF-${randomChars(4, rand)}-${randomChars(4, rand)}`;
      if (!taken || !taken.includes(id)) return id;
    }
  }

  function cleanName(name) {
    return String(name || '').replace(/\s+/g, ' ').trim().slice(0, 16);
  }

  function createProfile({ name, avatar }, taken, rand) {
    const clean = cleanName(name);
    if (!clean) throw new Error('Please enter a name');
    return {
      id: newPlayerId(taken, rand),
      name: clean,
      avatar: AVATARS.includes(avatar) ? avatar : AVATARS[0],
      points: 0, // spendable balance
      earned: 0, // lifetime total
      created: Date.now(),
      stats: { matches: 0, wins: 0, rounds: 0, streak: 0, bestStreak: 0 },
      lastWinDay: null,
      redemptions: [],
    };
  }

  function addPoints(profile, amount, reason, list) {
    profile.points += amount;
    profile.earned += amount;
    list.push({ reason, amount });
  }

  // Records a round or match result against the computer. Returns the points earned, itemised.
  // event: 'round' (you won a round) | 'match-win' | 'match-loss'
  function award(profile, event, opts) {
    const mult = DIFFICULTY[opts && opts.difficulty] || 0;
    const items = [];
    if (!mult) return items; // friend games earn nothing
    const st = profile.stats;
    if (event === 'round') {
      st.rounds++;
      addPoints(profile, POINTS.round * mult, 'Round won', items);
    } else if (event === 'match-win') {
      st.matches++;
      st.wins++;
      st.streak++;
      st.bestStreak = Math.max(st.bestStreak, st.streak);
      addPoints(profile, POINTS.match * mult, 'Match won', items);
      const day = (opts && opts.day) || new Date().toISOString().slice(0, 10);
      if (profile.lastWinDay !== day) {
        profile.lastWinDay = day;
        addPoints(profile, POINTS.firstWinOfDay, 'First win today', items);
      }
      if (st.streak >= 3) addPoints(profile, POINTS.streak, `${st.streak} wins in a row`, items);
    } else if (event === 'match-loss') {
      st.matches++;
      st.streak = 0;
      addPoints(profile, POINTS.played, 'Match played', items);
    }
    return items;
  }

  // Spends points on a shop item and returns a voucher code for it.
  function redeem(profile, itemId, rand) {
    const item = SHOP.find((i) => i.id === itemId);
    if (!item) return { ok: false, error: 'Unknown reward' };
    if (profile.points < item.points) return { ok: false, error: `You need ${item.points - profile.points} more points` };
    profile.points -= item.points;
    const code = `FRESH-${randomChars(4, rand)}-${randomChars(4, rand)}`;
    const entry = { item: item.id, name: item.name, points: item.points, code, at: Date.now() };
    profile.redemptions.unshift(entry);
    return { ok: true, code, entry };
  }

  // ---------- storage ----------

  function emptyState() {
    return { profiles: [], activeId: null };
  }

  function load(storage) {
    try {
      const raw = storage && storage.getItem(STORAGE_KEY);
      const state = raw ? JSON.parse(raw) : null;
      if (state && Array.isArray(state.profiles)) return state;
    } catch (e) {
      /* unreadable or blocked storage: start fresh */
    }
    return emptyState();
  }

  function save(storage, state) {
    try {
      if (storage) storage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      return false;
    }
  }

  const api = {
    AVATARS, DIFFICULTY, POINTS, SHOP,
    newPlayerId, cleanName, createProfile, award, redeem, load, save, emptyState,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PenProfile = api;
})(typeof window !== 'undefined' ? window : globalThis);
