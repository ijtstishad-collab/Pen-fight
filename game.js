// Pen Fight: rendering, input, turns and rounds.
(function () {
  'use strict';

  const P = window.PenPhysics;
  const AI = window.PenAI;
  const { WORLD, DESK, STEP } = P;

  const COLORS = [
    { body: '#2f6fd6', dark: '#1d4a94', light: '#7fa9ee', name: 'Blue' },
    { body: '#d8413a', dark: '#93241f', light: '#f08c86', name: 'Red' },
  ];
  const GRAB_SLOP = 24; // extra world px around a pen that still counts as touching it
  const FULL_PULL = 230; // pull distance (world px) for full power
  const MIN_PULL = 10;

  const canvas = document.getElementById('desk');
  const ctx = canvas.getContext('2d');
  const el = (id) => document.getElementById(id);
  const ui = {
    turn: el('turn'),
    score: [el('score-0'), el('score-1')],
    name: [el('name-0'), el('name-1')],
    menu: el('menu'),
    result: el('result'),
    resultTitle: el('result-title'),
    resultText: el('result-text'),
    resultNext: el('result-next'),
    sound: el('sound'),
  };

  const game = {
    mode: 'normal', // easy | normal | hard | friend
    winsNeeded: 3,
    pens: [],
    scores: [0, 0],
    current: 0,
    starter: 0,
    shooter: 0,
    state: 'menu', // menu | aim | ai | moving | over
    drag: null,
    aiAim: null,
    movingTime: 0,
    round: 0,
  };

  let view = new DOMMatrix();
  let viewInv = new DOMMatrix();
  let grain = null;

  // ---------- layout ----------

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    // Portrait screens get the desk turned sideways so it stays large.
    const portrait = ch > cw * 1.15;
    const s = portrait ? Math.min(cw / WORLD.h, ch / WORLD.w) : Math.min(cw / WORLD.w, ch / WORLD.h);
    view = new DOMMatrix()
      .translate(cw / 2, ch / 2)
      .rotate(portrait ? 90 : 0)
      .scale(s)
      .translate(-WORLD.w / 2, -WORLD.h / 2);
    viewInv = view.inverse();
    ctx.setTransform(new DOMMatrix().scale(dpr).multiply(view));
  }

  function toWorld(evt) {
    const r = canvas.getBoundingClientRect();
    const pt = viewInv.transformPoint(new DOMPoint(evt.clientX - r.left, evt.clientY - r.top));
    return { x: pt.x, y: pt.y };
  }

  // ---------- sound ----------

  let audio = null;
  function blip(freq, gain, dur) {
    if (!ui.sound.checked) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const t = audio.currentTime;
      const osc = audio.createOscillator();
      const g = audio.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.5, t + dur);
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g).connect(audio.destination);
      osc.start(t);
      osc.stop(t + dur);
    } catch (e) {
      /* audio is optional */
    }
  }

  // ---------- flow ----------

  function playerName(i) {
    if (game.mode === 'friend') return COLORS[i].name;
    return i === 0 ? 'You' : 'Computer';
  }

  function isHuman(i) {
    return game.mode === 'friend' || i === 0;
  }

  function startMatch() {
    game.scores = [0, 0];
    game.round = 0;
    game.starter = 0;
    ui.name[0].textContent = playerName(0);
    ui.name[1].textContent = playerName(1);
    ui.menu.hidden = true;
    startRound();
  }

  function startRound() {
    const cy = DESK.y + DESK.h / 2;
    const jitter = () => (Math.random() - 0.5) * 0.5;
    game.pens = [
      P.makePen(DESK.x + DESK.w * 0.3, cy + (Math.random() - 0.5) * 120, Math.PI / 2 + jitter(), 0),
      P.makePen(DESK.x + DESK.w * 0.7, cy + (Math.random() - 0.5) * 120, Math.PI / 2 + jitter(), 1),
    ];
    game.current = game.starter;
    game.round++;
    ui.result.hidden = true;
    updateScores();
    beginTurn();
  }

  function beginTurn() {
    game.drag = null;
    game.aiAim = null;
    if (isHuman(game.current)) {
      game.state = 'aim';
      setTurn(game.mode === 'friend' ? `${playerName(game.current)}'s turn` : 'Your turn');
    } else {
      game.state = 'ai';
      setTurn('Computer is aiming…');
      setTimeout(runAI, 350);
    }
  }

  function runAI() {
    if (game.state !== 'ai') return;
    const me = game.current;
    const shot = AI.chooseShot(game.pens, me, game.mode);
    const pen = game.pens[me];
    // Show the aim briefly so the human can see what's coming.
    game.aiAim = { shot, start: performance.now(), dur: 700 };
    setTimeout(() => {
      if (game.state !== 'ai') return;
      game.aiAim = null;
      shoot(pen, shot.s, shot.dx, shot.dy, shot.power);
    }, 700);
  }

  function shoot(pen, s, dx, dy, power) {
    P.flick(pen, s, dx, dy, power);
    game.shooter = pen.owner;
    game.state = 'moving';
    game.movingTime = 0;
    blip(220 + power * 200, 0.15, 0.08);
    setTurn('…');
  }

  function afterMotion() {
    P.settle(game.pens);
    const me = game.pens[game.shooter];
    const foe = game.pens[1 - game.shooter];
    let winner = -1;
    let reason = '';
    if (me.out) {
      winner = 1 - game.shooter;
      reason = foe.out ? `Both pens fell, but ${playerName(game.shooter)} flicked.` : `${playerName(game.shooter)} flicked off the desk.`;
    } else if (foe.out) {
      winner = game.shooter;
      reason = `${playerName(foe.owner)} got knocked off the desk.`;
    }
    if (winner < 0) {
      game.current = 1 - game.shooter;
      beginTurn();
      return;
    }
    game.scores[winner]++;
    updateScores();
    game.starter = 1 - game.starter;
    const matchOver = game.scores[winner] >= game.winsNeeded;
    game.state = 'over';
    const wonByYou = game.mode !== 'friend' && winner === 0;
    const lostByYou = game.mode !== 'friend' && winner === 1;
    let title;
    if (matchOver) title = game.mode === 'friend' ? `${playerName(winner)} wins the match!` : wonByYou ? 'You win the match!' : 'The computer wins the match';
    else title = game.mode === 'friend' ? `${playerName(winner)} takes the round` : wonByYou ? 'Round to you' : lostByYou ? 'Round to the computer' : '';
    ui.resultTitle.textContent = title;
    ui.resultText.textContent = `${reason} Score ${game.scores[0]}–${game.scores[1]}.`;
    ui.resultNext.textContent = matchOver ? 'Rematch' : 'Next round';
    ui.resultNext.onclick = matchOver ? startMatch : startRound;
    setTurn(matchOver ? 'Match over' : 'Round over');
    blip(matchOver ? 660 : 520, 0.12, 0.25);
    setTimeout(() => {
      ui.result.hidden = false;
      ui.resultNext.focus();
    }, 500);
  }

  function setTurn(text) {
    ui.turn.textContent = text;
    ui.turn.dataset.player = game.state === 'aim' || game.state === 'ai' ? String(game.current) : '';
  }

  function updateScores() {
    ui.score[0].textContent = game.scores[0];
    ui.score[1].textContent = game.scores[1];
  }

  function openMenu() {
    game.state = 'menu';
    game.drag = null;
    ui.result.hidden = true;
    ui.menu.hidden = false;
    setTurn('Pen Fight');
  }

  // ---------- input ----------

  function penAt(pt, pen) {
    const e = P.endpoints(pen);
    const cp = P.closestSegments(pt.x, pt.y, pt.x, pt.y + 1e-3, e[0], e[1], e[2], e[3]);
    return Math.hypot(cp.bx - pt.x, cp.by - pt.y) <= pen.r + GRAB_SLOP;
  }

  function axisOffset(pen, pt) {
    const s = (pt.x - pen.x) * Math.cos(pen.a) + (pt.y - pen.y) * Math.sin(pen.a);
    return Math.max(-pen.len / 2, Math.min(pen.len / 2, s));
  }

  function grabPoint(pen, s) {
    return { x: pen.x + Math.cos(pen.a) * s, y: pen.y + Math.sin(pen.a) * s };
  }

  canvas.addEventListener('pointerdown', (evt) => {
    if (game.state !== 'aim') return;
    const pt = toWorld(evt);
    const pen = game.pens[game.current];
    if (!penAt(pt, pen)) return;
    canvas.setPointerCapture(evt.pointerId);
    game.drag = { id: evt.pointerId, s: axisOffset(pen, pt), cur: pt };
    evt.preventDefault();
  });

  canvas.addEventListener('pointermove', (evt) => {
    const pt = toWorld(evt);
    if (game.drag && evt.pointerId === game.drag.id) {
      game.drag.cur = pt;
      return;
    }
    const over = game.state === 'aim' && penAt(pt, game.pens[game.current]);
    canvas.style.cursor = over ? 'grab' : 'default';
  });

  function release(evt, cancel) {
    const d = game.drag;
    if (!d || evt.pointerId !== d.id) return;
    game.drag = null;
    if (cancel || game.state !== 'aim') return;
    const pen = game.pens[game.current];
    const g = grabPoint(pen, d.s);
    const px = g.x - d.cur.x;
    const py = g.y - d.cur.y;
    const dist = Math.hypot(px, py);
    if (dist < MIN_PULL) return;
    shoot(pen, d.s, px, py, Math.min(1, dist / FULL_PULL));
  }

  canvas.addEventListener('pointerup', (evt) => release(evt, false));
  canvas.addEventListener('pointercancel', (evt) => release(evt, true));

  el('menu-button').addEventListener('click', openMenu);
  el('result-menu').addEventListener('click', openMenu);
  el('start').addEventListener('click', startMatch);

  function choose(groupId, attr, apply) {
    const group = el(groupId);
    group.addEventListener('click', (evt) => {
      const btn = evt.target.closest('button');
      if (!btn) return;
      for (const b of group.querySelectorAll('button')) b.classList.toggle('selected', b === btn);
      apply(btn.dataset[attr]);
    });
  }
  choose('mode-choices', 'mode', (v) => (game.mode = v));
  choose('length-choices', 'wins', (v) => (game.winsNeeded = Number(v)));

  window.addEventListener('keydown', (evt) => {
    if (evt.key === 'Escape' && game.state !== 'menu') openMenu();
  });

  // ---------- rendering ----------

  function makeGrain() {
    // Deterministic wood grain so it doesn't shimmer between frames.
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const lines = [];
    for (let i = 0; i < 46; i++) {
      const y = DESK.y + rnd() * DESK.h;
      const amp = 2 + rnd() * 8;
      const freq = 0.004 + rnd() * 0.01;
      const phase = rnd() * Math.PI * 2;
      lines.push({ y, amp, freq, phase, alpha: 0.05 + rnd() * 0.1, width: 0.6 + rnd() * 1.6 });
    }
    return lines;
  }

  function drawDesk() {
    ctx.fillStyle = '#2b2118';
    ctx.fillRect(-2000, -2000, WORLD.w + 4000, WORLD.h + 4000);

    // Floor tiles beneath the desk.
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    for (let x = -400; x < WORLD.w + 400; x += 80) {
      ctx.beginPath();
      ctx.moveTo(x, -400);
      ctx.lineTo(x, WORLD.h + 400);
      ctx.stroke();
    }

    // Desk shadow and edge.
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    roundRect(DESK.x + 6, DESK.y + 12, DESK.w, DESK.h, 14);
    ctx.fill();
    ctx.fillStyle = '#7a4f2a';
    roundRect(DESK.x - 6, DESK.y - 6, DESK.w + 12, DESK.h + 12, 16);
    ctx.fill();

    const wood = ctx.createLinearGradient(0, DESK.y, 0, DESK.y + DESK.h);
    wood.addColorStop(0, '#c9935a');
    wood.addColorStop(0.5, '#b98349');
    wood.addColorStop(1, '#a8743e');
    ctx.fillStyle = wood;
    roundRect(DESK.x, DESK.y, DESK.w, DESK.h, 12);
    ctx.fill();

    ctx.save();
    roundRect(DESK.x, DESK.y, DESK.w, DESK.h, 12);
    ctx.clip();
    grain = grain || makeGrain();
    for (const g of grain) {
      ctx.strokeStyle = `rgba(70,40,15,${g.alpha})`;
      ctx.lineWidth = g.width;
      ctx.beginPath();
      for (let x = DESK.x; x <= DESK.x + DESK.w; x += 20) {
        const y = g.y + Math.sin(x * g.freq + g.phase) * g.amp;
        if (x === DESK.x) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // A carved doodle and a pencil groove for some school-desk character.
    ctx.strokeStyle = 'rgba(60,32,10,0.22)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(DESK.x + 30, DESK.y + 26);
    ctx.lineTo(DESK.x + DESK.w - 30, DESK.y + 26);
    ctx.stroke();
    ctx.font = '600 22px "Comic Sans MS", "Marker Felt", cursive';
    ctx.fillStyle = 'rgba(60,32,10,0.18)';
    ctx.fillText('PEN FIGHT ✎', DESK.x + DESK.w - 190, DESK.y + DESK.h - 22);
    // Centre line.
    ctx.setLineDash([6, 10]);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.moveTo(DESK.x + DESK.w / 2, DESK.y + 40);
    ctx.lineTo(DESK.x + DESK.w / 2, DESK.y + DESK.h - 20);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawPen(pen, highlight) {
    const c = COLORS[pen.owner];
    const half = pen.len / 2;
    const r = pen.r;
    const scale = pen.out ? 1 - pen.fall * 0.45 : 1;
    const alpha = pen.out ? 1 - pen.fall : 1;
    if (alpha <= 0) return;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(pen.x, pen.y);
    ctx.rotate(pen.a);
    ctx.scale(scale, scale);

    // Shadow.
    ctx.save();
    ctx.translate(4, 6);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    roundRect(-half, -r, pen.len, r * 2, r);
    ctx.fill();
    ctx.restore();

    if (highlight) {
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 3;
      roundRect(-half - 5, -r - 5, pen.len + 10, r * 2 + 10, r + 5);
      ctx.stroke();
    }

    // Writing tip (cone + nib) at +x.
    const tipLen = 28;
    ctx.fillStyle = '#e9dcc0';
    ctx.beginPath();
    ctx.moveTo(half - tipLen, -r);
    ctx.lineTo(half - 4, -2);
    ctx.lineTo(half - 4, 2);
    ctx.lineTo(half - tipLen, r);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#555';
    ctx.beginPath();
    ctx.arc(half - 3, 0, 2.6, 0, Math.PI * 2);
    ctx.fill();

    // Barrel.
    const body = ctx.createLinearGradient(0, -r, 0, r);
    body.addColorStop(0, c.light);
    body.addColorStop(0.45, c.body);
    body.addColorStop(1, c.dark);
    ctx.fillStyle = body;
    roundRect(-half, -r, pen.len - tipLen, r * 2, r);
    ctx.fill();

    // Grip rings.
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (let i = 0; i < 4; i++) ctx.fillRect(half - tipLen - 30 + i * 6, -r, 2.5, r * 2);

    // Cap end with clip.
    ctx.fillStyle = c.dark;
    roundRect(-half, -r, 34, r * 2, r);
    ctx.fill();
    ctx.fillStyle = '#d7d7dc';
    roundRect(-half + 6, -r - 3, 46, 4, 2);
    ctx.fill();

    ctx.restore();
  }

  function drawAim(pen, s, cur, power, dx, dy) {
    const g = grabPoint(pen, s);
    const hue = 120 - power * 120; // green → red
    const color = `hsl(${hue} 85% 55%)`;

    if (cur) {
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.setLineDash([5, 6]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(g.x, g.y);
      ctx.lineTo(cur.x, cur.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    const n = Math.hypot(dx, dy) || 1;
    const len = 40 + power * 170;
    const ex = g.x + (dx / n) * len;
    const ey = g.y + (dy / n) * len;
    ctx.strokeStyle = color;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(g.x, g.y);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    const ang = Math.atan2(dy, dx);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(ex + Math.cos(ang) * 14, ey + Math.sin(ang) * 14);
    ctx.lineTo(ex + Math.cos(ang + 2.4) * 12, ey + Math.sin(ang + 2.4) * 12);
    ctx.lineTo(ex + Math.cos(ang - 2.4) * 12, ey + Math.sin(ang - 2.4) * 12);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(g.x, g.y, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  function render(now) {
    ctx.save();
    drawDesk();
    // Fallen pens render under the ones still on the desk.
    const order = game.pens.slice().sort((a, b) => Number(b.out) - Number(a.out));
    for (const pen of order) {
      const mine = game.state === 'aim' && pen.owner === game.current && !game.drag;
      const pulse = mine && Math.sin(now / 250) > 0;
      drawPen(pen, pulse);
    }
    if (game.drag) {
      const pen = game.pens[game.current];
      const g = grabPoint(pen, game.drag.s);
      const dx = g.x - game.drag.cur.x;
      const dy = g.y - game.drag.cur.y;
      const power = Math.min(1, Math.hypot(dx, dy) / FULL_PULL);
      if (Math.hypot(dx, dy) >= MIN_PULL) drawAim(pen, game.drag.s, game.drag.cur, power, dx, dy);
    } else if (game.aiAim) {
      const { shot, start, dur } = game.aiAim;
      const t = Math.min(1, (now - start) / dur);
      drawAim(game.pens[game.current], shot.s, null, shot.power * t, shot.dx, shot.dy);
    }
    ctx.restore();
  }

  // ---------- loop ----------

  let last = performance.now();
  let acc = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (game.state === 'moving' || game.pens.some((p) => p.out && p.fall < 1)) {
      acc += dt;
      let steps = 0;
      while (acc >= STEP && steps < 16) {
        const hit = P.step(game.pens, STEP);
        if (hit > 60) blip(330 + Math.min(hit, 900) * 0.3, Math.min(0.25, hit / 3000), 0.06);
        acc -= STEP;
        steps++;
      }
      if (game.state === 'moving') {
        game.movingTime += dt;
        if (P.atRest(game.pens) || game.movingTime > 12) afterMotion();
      }
    } else {
      acc = 0;
    }
    render(now);
    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', resize);
  resize();
  game.pens = [
    P.makePen(DESK.x + DESK.w * 0.3, DESK.y + DESK.h / 2, Math.PI / 2 - 0.2, 0),
    P.makePen(DESK.x + DESK.w * 0.7, DESK.y + DESK.h / 2, Math.PI / 2 + 0.2, 1),
  ];
  requestAnimationFrame(frame);
})();
