// 360° pen viewer: a large 3D model of one pen that turns slowly by itself and can be
// spun with a drag (any direction) and zoomed with the wheel or a pinch.
(function (root) {
  'use strict';

  let state = null; // renderer, scene and camera, made on first open and reused

  function setup(canvas) {
    const T = root.THREE;
    let renderer;
    try {
      renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true });
    } catch (e) {
      return null;
    }
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.setClearColor(0x000000, 0);
    const scene = new T.Scene();
    scene.add(new T.HemisphereLight('#ffffff', '#5a4632', 0.75));
    const key = new T.DirectionalLight('#fff4e0', 0.85);
    key.position.set(2, 3, 4);
    scene.add(key);
    const rim = new T.DirectionalLight('#ffffff', 0.35);
    rim.position.set(-3, -1, -2);
    scene.add(rim);
    const camera = new T.PerspectiveCamera(30, 1, 0.05, 50);
    const holder = new T.Group(); // spun by the user
    scene.add(holder);
    return { T, renderer, scene, camera, holder, model: null, distance: 5.2 };
  }

  // Opens the viewer for one pen. `info` is the sprite manifest entry; `title` and `detail` are DOM nodes or text.
  function open({ info, title, detail }) {
    const dlg = document.getElementById('viewer');
    const canvas = document.getElementById('viewer-canvas');
    const fallback = document.getElementById('viewer-fallback');
    document.getElementById('viewer-title').replaceChildren(title || '');
    document.getElementById('viewer-detail').replaceChildren(...(detail ? [detail] : []));
    dlg.hidden = false;

    if (!state && root.THREE && root.PenRender3D) state = setup(canvas);
    if (!state) {
      // No WebGL: show the flat artwork large instead.
      canvas.hidden = true;
      fallback.hidden = false;
      fallback.src = info.src;
      wireClose(dlg, () => {});
      return;
    }
    canvas.hidden = false;
    fallback.hidden = true;

    const { T, holder } = state;
    if (state.model) {
      holder.remove(state.model.group);
      state.model.body.material.dispose();
      if (state.model.body.material.map) state.model.body.material.map.dispose();
    }
    const len = 240;
    const r = 7;
    state.model = root.PenRender3D.buildPen(T, info, null, len, r, { anisotropy: state.renderer.capabilities.getMaxAnisotropy() });
    holder.add(state.model.group);
    const img = new Image();
    img.onload = () => {
      if (!state.model || state.model.info !== info) return;
      state.model.body.material.map = root.PenRender3D.bodyTexture(T, img, info, state.renderer.capabilities.getMaxAnisotropy());
      state.model.body.material.needsUpdate = true;
    };
    state.model.info = info;
    img.src = info.src;

    // Start tilted so the clip and barrel both show, then let it turn.
    holder.quaternion.setFromEuler(new T.Euler(0.45, -0.5, 0.25));
    state.distance = 4.2;

    let raf = 0;
    let last = performance.now();
    let idle = 0; // seconds since the user last touched it
    const yAxis = new T.Vector3(0, 1, 0);
    const xAxis = new T.Vector3(1, 0, 0);

    function resize() {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      state.renderer.setPixelRatio(Math.min(root.devicePixelRatio || 1, 2));
      state.renderer.setSize(w, h, false);
      state.camera.aspect = w / Math.max(1, h);
      state.camera.updateProjectionMatrix();
    }

    function tick(now) {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      idle += dt;
      if (idle > 1.5) holder.quaternion.premultiply(new T.Quaternion().setFromAxisAngle(yAxis, dt * 0.6));
      state.camera.position.set(0, 0, state.distance);
      state.camera.lookAt(0, 0, 0);
      state.renderer.render(state.scene, state.camera);
      raf = requestAnimationFrame(tick);
    }

    // Drag to spin (trackball style), wheel or pinch to zoom, double-click to reset.
    const pointers = new Map();
    let pinch = 0;
    function onDown(e) {
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      idle = 0;
    }
    function onMove(e) {
      const p = pointers.get(e.pointerId);
      if (!p) return;
      idle = 0;
      if (pointers.size === 2) {
        p.x = e.clientX;
        p.y = e.clientY;
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch) zoom(pinch / d);
        pinch = d;
        return;
      }
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      holder.quaternion
        .premultiply(new T.Quaternion().setFromAxisAngle(yAxis, dx * 0.01))
        .premultiply(new T.Quaternion().setFromAxisAngle(xAxis, dy * 0.01));
    }
    function onUp(e) {
      pointers.delete(e.pointerId);
      pinch = 0;
    }
    function zoom(f) {
      state.distance = Math.min(8, Math.max(1.6, state.distance * f));
    }
    function onWheel(e) {
      e.preventDefault();
      idle = 0;
      zoom(Math.exp(e.deltaY * 0.0015));
    }
    function onDbl() {
      holder.quaternion.setFromEuler(new T.Euler(0.45, -0.5, 0.25));
      state.distance = 4.2;
    }

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('dblclick', onDbl);
    root.addEventListener('resize', resize);
    resize();
    raf = requestAnimationFrame(tick);

    wireClose(dlg, () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('dblclick', onDbl);
      root.removeEventListener('resize', resize);
    });
  }

  function wireClose(dlg, cleanup) {
    const btn = document.getElementById('viewer-close');
    function close() {
      cleanup();
      dlg.hidden = true;
      btn.onclick = null;
      dlg.onclick = null;
      document.removeEventListener('keydown', onKey, true);
    }
    function onKey(e) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    }
    btn.onclick = close;
    dlg.onclick = (e) => {
      if (e.target === dlg) close(); // click on the dimmed backdrop
    };
    document.addEventListener('keydown', onKey, true);
    btn.focus();
  }

  root.PenViewer = { open };
})(window);
