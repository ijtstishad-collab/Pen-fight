// Pen Fight 3D view: draws the 2D physics world as a desk scene with three.js.
// Physics stays top-down; this only maps (x, y) on the desk to (X, Z) in the scene, with Y up.
(function (root) {
  'use strict';

  const S = 0.01; // scene units per world px
  const DESK_THICK = 0.22;
  const LEG_H = 2.6;
  const FLOOR_Y = -DESK_THICK - LEG_H;
  const ELEVATION = 60 * (Math.PI / 180); // camera angle above the desk

  // ---------- pen model (shared by the desk view and the 360 viewer) ----------

  // Radius along the pen, t = 0 at the cap end and 1 at the writing tip.
  const PROFILE = [0, 0.003, 0.007, 0.012, 0.018];
  for (let t = 0.03; t < 0.9; t += 0.02) PROFILE.push(t);
  PROFILE.push(0.9, 0.93, 0.96, 0.985, 0.992, 0.997, 1);
  function radiusAt(t, R) {
    if (t < 0.018) return R * Math.sqrt(Math.max(0, 1 - ((0.018 - t) / 0.018) ** 2));
    if (t <= 0.9) return R;
    if (t <= 0.985) return R * (1 - ((t - 0.9) / 0.085) * 0.68);
    return R * 0.32 * Math.sqrt(Math.max(0, 1 - ((t - 0.985) / 0.015) ** 2));
  }

  const geoCache = new Map();
  function bodyGeometry(T, len, r) {
    const key = `${len}:${r}`;
    if (!geoCache.has(key)) {
      const L = len * S;
      const R = r * S;
      const pts = PROFILE.map((t) => new T.Vector2(radiusAt(t, R), (t - 0.5) * L));
      // phiStart = PI puts the middle of the artwork (u = 0.25) on top once the pen is laid down.
      const geo = new T.LatheGeometry(pts, 40, Math.PI, Math.PI * 2);
      const uv = geo.attributes.uv;
      for (let i = 0; i <= 40; i++) {
        for (let j = 0; j < PROFILE.length; j++) uv.setY(i * PROFILE.length + j, PROFILE[j]);
      }
      geo.computeVertexNormals();
      geoCache.set(key, geo);
    }
    return geoCache.get(key);
  }

  // The sprite's barrel band, transposed so the pen runs down the texture; mirrored round the back.
  function bodyTexture(T, img, info, anisotropy) {
    const bandTop = (info.axis - info.thickness / 2) * img.naturalHeight;
    const bandH = info.thickness * img.naturalHeight;
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 512;
    const g = c.getContext('2d');
    g.setTransform(0, 1, 1, 0, 0, 0);
    g.drawImage(img, 0, bandTop, img.naturalWidth, bandH, 0, 0, 512, 64);
    const tex = new T.CanvasTexture(c);
    tex.encoding = T.sRGBEncoding;
    tex.anisotropy = anisotropy || 1;
    tex.flipY = false;
    tex.wrapS = T.MirroredRepeatWrapping;
    tex.repeat.set(2, 1);
    return tex;
  }

  // A pen lying along local X (cap at -X, tip at +X), clip on its -Z side.
  // Pass `img` (a loaded sprite) to texture it now, or apply bodyTexture later.
  function buildPen(T, info, img, len, r, opts) {
    const group = new T.Group();
    const mat = new T.MeshStandardMaterial({
      color: info ? '#ffffff' : '#2f6fd6',
      roughness: 0.38,
      metalness: 0.05,
      emissive: '#ffffff',
      emissiveIntensity: 0,
    });
    if (img && info) mat.map = bodyTexture(T, img, info, opts && opts.anisotropy);
    const body = new T.Mesh(bodyGeometry(T, len, r), mat);
    body.rotation.z = -Math.PI / 2; // lathe axis (Y) along the pen (local X)
    body.castShadow = !!(opts && opts.shadows);
    group.add(body);

    const clip = info && info.clip;
    if (clip) {
      const L = len * S;
      const R = r * S;
      // A slim bar hugging the barrel; how far it stood off in the artwork only sets how chunky it is.
      const reach = R * (0.35 + Math.min(1, clip.height) * 0.25);
      const box = new T.Mesh(
        new T.BoxGeometry((clip.to - clip.from) * L, R * 0.55, reach),
        new T.MeshStandardMaterial({
          color: clip.colour,
          roughness: 0.3,
          transparent: clip.opacity < 0.9,
          opacity: Math.max(0.55, clip.opacity),
        })
      );
      // The clip is on the sprite's top edge, so it runs along the pen's left side.
      box.position.set(-L / 2 + ((clip.from + clip.to) / 2) * L, R * 0.3, -(R + reach / 2) + R * 0.15);
      box.castShadow = body.castShadow;
      group.add(box);
    }
    return { group, body };
  }

  function create(canvas, penInfo, loadedSprite) {
    const T = root.THREE;
    const P = root.PenPhysics;
    if (!T || !P) return null;
    const { WORLD, DESK } = P;

    let renderer;
    try {
      renderer = new T.WebGLRenderer({ canvas, antialias: true });
    } catch (e) {
      return null; // no WebGL: the game falls back to the 2D view
    }
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;

    const scene = new T.Scene();
    // A bright classroom: mint floor fading into a light backdrop.
    scene.background = new T.Color('#bfe9e2');
    scene.fog = new T.Fog('#bfe9e2', 16, 34);
    const camera = new T.PerspectiveCamera(36, 1, 0.1, 100);

    scene.add(new T.HemisphereLight('#fff4e2', '#3a2a1c', 0.6));
    const sun = new T.DirectionalLight('#fff1da', 0.9);
    sun.position.set(-5, 7, 3.5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 6, bottom: -6, near: 1, far: 30 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    scene.add(sun);

    const toScene = (x, y) => [(x - WORLD.w / 2) * S, (y - WORLD.h / 2) * S];
    const [deskX, deskZ] = toScene(DESK.x + DESK.w / 2, DESK.y + DESK.h / 2);
    const deskW = DESK.w * S;
    const deskD = DESK.h * S;

    // ---------- desk and floor ----------

    function canvasTexture(w, h, paint) {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      paint(c.getContext('2d'), w, h);
      const tex = new T.CanvasTexture(c);
      tex.encoding = T.sRGBEncoding;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      return tex;
    }

    const woodTex = canvasTexture(2048, 1240, (g, w, h) => {
      const grad = g.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#c9935a');
      grad.addColorStop(0.5, '#b98349');
      grad.addColorStop(1, '#a8743e');
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
      let seed = 7;
      const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < 90; i++) {
        const y0 = rnd() * h;
        const amp = 4 + rnd() * 18;
        const freq = 0.002 + rnd() * 0.005;
        const phase = rnd() * Math.PI * 2;
        g.strokeStyle = `rgba(70,40,15,${0.05 + rnd() * 0.1})`;
        g.lineWidth = 1 + rnd() * 3;
        g.beginPath();
        for (let x = 0; x <= w; x += 16) {
          const y = y0 + Math.sin(x * freq + phase) * amp;
          if (x === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.stroke();
      }
      // Pencil groove, centre line and a carved doodle, as on the 2D desk.
      g.strokeStyle = 'rgba(60,32,10,0.3)';
      g.lineWidth = 6;
      g.beginPath();
      g.moveTo(70, 60);
      g.lineTo(w - 70, 60);
      g.stroke();
      g.setLineDash([14, 22]);
      g.strokeStyle = 'rgba(255,255,255,0.14)';
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(w / 2, 100);
      g.lineTo(w / 2, h - 50);
      g.stroke();
      g.setLineDash([]);
      g.font = '600 52px "Comic Sans MS", "Marker Felt", cursive';
      g.fillStyle = 'rgba(60,32,10,0.2)';
      g.fillText('PEN FIGHT ✎', w - 440, h - 50);
    });

    const edge = new T.MeshStandardMaterial({ color: '#7a4f2a', roughness: 0.7 });
    const top = new T.MeshStandardMaterial({ map: woodTex, roughness: 0.55 });
    const desk = new T.Mesh(new T.BoxGeometry(deskW, DESK_THICK, deskD), [edge, edge, top, edge, edge, edge]);
    desk.position.set(deskX, -DESK_THICK / 2, deskZ);
    desk.receiveShadow = true;
    desk.castShadow = true;
    scene.add(desk);

    const legMat = new T.MeshStandardMaterial({ color: '#5b3a1f', roughness: 0.75 });
    const legGeo = new T.BoxGeometry(0.28, LEG_H, 0.28);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const leg = new T.Mesh(legGeo, legMat);
        leg.position.set(deskX + sx * (deskW / 2 - 0.35), -DESK_THICK - LEG_H / 2, deskZ + sz * (deskD / 2 - 0.35));
        leg.castShadow = true;
        scene.add(leg);
      }
    }

    const tiles = canvasTexture(256, 256, (g, w, h) => {
      // Two-tone checker tiles.
      g.fillStyle = '#8fd6c9';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#a7e0d5';
      g.fillRect(0, 0, w / 2, h / 2);
      g.fillRect(w / 2, h / 2, w / 2, h / 2);
      g.strokeStyle = 'rgba(255,255,255,0.35)';
      g.lineWidth = 3;
      g.strokeRect(0, 0, w, h);
    });
    tiles.wrapS = tiles.wrapT = T.RepeatWrapping;
    tiles.repeat.set(20, 20);
    const floor = new T.Mesh(new T.PlaneGeometry(60, 60), new T.MeshStandardMaterial({ map: tiles, roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = FLOOR_Y;
    floor.receiveShadow = true;
    scene.add(floor);

    // ---------- pens ----------

    // Soft glow on the desk under the pen whose turn it is, in that pen's colour.
    const glowTex = canvasTexture(256, 64, (g, w, h) => {
      const grad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      grad.addColorStop(0, 'rgba(255,255,255,0.95)');
      grad.addColorStop(0.55, 'rgba(255,255,255,0.45)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.setTransform(1, 0, 0, h / w, 0, 0);
      g.fillStyle = grad;
      g.fillRect(0, 0, w, w);
    });
    const marker = new T.Mesh(
      new T.PlaneGeometry(1, 1),
      new T.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, color: '#ffffff' })
    );
    marker.rotation.order = 'YXZ';
    marker.renderOrder = 1;
    marker.visible = false;
    scene.add(marker);

    const views = [];
    function penView(i, pen) {
      const info = penInfo(i);
      const key = info ? info.src : 'plain';
      let v = views[i];
      if (v && v.key === key && v.len === pen.len) return v;
      if (v) {
        scene.remove(v.group);
        v.body.material.dispose();
        if (v.body.material.map) v.body.material.map.dispose();
      }
      const { group, body } = buildPen(T, info, null, pen.len, pen.r, { shadows: true });
      group.rotation.order = 'YZX';
      scene.add(group);
      v = views[i] = { key, len: pen.len, group, body, info, textured: !info };
      return v;
    }

    function update(v, pen, glow) {
      if (!v.textured) {
        const img = loadedSprite(v.info);
        if (img) {
          v.body.material.map = bodyTexture(T, img, v.info, renderer.capabilities.getMaxAnisotropy());
          v.body.material.needsUpdate = true;
          v.textured = true;
        } else {
          v.body.material.color.set(v.info.colour);
        }
      }
      const R = pen.r * S;
      const [x, z] = toScene(pen.x, pen.y);
      let y = R;
      let roll = 0;
      let pitch = 0;
      let px = x;
      let pz = z;
      if (pen.out) {
        // Drop off the edge, away from the desk, tumbling as it goes.
        const f = pen.fall;
        y = R + (FLOOR_Y + R - R) * f * f;
        const ox = Math.max(0, Math.abs(x - deskX) - deskW / 2) * Math.sign(x - deskX);
        const oz = Math.max(0, Math.abs(z - deskZ) - deskD / 2) * Math.sign(z - deskZ);
        const on = Math.hypot(ox, oz) || 1;
        // Off the far side, throw it further so it lands where the desk doesn't hide it.
        const far = (ox / on) * view.x + (oz / on) * view.z < -0.3;
        // A pen pointing away from the desk needs its whole near half cleared too.
        const along = Math.abs(Math.cos(pen.a) * (ox / on) + Math.sin(pen.a) * (oz / on)) * (pen.len / 2) * S;
        const push = far ? farPush + along : 0.9;
        px += (ox / on) * push * f;
        pz += (oz / on) * push * f;
        roll = f * 3.2;
        pitch = Math.sin(f * Math.PI) * 0.7;
      }
      v.group.position.set(px, y, pz);
      v.group.rotation.set(roll, -pen.a, pitch);
      v.body.material.emissiveIntensity = glow;
    }

    // ---------- camera ----------

    let width = 1;
    let height = 1;
    const target = new T.Vector3(deskX, -0.3, deskZ);
    const view = new T.Vector3(0, 0, 1); // horizontal direction from the desk towards the camera
    let farPush = 2.8; // how far past the far edge a falling pen is thrown so the desk doesn't hide it
    // The camera sits close on the desk during play and pulls back to show a pen hitting the floor.
    const tightPos = new T.Vector3();
    const widePos = new T.Vector3();
    let zoom = 0; // 0 = tight, 1 = wide
    let intro = 1; // 0..1 progress of the opening camera sweep
    let lastNow = 0;
    const calm = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function fitCamera() {
      camera.aspect = width / height;
      // Portrait screens look along the desk's long side so it fills the height.
      const portrait = height > width * 1.15;
      const dir = portrait
        ? new T.Vector3(-Math.cos(ELEVATION), Math.sin(ELEVATION), 0)
        : new T.Vector3(0, Math.sin(ELEVATION), Math.cos(ELEVATION));
      camera.up.set(0, 1, 0);
      view.set(dir.x, 0, dir.z).normalize();
      // Two passes: frame, then work out how much floor the desk hides on the far side, and frame again.
      for (let pass = 0; pass < 2; pass++) {
        frame(dir, true);
        const half = Math.abs(view.x) * (deskW / 2) + Math.abs(view.z) * (deskD / 2);
        const edgePt = new T.Vector3(deskX, 0, deskZ).addScaledVector(view, -half);
        const k = camera.position.y / (camera.position.y - FLOOR_Y);
        const hidden = Math.hypot(edgePt.x - camera.position.x, edgePt.z - camera.position.z) * (1 / k - 1);
        farPush = hidden + 0.6;
      }
      widePos.copy(camera.position);
      frame(dir, false);
      tightPos.copy(camera.position);
      // Fog only softens the far floor, however far back the camera has to go.
      const d = widePos.distanceTo(target);
      scene.fog.near = d + 3;
      scene.fog.far = d + 22;
      placeCamera();
    }

    const ease = (t) => t * t * (3 - 2 * t);
    const yAxis = new T.Vector3(0, 1, 0);
    function placeCamera() {
      const pos = tightPos.clone().lerp(widePos, ease(zoom));
      if (intro < 1) {
        // Swing in from higher, further and round to one side.
        const k = 1 - ease(intro);
        const off = pos.clone().sub(target).applyAxisAngle(yAxis, k * 0.8).multiplyScalar(1 + k * 0.7);
        off.y += k * 3;
        pos.copy(target).add(off);
      }
      camera.position.copy(pos);
      camera.lookAt(target);
      camera.updateMatrixWorld();
    }

    // Moves the camera along `dir` until the desktop (and, if `wide`, the floor where pens land) fits on screen.
    function frame(dir, wide) {
      const corners = [];
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        corners.push(new T.Vector3(deskX + sx * (deskW / 2 + 0.12), 0, deskZ + sz * (deskD / 2 + 0.12)));
        if (!wide) continue;
        const mx = sx * view.x < -0.3 ? farPush + 0.3 : 1.5;
        const mz = sz * view.z < -0.3 ? farPush + 0.3 : 1.5;
        corners.push(new T.Vector3(deskX + sx * (deskW / 2 + mx), FLOOR_Y, deskZ + sz * (deskD / 2 + mz)));
      }
      let lo = 2;
      let hi = 80;
      for (let k = 0; k < 30; k++) {
        const d = (lo + hi) / 2;
        camera.position.copy(target).addScaledVector(dir, d);
        camera.lookAt(target);
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld();
        const fits = corners.every((c) => {
          const p = c.clone().project(camera);
          return Math.abs(p.x) < 0.97 && Math.abs(p.y) < (wide ? 0.94 : 0.96) && p.z < 1;
        });
        if (fits) hi = d;
        else lo = d;
      }
      camera.position.copy(target).addScaledVector(dir, hi);
      camera.lookAt(target);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
    }

    const ray = new T.Raycaster();
    const plane = new T.Plane(new T.Vector3(0, 1, 0), 0);

    return {
      resize(w, h) {
        width = Math.max(1, w);
        height = Math.max(1, h);
        renderer.setPixelRatio(Math.min(root.devicePixelRatio || 1, 2));
        renderer.setSize(width, height, false);
        fitCamera();
      },

      // Screen (CSS px in the canvas) to desk coordinates, on the plane through the pens' middles.
      toWorld(sx, sy, penR) {
        plane.constant = -(penR || 7) * S;
        ray.setFromCamera(new T.Vector2((sx / width) * 2 - 1, -(sy / height) * 2 + 1), camera);
        const hit = new T.Vector3();
        if (!ray.ray.intersectPlane(plane, hit)) return { x: -1e4, y: -1e4 };
        return { x: hit.x / S + WORLD.w / 2, y: hit.z / S + WORLD.h / 2 };
      },

      toScreen(x, y, penR) {
        const [X, Z] = toScene(x, y);
        const p = new T.Vector3(X, (penR || 7) * S, Z).project(camera);
        return { x: ((p.x + 1) / 2) * width, y: ((1 - p.y) / 2) * height };
      },

      // Opening camera sweep, e.g. at the start of a match.
      intro() {
        if (!calm) intro = 0;
      },

      render(pens, glowOwner, now) {
        const turnPen = pens[glowOwner];
        marker.visible = !!turnPen && !turnPen.out;
        if (marker.visible) {
          const [mx, mz] = toScene(turnPen.x, turnPen.y);
          const info = penInfo(glowOwner);
          marker.material.color.set(info ? info.colour : '#f0b429');
          marker.material.opacity = 0.55 + 0.3 * Math.sin(now / 220);
          marker.position.set(mx, 0.003, mz);
          marker.scale.set(turnPen.len * S * 1.45, turnPen.r * S * 9, 1);
          marker.rotation.set(-Math.PI / 2, -turnPen.a, 0);
        }
        const dt = Math.min(0.1, Math.max(0, (now - lastNow) / 1000));
        lastNow = now;
        const goal = pens.some((p) => p.out) ? 1 : 0;
        zoom += (goal - zoom) * (calm ? 1 : 1 - Math.exp(-dt * 3.2));
        if (intro < 1) intro = Math.min(1, intro + dt / 1.8);
        placeCamera();
        pens.forEach((pen, i) => {
          const glow = i === glowOwner ? 0.12 + 0.12 * Math.sin(now / 160) : 0;
          update(penView(i, pen), pen, Math.max(0, glow));
        });
        renderer.render(scene, camera);
      },
    };
  }

  root.PenRender3D = { create, buildPen, bodyTexture, SCALE: S };
})(window);
