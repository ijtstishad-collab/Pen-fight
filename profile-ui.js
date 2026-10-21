// Profile screens: create/edit a player, the profile card, switching players and the rewards shop.
(function (root) {
  'use strict';

  const PF = root.PenProfile;
  let store = null;
  try {
    store = root.localStorage;
  } catch (e) {
    /* storage blocked: profiles last for this visit only */
  }
  let state = PF.load(store);
  let onChange = () => {};

  const $ = (id) => document.getElementById(id);
  const fmt = (n) => Number(n || 0).toLocaleString('en');
  const h = (tag, attrs, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') n.className = v;
      else if (k.startsWith('on')) n[k] = v;
      else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v);
    }
    n.append(...kids.filter((k) => k != null && k !== false));
    return n;
  };

  function active() {
    return state.profiles.find((p) => p.id === state.activeId) || null;
  }

  function persist() {
    PF.save(store, state);
    renderChip();
    onChange(active());
  }

  // ---------- sheets (modal panels) ----------

  let openSheetId = null;
  function showSheet(id, ...content) {
    if (openSheetId && openSheetId !== id) $(openSheetId).hidden = true;
    openSheetId = id;
    const sheet = $(id);
    sheet.querySelector('.sheet-body').replaceChildren(...content.filter(Boolean));
    sheet.hidden = false;
    const focusable = sheet.querySelector('.sheet-body input, .sheet-body button');
    if (focusable) focusable.focus();
  }

  function closeSheet() {
    if (!openSheetId) return;
    $(openSheetId).hidden = true;
    openSheetId = null;
  }

  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape' && openSheetId && !$(openSheetId).dataset.required) {
        e.stopPropagation();
        closeSheet();
      }
    },
    true
  );

  // ---------- HUD chip ----------

  function renderChip() {
    const chip = $('profile-chip');
    if (!chip) return;
    const p = active();
    chip.replaceChildren(
      h('span', { class: 'chip-avatar', 'aria-hidden': 'true' }, p ? p.avatar : '👤'),
      h('span', { class: 'chip-points' }, p ? `${fmt(p.points)} pts` : 'Profile')
    );
    chip.setAttribute('aria-label', p ? `${p.name}, ${fmt(p.points)} points. Open profile` : 'Create a profile');
  }

  // ---------- create / edit ----------

  function openForm({ edit, required } = {}) {
    return new Promise((resolve) => {
      const p = edit ? active() : null;
      let avatar = p ? p.avatar : PF.AVATARS[Math.floor(Math.random() * PF.AVATARS.length)];
      const name = h('input', { id: 'pf-name', type: 'text', maxlength: '16', autocomplete: 'nickname', placeholder: 'Your name', value: p ? p.name : '' });
      const error = h('p', { class: 'form-error', role: 'alert' });
      const grid = h('div', { class: 'avatar-grid', role: 'radiogroup', 'aria-label': 'Avatar' });
      const drawGrid = () =>
        grid.replaceChildren(
          ...PF.AVATARS.map((a) =>
            h('button', { type: 'button', role: 'radio', 'aria-checked': String(a === avatar), 'aria-label': `Avatar ${a}`, onclick: () => { avatar = a; drawGrid(); } }, a)
          )
        );
      drawGrid();

      const submit = h('button', { type: 'submit', class: 'primary' }, edit ? 'Save' : "Let's play");
      const form = h(
        'form',
        { class: 'pf-form', novalidate: true },
        h('p', { class: 'badge' }, 'Featuring ', h('b', {}, 'Fresh'), ' pens'),
        h('h2', {}, edit ? 'Edit your player' : 'Create your player'),
        h('p', { class: 'lede' }, edit ? 'Change your name or avatar.' : 'Pick a name and an avatar. Win against the computer to earn points for real Fresh products.'),
        h('label', { for: 'pf-name', class: 'field-label' }, 'Name'),
        name,
        h('span', { class: 'field-label' }, 'Avatar'),
        grid,
        error,
        submit
      );
      form.onsubmit = (e) => {
        e.preventDefault();
        try {
          if (edit) {
            const clean = PF.cleanName(name.value);
            if (!clean) throw new Error('Please enter a name');
            p.name = clean;
            p.avatar = avatar;
          } else {
            const prof = PF.createProfile({ name: name.value, avatar }, state.profiles.map((x) => x.id));
            state.profiles.push(prof);
            state.activeId = prof.id;
          }
          persist();
          delete $('player-form').dataset.required;
          closeSheet();
          resolve(active());
        } catch (err) {
          error.textContent = err.message;
          name.focus();
        }
      };
      const extras = [];
      if (required) {
        extras.push(
          h('button', { type: 'button', class: 'link-button', onclick: () => { delete $('player-form').dataset.required; closeSheet(); resolve(null); } }, 'Play as guest (no points)')
        );
        $('player-form').dataset.required = '1';
      }
      $('player-form').querySelector('.sheet-x').hidden = !!required;
      showSheet('player-form', form, ...extras);
    });
  }

  // ---------- profile card ----------

  function openPanel() {
    const p = active();
    if (!p) {
      openForm();
      return;
    }
    const st = p.stats;
    const rate = st.matches ? Math.round((100 * st.wins) / st.matches) : 0;
    const copy = h('button', { type: 'button', class: 'copy-id', title: 'Copy player ID' }, 'Copy');
    copy.onclick = () => {
      const done = () => (copy.textContent = 'Copied');
      if (navigator.clipboard) navigator.clipboard.writeText(p.id).then(done, () => {});
      else done();
    };
    const others = state.profiles.filter((x) => x.id !== p.id);

    showSheet(
      'profile',
      h(
        'div',
        { class: 'pf-head' },
        h('span', { class: 'pf-avatar', 'aria-hidden': 'true' }, p.avatar),
        h('div', {}, h('h2', {}, p.name), h('p', { class: 'pf-id' }, h('span', {}, 'Player ID '), h('code', {}, p.id), ' ', copy))
      ),
      h(
        'div',
        { class: 'pf-points' },
        h('span', { class: 'pf-points-num' }, fmt(p.points)),
        h('span', { class: 'pf-points-label' }, 'points to spend'),
        h('span', { class: 'pf-points-life' }, `${fmt(p.earned)} earned in total`)
      ),
      h(
        'div',
        { class: 'pf-stats' },
        ...[
          ['Matches', st.matches],
          ['Wins', st.wins],
          ['Win rate', `${rate}%`],
          ['Rounds won', st.rounds],
          ['Best streak', st.bestStreak],
        ].map(([k, v]) => h('div', {}, h('b', {}, String(v)), h('span', {}, k)))
      ),
      h('button', { type: 'button', class: 'primary', onclick: openShop }, '🎁 Rewards shop'),
      h(
        'div',
        { class: 'pf-actions' },
        h('button', { type: 'button', onclick: () => openForm({ edit: true }) }, '✏️ Edit'),
        h('button', { type: 'button', onclick: () => openForm() }, '➕ New player')
      ),
      others.length
        ? h(
            'div',
            { class: 'pf-switch' },
            h('h3', {}, 'Switch player'),
            ...others.map((o) =>
              h(
                'button',
                { type: 'button', onclick: () => { state.activeId = o.id; persist(); openPanel(); } },
                h('span', { class: 'pf-avatar sm', 'aria-hidden': 'true' }, o.avatar),
                h('span', {}, o.name),
                h('span', { class: 'pf-switch-pts' }, `${fmt(o.points)} pts`)
              )
            )
          )
        : null,
      p.redemptions.length
        ? h(
            'div',
            { class: 'pf-rewards' },
            h('h3', {}, 'My rewards'),
            ...p.redemptions.map((r) =>
              h('div', { class: 'pf-reward' }, h('span', {}, r.name), h('code', {}, r.code), h('small', {}, new Date(r.at).toLocaleDateString()))
            )
          )
        : null,
      h('p', { class: 'pf-how' }, 'Earn points against the computer: rounds and matches pay more on Normal and Hard, plus bonuses for your first win each day and win streaks.')
    );
  }

  // ---------- rewards shop ----------

  function openShop() {
    const p = active();
    if (!p) {
      openForm();
      return;
    }
    const cards = PF.SHOP.map((item) => {
      const short = Math.max(0, item.points - p.points);
      const progress = Math.min(1, p.points / item.points);
      return h(
        'div',
        { class: 'shop-item' + (short ? '' : ' affordable') },
        h('img', { src: `assets/shop/${item.id}.webp`, alt: '', loading: 'lazy' }),
        h('h3', {}, item.name),
        h('p', { class: 'shop-blurb' }, item.blurb),
        h('p', { class: 'shop-cost' }, `${fmt(item.points)} pts`),
        h('div', { class: 'shop-meter', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(progress * 100)), 'aria-label': `Progress to ${item.name}` }, h('i', { style: `width:${progress * 100}%` })),
        short
          ? h('button', { type: 'button', disabled: true }, `${fmt(short)} more pts`)
          : h('button', { type: 'button', class: 'primary', onclick: () => confirmRedeem(item) }, 'Redeem')
      );
    });
    showSheet(
      'shop',
      h('div', { class: 'shop-head' }, h('h2', {}, '🎁 Fresh rewards'), h('p', { class: 'shop-balance' }, `${p.avatar} ${p.name} · `, h('b', {}, `${fmt(p.points)} pts`))),
      h('div', { class: 'shop-grid' }, ...cards),
      h('p', { class: 'shop-note' }, 'Demo shop: voucher codes are not yet connected to a Fresh store.'),
      h('button', { type: 'button', class: 'link-button', onclick: openPanel }, '← Back to profile')
    );
  }

  function confirmRedeem(item) {
    const p = active();
    showSheet(
      'shop',
      h(
        'div',
        { class: 'redeem' },
        h('img', { src: `assets/shop/${item.id}.webp`, alt: '' }),
        h('h2', {}, item.name),
        h('p', {}, `Spend ${fmt(item.points)} of your ${fmt(p.points)} points on this reward?`),
        h(
          'div',
          { class: 'actions' },
          h('button', { type: 'button', class: 'primary', onclick: () => doRedeem(item) }, `Redeem for ${fmt(item.points)} pts`),
          h('button', { type: 'button', onclick: openShop }, 'Cancel')
        )
      )
    );
  }

  function doRedeem(item) {
    const p = active();
    const res = PF.redeem(p, item.id);
    if (!res.ok) {
      openShop();
      return;
    }
    persist();
    if (root.PenFight && root.PenFight.celebrate) root.PenFight.celebrate();
    showSheet(
      'shop',
      h(
        'div',
        { class: 'redeem done' },
        h('p', { class: 'quiz-kicker' }, 'Reward unlocked'),
        h('img', { src: `assets/shop/${item.id}.webp`, alt: '' }),
        h('h2', {}, item.name),
        h('p', {}, 'Your voucher code:'),
        h('p', { class: 'voucher' }, h('code', {}, res.code)),
        h('p', { class: 'shop-note' }, `Show this code with your player ID (${p.id}) to claim your reward. It is saved under My rewards in your profile.`),
        h(
          'div',
          { class: 'actions' },
          h('button', { type: 'button', class: 'primary', onclick: openShop }, 'Back to shop'),
          h('button', { type: 'button', onclick: closeSheet }, 'Done')
        )
      )
    );
  }

  // Animates the chip's number up to the current balance after points were earned.
  function countUp(gained) {
    const chip = $('profile-chip');
    const p = active();
    if (!chip || !p) return;
    const label = chip.querySelector('.chip-points');
    const from = Math.max(0, p.points - gained);
    const start = performance.now();
    chip.classList.remove('bump');
    void chip.offsetWidth; // restart the animation
    chip.classList.add('bump');
    const step = (now) => {
      const t = Math.min(1, (now - start) / 700);
      if (label) label.textContent = `${fmt(Math.round(from + (p.points - from) * t))} pts`;
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // ---------- public ----------

  function init(opts) {
    onChange = (opts && opts.onChange) || onChange;
    for (const sheet of document.querySelectorAll('.sheet')) {
      sheet.querySelector('.sheet-x').onclick = closeSheet;
      sheet.onclick = (e) => {
        if (e.target === sheet && !sheet.dataset.required) closeSheet();
      };
    }
    const chip = $('profile-chip');
    if (chip) chip.onclick = openPanel;
    renderChip();
  }

  // Records a result for the active player; returns the itemised points (empty for guests and friend games).
  function award(event, difficulty) {
    const p = active();
    if (!p) return [];
    const items = PF.award(p, event, { difficulty });
    persist();
    return items;
  }

  // First visit: ask for a profile before the menu.
  function ensureProfile() {
    return active() ? Promise.resolve(active()) : openForm({ required: true });
  }

  root.PenProfileUI = { init, active, award, openPanel, openShop, ensureProfile, countUp };
})(window);
