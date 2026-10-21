// Pen Fight physics: pens are capsules sliding on a desk with friction.
// Pure functions over plain objects so the game, the AI and the tests share one simulation.
(function (root) {
  'use strict';

  const WORLD = { w: 1000, h: 640 };
  const DESK = { x: 70, y: 60, w: 860, h: 520 };
  const PEN = { length: 240, radius: 7, mass: 1 };

  const FRICTION = 260; // constant sliding deceleration, px/s^2
  const LIN_DAMP = 0.6; // speed-proportional drag, 1/s
  const ANG_FRICTION = 5; // rad/s^2
  const ANG_DAMP = 1.2; // 1/s
  const RESTITUTION = 0.5;
  const CONTACT_FRICTION = 0.2;
  const MAX_IMPULSE = 820; // px/s for a unit-mass pen at full power (tuned so rounds last ~7 flicks)
  const SPIN_FACTOR = 0.35; // tames spin from off-centre flicks
  const FALL_TIME = 0.6; // seconds a pen takes to drop off the desk
  const STOP_V = 5;
  const STOP_W = 0.08;
  const STEP = 1 / 120;

  // Turns 1-10 stats (5 = average) into physical multipliers. All 5s gives the baseline pen.
  function tuning(stats) {
    const st = Object.assign({ speed: 5, power: 5, grip: 5, spin: 5 }, stats);
    const m = PEN.mass * (0.7 + st.power * 0.06); // 0.76 .. 1.3
    return {
      m,
      // Heavier pens launch a little slower, so power isn't free.
      launch: (0.8 + st.speed * 0.04) / Math.pow(m / PEN.mass, 0.35), // speed 1..10 -> 0.84..1.2
      fric: 0.7 + st.grip * 0.06, // 0.76 .. 1.3
      spinK: 0.4 + st.spin * 0.12, // 0.52 .. 1.6
    };
  }

  function makePen(x, y, angle, owner, stats) {
    const len = PEN.length;
    const t = tuning(stats);
    return {
      x, y, a: angle, vx: 0, vy: 0, w: 0,
      owner, len, r: PEN.radius, m: t.m, I: (t.m * len * len) / 12,
      launch: t.launch, fric: t.fric, spinK: t.spinK,
      out: false, fall: 0,
    };
  }

  function clonePens(pens) {
    return pens.map((p) => Object.assign({}, p));
  }

  function endpoints(p) {
    const c = (Math.cos(p.a) * p.len) / 2;
    const s = (Math.sin(p.a) * p.len) / 2;
    return [p.x - c, p.y - s, p.x + c, p.y + s];
  }

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  // Closest points between segments p1-q1 and p2-q2 (Ericson, Real-Time Collision Detection 5.1.9).
  function closestSegments(p1x, p1y, q1x, q1y, p2x, p2y, q2x, q2y) {
    const d1x = q1x - p1x, d1y = q1y - p1y;
    const d2x = q2x - p2x, d2y = q2y - p2y;
    const rx = p1x - p2x, ry = p1y - p2y;
    const a = d1x * d1x + d1y * d1y;
    const e = d2x * d2x + d2y * d2y;
    const f = d2x * rx + d2y * ry;
    const c = d1x * rx + d1y * ry;
    const b = d1x * d2x + d1y * d2y;
    const denom = a * e - b * b;
    let s = denom > 1e-9 ? clamp((b * f - c * e) / denom, 0, 1) : 0;
    let t = (b * s + f) / e;
    if (t < 0) {
      t = 0;
      s = clamp(-c / a, 0, 1);
    } else if (t > 1) {
      t = 1;
      s = clamp((b - c) / a, 0, 1);
    }
    return {
      ax: p1x + d1x * s, ay: p1y + d1y * s,
      bx: p2x + d2x * t, by: p2y + d2y * t,
    };
  }

  // Resolves contact between two pens; returns the normal impulse applied (0 if none).
  function collide(A, B) {
    if (A.out || B.out) return 0;
    const ea = endpoints(A);
    const eb = endpoints(B);
    const cp = closestSegments(ea[0], ea[1], ea[2], ea[3], eb[0], eb[1], eb[2], eb[3]);
    let dx = cp.bx - cp.ax;
    let dy = cp.by - cp.ay;
    const dist = Math.hypot(dx, dy);
    const minD = A.r + B.r;
    if (dist >= minD) return 0;

    let nx, ny;
    if (dist < 1e-6) {
      nx = -Math.sin(A.a);
      ny = Math.cos(A.a);
      if ((B.x - A.x) * nx + (B.y - A.y) * ny < 0) {
        nx = -nx;
        ny = -ny;
      }
    } else {
      nx = dx / dist;
      ny = dy / dist;
    }

    // Push apart, split by inverse mass.
    const depth = minD - dist;
    const invA = 1 / A.m, invB = 1 / B.m;
    const share = depth / (invA + invB);
    A.x -= nx * share * invA;
    A.y -= ny * share * invA;
    B.x += nx * share * invB;
    B.y += ny * share * invB;

    const cx = (cp.ax + cp.bx) / 2;
    const cy = (cp.ay + cp.by) / 2;
    const rax = cx - A.x, ray = cy - A.y;
    const rbx = cx - B.x, rby = cy - B.y;
    const rvx = (B.vx - B.w * rby) - (A.vx - A.w * ray);
    const rvy = (B.vy + B.w * rbx) - (A.vy + A.w * rax);
    const vn = rvx * nx + rvy * ny;
    if (vn > 0) return 0;

    const raN = rax * ny - ray * nx;
    const rbN = rbx * ny - rby * nx;
    const kn = invA + invB + (raN * raN) / A.I + (rbN * rbN) / B.I;
    const j = (-(1 + RESTITUTION) * vn) / kn;
    applyImpulse(A, -j * nx, -j * ny, rax, ray);
    applyImpulse(B, j * nx, j * ny, rbx, rby);

    // Coulomb friction along the contact tangent.
    const tx = -ny, ty = nx;
    const vt = rvx * tx + rvy * ty;
    const raT = rax * ty - ray * tx;
    const rbT = rbx * ty - rby * tx;
    const kt = invA + invB + (raT * raT) / A.I + (rbT * rbT) / B.I;
    const jt = clamp(-vt / kt, -CONTACT_FRICTION * j, CONTACT_FRICTION * j);
    applyImpulse(A, -jt * tx, -jt * ty, rax, ray);
    applyImpulse(B, jt * tx, jt * ty, rbx, rby);

    return j;
  }

  function applyImpulse(p, jx, jy, rx, ry) {
    p.vx += jx / p.m;
    p.vy += jy / p.m;
    p.w += (rx * jy - ry * jx) / p.I;
  }

  // Flick a pen at offset `s` along its axis (-len/2..len/2) in direction (dx, dy) with power 0..1.
  function flick(p, s, dx, dy, power) {
    const n = Math.hypot(dx, dy) || 1;
    const j = clamp(power, 0, 1) * MAX_IMPULSE * p.m * (p.launch || 1);
    const jx = (dx / n) * j;
    const jy = (dy / n) * j;
    const rx = Math.cos(p.a) * s;
    const ry = Math.sin(p.a) * s;
    p.vx += jx / p.m;
    p.vy += jy / p.m;
    p.w += ((rx * jy - ry * jx) / p.I) * SPIN_FACTOR * (p.spinK || 1);
  }

  function onDesk(x, y) {
    return x >= DESK.x && x <= DESK.x + DESK.w && y >= DESK.y && y <= DESK.y + DESK.h;
  }

  function edgeDistance(p) {
    return Math.min(p.x - DESK.x, DESK.x + DESK.w - p.x, p.y - DESK.y, DESK.y + DESK.h - p.y);
  }

  function slow(v, k, dt, grip) {
    const speed = Math.abs(v);
    const dec = (k[0] + k[1] * speed) * dt * grip;
    return dec >= speed ? 0 : v - Math.sign(v) * dec;
  }

  const LIN = [FRICTION, LIN_DAMP];
  const ANG = [ANG_FRICTION, ANG_DAMP];

  // Advances the world one fixed step; returns the largest contact impulse (for sound).
  function step(pens, dt) {
    dt = dt || STEP;
    for (const p of pens) {
      if (p.out) {
        if (p.fall < 1) {
          p.fall = Math.min(1, p.fall + dt / FALL_TIME);
          p.x += p.vx * dt * 0.6;
          p.y += p.vy * dt * 0.6;
          p.a += p.w * dt * 0.6;
        }
        continue;
      }
      const speed = Math.hypot(p.vx, p.vy);
      if (speed > 0) {
        const ns = slow(speed, LIN, dt, p.fric || 1);
        p.vx *= ns / speed;
        p.vy *= ns / speed;
      }
      p.w = slow(p.w, ANG, dt, p.fric || 1);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.a += p.w * dt;
    }

    let hit = 0;
    for (let i = 0; i < pens.length; i++) {
      for (let k = i + 1; k < pens.length; k++) {
        hit = Math.max(hit, collide(pens[i], pens[k]));
      }
    }

    // A pen tips off once its centre of mass leaves the desk.
    for (const p of pens) {
      if (!p.out && !onDesk(p.x, p.y)) {
        p.out = true;
        p.fall = 0;
        const sp = Math.hypot(p.vx, p.vy);
        if (sp < 60) {
          // Nudge outward so a slow tip-over still visibly drops away from the desk.
          const cx = DESK.x + DESK.w / 2, cy = DESK.y + DESK.h / 2;
          const ox = p.x - cx, oy = p.y - cy, on = Math.hypot(ox, oy) || 1;
          p.vx = (ox / on) * 60;
          p.vy = (oy / on) * 60;
        }
      }
    }
    return hit;
  }

  function atRest(pens) {
    return pens.every((p) =>
      p.out ? p.fall >= 1 : Math.hypot(p.vx, p.vy) < STOP_V && Math.abs(p.w) < STOP_W
    );
  }

  function settle(pens) {
    for (const p of pens) {
      if (!p.out) {
        p.vx = 0;
        p.vy = 0;
        p.w = 0;
      }
    }
  }

  // Runs until everything stops (or maxTime), mutating `pens`. Returns simulated seconds.
  function simulate(pens, maxTime) {
    const limit = maxTime || 10;
    let t = 0;
    while (t < limit) {
      step(pens, STEP);
      t += STEP;
      if (atRest(pens)) break;
    }
    settle(pens);
    return t;
  }

  const api = {
    WORLD, DESK, PEN, STEP, MAX_IMPULSE,
    makePen, tuning, clonePens, endpoints, closestSegments, collide, flick,
    onDesk, edgeDistance, step, atRest, settle, simulate,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PenPhysics = api;
})(typeof window !== 'undefined' ? window : globalThis);
