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
  const LINES = window.PEN_LINES || [];
  const GRAB_SLOP = 26; // extra world px around a pen that still counts as touching it
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
    revive: el('revive'),
    reviveButton: el('revive-button'),
    reviveWho: el('revive-who'),
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
    picks: [loadPick(0, { line: 0, pen: 0 }), loadPick(1, { line: 2, pen: 5 })],
  };

  // ---------- pen choice ----------

  const sprites = new Map();
  function sprite(info) {
    if (!sprites.has(info.src)) {
      const img = new Image();
      img.src = info.src;
      sprites.set(info.src, img);
    }
    const img = sprites.get(info.src);
    return img.complete && img.naturalWidth ? img : null;
  }

  function penInfo(player) {
    const pick = game.picks[player];
    const line = LINES[pick.line];
    return line ? Object.assign({ lineName: line.name }, line.pens[pick.pen]) : null;
  }

  function loadPick(player, fallback) {
    try {
      const v = JSON.parse(localStorage.getItem(`penfight.pick.${player}`));
      if (v && LINES[v.line] && LINES[v.line].pens[v.pen]) return v;
    } catch (e) {
      /* storage is optional */
    }
    return fallback;
  }

  function savePick(player) {
    try {
      localStorage.setItem(`penfight.pick.${player}`, JSON.stringify(game.picks[player]));
    } catch (e) {
      /* storage is optional */
    }
  }

  function computerPick() {
    // A pen from a different line, so the two never look alike.
    const others = LINES.map((_, i) => i).filter((i) => i !== game.picks[0].line);
    const line = others[Math.floor(Math.random() * others.length)] || 0;
    return { line, pen: Math.floor(Math.random() * LINES[line].pens.length) };
  }

  function applyPenColours() {
    for (const i of [0, 1]) {
      const info = penInfo(i);
      if (!info) continue;
      sprite(info); // start loading it before the round begins
      document.documentElement.style.setProperty(`--p${i}`, info.colour);
    }
  }

  function renderPicker(player) {
    const box = document.querySelector(`.picker[data-player="${player}"]`);
    const tabs = box.querySelector('.lines');
    const tray = box.querySelector('.tray');
    const pick = game.picks[player];
    tabs.replaceChildren(
      ...LINES.map((line, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.role = 'tab';
        b.textContent = line.name;
        b.setAttribute('aria-selected', String(i === pick.line));
        b.onclick = () => {
          game.picks[player] = { line: i, pen: Math.min(pick.pen, line.pens.length - 1) };
          savePick(player);
          renderPicker(player);
        };
        return b;
      })
    );
    tray.replaceChildren(
      ...LINES[pick.line].pens.map((pen, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('aria-pressed', String(i === pick.pen));
        b.setAttribute('aria-label', `${LINES[pick.line].name} pen ${i + 1}`);
        const img = document.createElement('img');
        img.src = pen.src;
        img.alt = '';
        b.append(img);
        b.onclick = () => {
          game.picks[player] = { line: pick.line, pen: i };
          savePick(player);
          renderPicker(player);
        };
        return b;
      })
    );
    const sel = tabs.querySelector('[aria-selected="true"]');
    if (sel) sel.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function renderPickers() {
    if (!LINES.length) {
      for (const p of document.querySelectorAll('.picker')) p.hidden = true;
      return;
    }
    const friend = game.mode === 'friend';
    document.querySelector('.picker[data-player="1"]').hidden = !friend;
    el('picker-0-label').textContent = friend ? "Player 1's pen" : 'Your pen';
    renderPicker(0);
    if (friend) renderPicker(1);
    ui.name[0].textContent = playerName(0);
    ui.name[1].textContent = playerName(1);
  }

  let r3d = null; // 3D view, when WebGL is available
  let dpr = 1;
  let view = new DOMMatrix();
  let viewInv = new DOMMatrix();
  let grain = null;

  // ---------- layout ----------

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    if (r3d) r3d.resize(cw, ch);
    // Portrait screens get the desk turned sideways so it stays large.
    const portrait = ch > cw * 1.15;
    const s = portrait ? Math.min(cw / WORLD.h, ch / WORLD.w) : Math.min(cw / WORLD.w, ch / WORLD.h);
    view = new DOMMatrix()
      .translate(cw / 2, ch / 2)
      .rotate(portrait ? 90 : 0)
      .scale(s)
      .translate(-WORLD.w / 2, -WORLD.h / 2);
    viewInv = view.inverse();
  }

  function toWorld(evt) {
    const r = canvas.getBoundingClientRect();
    if (r3d) return r3d.toWorld(evt.clientX - r.left, evt.clientY - r.top, P.PEN.radius);
    const pt = viewInv.transformPoint(new DOMPoint(evt.clientX - r.left, evt.clientY - r.top));
    return { x: pt.x, y: pt.y };
  }

  function toScreen(x, y) {
    if (r3d) return r3d.toScreen(x, y, P.PEN.radius);
    const pt = view.transformPoint(new DOMPoint(x, y));
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
    if (game.mode === 'friend') return LINES.length ? `Player ${i + 1}` : COLORS[i].name;
    return i === 0 ? 'You' : 'Computer';
  }

  function isHuman(i) {
    return game.mode === 'friend' || i === 0;
  }

  function startMatch() {
    game.scores = [0, 0];
    game.round = 0;
    game.starter = 0;
    if (LINES.length && game.mode !== 'friend') game.picks[1] = computerPick();
    applyPenColours();
    ui.name[0].textContent = playerName(0);
    ui.name[1].textContent = playerName(1);
    ui.menu.hidden = true;
    if (r3d) r3d.intro();
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
    game.revived = false;
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
    game.beforeShot = P.clonePens(game.pens); // what a revive puts back
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
    endRound(winner, reason);
  }

  function endRound(winner, reason) {
    game.scores[winner]++;
    updateScores();
    game.lastRound = { winner, starter: game.starter };
    game.starter = 1 - game.starter;
    const loser = 1 - winner;
    const matchOver = game.scores[winner] >= game.winsNeeded;
    game.state = 'over';
    const wonByYou = game.mode !== 'friend' && winner === 0;
    let title;
    if (matchOver) title = game.mode === 'friend' ? `${playerName(winner)} wins the match!` : wonByYou ? 'You win the match!' : 'The computer wins the match';
    else title = game.mode === 'friend' ? `${playerName(winner)} takes the round` : wonByYou ? 'Round to you' : 'Round to the computer';
    ui.resultTitle.textContent = title;
    ui.resultText.textContent = `${reason} Score ${game.scores[0]}–${game.scores[1]}.`;
    ui.resultNext.textContent = matchOver ? 'Rematch' : 'Next round';
    ui.resultNext.onclick = matchOver ? startMatch : startRound;
    // A human who just lost their pen can watch an ad to put it back, once per round.
    const canRevive = window.PenAds && isHuman(loser) && game.pens[loser].out && !game.revived;
    ui.revive.hidden = !canRevive;
    ui.reviveWho.textContent = game.mode === 'friend' ? `${playerName(loser)}: ` : '';
    ui.result.classList.toggle('win', wonByYou || (game.mode === 'friend' && matchOver));
    setTurn(matchOver ? 'Match over' : 'Round over');
    blip(matchOver ? 660 : 520, 0.12, 0.25);
    if (wonByYou || (game.mode === 'friend' && matchOver)) confetti(matchOver ? 160 : 70);
    setTimeout(() => {
      if (game.state !== 'over') return;
      ui.result.hidden = false;
      (canRevive ? ui.reviveButton : ui.resultNext).focus();
    }, 700);
  }

  function watchToRevive() {
    const { winner } = game.lastRound;
    ui.result.hidden = true;
    window.PenAds.watch().then((earned) => {
      if (earned) revive(1 - winner);
      else ui.result.hidden = false;
    });
  }

  // Undo the round result and put the fallen pen(s) back where they were before the last flick.
  function revive(player) {
    const { winner, starter } = game.lastRound;
    game.scores[winner]--;
    game.starter = starter;
    game.revived = true;
    updateScores();
    for (const pen of game.pens) {
      if (!pen.out) continue;
      const was = game.beforeShot[pen.owner];
      Object.assign(pen, { x: was.x, y: was.y, a: was.a, vx: 0, vy: 0, w: 0, out: false, fall: 0 });
    }
    // Slide the revived pen towards the middle until it is clear of the other pen.
    const pen = game.pens[player];
    const other = game.pens[1 - player];
    const cx = DESK.x + DESK.w / 2;
    const cy = DESK.y + DESK.h / 2;
    for (let i = 0; i < 80 && touching(pen, other); i++) {
      const dx = cx - pen.x, dy = cy - pen.y, n = Math.hypot(dx, dy) || 1;
      pen.x += (dx / n) * 8 + (pen.x < other.x ? -6 : 6);
      pen.y += (dy / n) * 8;
    }
    blip(880, 0.12, 0.3);
    game.current = 1 - game.shooter;
    beginTurn();
  }

  function touching(a, b) {
    const ea = P.endpoints(a), eb = P.endpoints(b);
    const cp = P.closestSegments(ea[0], ea[1], ea[2], ea[3], eb[0], eb[1], eb[2], eb[3]);
    return Math.hypot(cp.bx - cp.ax, cp.by - cp.ay) < a.r + b.r + 6;
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
  const fsButton = el('fullscreen-button');
  if (document.fullscreenEnabled) {
    fsButton.addEventListener('click', () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen().catch(() => {});
    });
  } else {
    fsButton.hidden = true;
  }
  el('result-menu').addEventListener('click', openMenu);
  el('start').addEventListener('click', startMatch);
  el('revive-button').addEventListener('click', watchToRevive);

  function choose(groupId, attr, apply) {
    const group = el(groupId);
    group.addEventListener('click', (evt) => {
      const btn = evt.target.closest('button');
      if (!btn) return;
      for (const b of group.querySelectorAll('button')) b.classList.toggle('selected', b === btn);
      apply(btn.dataset[attr]);
    });
  }
  choose('mode-choices', 'mode', (v) => {
    game.mode = v;
    if (v === 'friend') game.picks[1] = loadPick(1, game.picks[1]);
    renderPickers();
  });
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

    const info = penInfo(pen.owner);
    const img = info && sprite(info);
    if (img) {
      if (highlight) {
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 3;
        roundRect(-half - 6, -r - 6, pen.len + 12, r * 2 + 12, r + 6);
        ctx.stroke();
      }
      // Keep the barrel on the physics axis; the clip sticks out to one side.
      const h = pen.len * info.aspect;
      const k = canvas.width / Math.max(1, canvas.clientWidth);
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = 5 * k;
      ctx.shadowOffsetX = 2 * k;
      ctx.shadowOffsetY = 4 * k;
      ctx.drawImage(img, -half, -info.axis * h, pen.len, h);
      ctx.restore();
      return;
    }

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

  // Drawn in screen space over either view, so it reads the same in 2D and 3D.
  function drawAim(pen, s, cur, power, dx, dy) {
    const gw = grabPoint(pen, s);
    const g = toScreen(gw.x, gw.y);
    const hue = 120 - power * 120; // green → red
    const color = `hsl(${hue} 85% 55%)`;

    if (cur) {
      const c = toScreen(cur.x, cur.y);
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.setLineDash([5, 6]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(g.x, g.y);
      ctx.lineTo(c.x, c.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    const n = Math.hypot(dx, dy) || 1;
    const len = 40 + power * 170;
    const e = toScreen(gw.x + (dx / n) * len, gw.y + (dy / n) * len);
    ctx.strokeStyle = color;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(g.x, g.y);
    ctx.lineTo(e.x, e.y);
    ctx.stroke();
    const ang = Math.atan2(e.y - g.y, e.x - g.x);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(e.x + Math.cos(ang) * 14, e.y + Math.sin(ang) * 14);
    ctx.lineTo(e.x + Math.cos(ang + 2.4) * 12, e.y + Math.sin(ang + 2.4) * 12);
    ctx.lineTo(e.x + Math.cos(ang - 2.4) * 12, e.y + Math.sin(ang - 2.4) * 12);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(g.x, g.y, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---------- confetti ----------

  const bits = [];
  function confetti(n) {
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const colours = [penInfo(0), penInfo(1)].filter(Boolean).map((i) => i.colour).concat(['#f0b429', '#ffffff', '#e8413a']);
    for (let i = 0; i < n; i++) {
      bits.push({
        x: Math.random() * w,
        y: -20 - Math.random() * h * 0.6,
        vx: (Math.random() - 0.5) * 90,
        vy: 60 + Math.random() * 140,
        a: Math.random() * 6,
        spin: (Math.random() - 0.5) * 12,
        c: colours[i % colours.length],
        size: 6 + Math.random() * 6,
      });
    }
  }

  function drawConfetti(dt) {
    const h = canvas.clientHeight;
    for (let i = bits.length - 1; i >= 0; i--) {
      const b = bits[i];
      b.vy = Math.min(b.vy + 260 * dt, 260);
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.a += b.spin * dt;
      if (b.y > h + 30) {
        bits.splice(i, 1);
        continue;
      }
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.a);
      ctx.scale(1, Math.cos(b.a * 1.7)); // flutter
      ctx.fillStyle = b.c;
      ctx.fillRect(-b.size / 2, -b.size / 4, b.size, b.size / 2);
      ctx.restore();
    }
  }

  function render(now, dt) {
    const glowOwner = game.state === 'aim' && !game.drag ? game.current : -1;
    if (r3d) {
      r3d.render(game.pens, glowOwner, now);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    } else {
      ctx.setTransform(new DOMMatrix().scale(dpr).multiply(view));
      drawDesk();
      // Fallen pens render under the ones still on the desk.
      const order = game.pens.slice().sort((a, b) => Number(b.out) - Number(a.out));
      for (const pen of order) drawPen(pen, pen.owner === glowOwner && Math.sin(now / 250) > 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
    if (bits.length) drawConfetti(dt);
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
    render(now, dt);
    requestAnimationFrame(frame);
  }

  if (window.PenRender3D && !/[?&]2d\b/.test(location.search)) {
    r3d = window.PenRender3D.create(el('scene'), penInfo, sprite);
  }
  if (!r3d) el('scene').hidden = true;
  window.addEventListener('resize', resize);
  resize();
  renderPickers();
  applyPenColours();
  game.pens = [
    P.makePen(DESK.x + DESK.w * 0.3, DESK.y + DESK.h / 2, Math.PI / 2 - 0.2, 0),
    P.makePen(DESK.x + DESK.w * 0.7, DESK.y + DESK.h / 2, Math.PI / 2 + 0.2, 1),
  ];
  window.PenFight = { game, toScreen }; // for debugging and browser tests
  requestAnimationFrame(frame);
})();
