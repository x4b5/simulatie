import * as THREE from 'three';

// Panelen in de 3D-wereld voor VR: ondertitels, keuzes en nabespreking.
// Kiezen kan met de controller (wijzen + trekker) of door 2 seconden te kijken.

const FONT_BODY = '"Atkinson Hyperlegible", "Noto Sans", "Noto Sans Arabic", Arial, sans-serif';
const FONT_HEAD = '"Barlow Condensed", "Noto Sans", "Noto Sans Arabic", "Arial Narrow", sans-serif';
const PX_PER_M = 900;
const DWELL = 1.8;

function wrapLines(g, text, maxW) {
  const words = text.split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (g.measureText(test).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// Blokken: [{text, size, color, font, weight, gap, dir}]
function measureBlocks(g, blocks, innerW) {
  let h = 0;
  for (const b of blocks) {
    g.font = `${b.weight || 400} ${b.size}px ${b.font || FONT_BODY}`;
    b._lines = wrapLines(g, b.text, innerW);
    h += (b.gap ?? 10) + b._lines.length * b.size * 1.28;
  }
  return h;
}

function drawBlocks(g, blocks, x, y, innerW) {
  for (const b of blocks) {
    y += b.gap ?? 10;
    g.font = `${b.weight || 400} ${b.size}px ${b.font || FONT_BODY}`;
    g.fillStyle = b.color || '#eef1ee';
    g.direction = b.dir || 'ltr';
    g.textAlign = b.dir === 'rtl' ? 'right' : 'left';
    g.textBaseline = 'top';
    for (const line of b._lines) {
      g.fillText(line, b.dir === 'rtl' ? x + innerW : x, y);
      y += b.size * 1.28;
    }
  }
  return y;
}

function panelMesh(widthPx, blocks, { bg = 'rgba(17,20,24,0.92)', accent = null, pad = 44 } = {}) {
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  const innerW = widthPx - pad * 2;
  const h = Math.ceil(measureBlocks(g, blocks, innerW) + pad * 2);
  c.width = widthPx;
  c.height = h;
  g.clearRect(0, 0, widthPx, h);
  g.fillStyle = bg;
  roundRect(g, 0, 0, widthPx, h, 28);
  g.fill();
  if (accent) {
    g.fillStyle = accent;
    g.fillRect(0, 26, 10, h - 52);
  }
  measureBlocks(g, blocks, innerW);
  drawBlocks(g, blocks, pad, pad - 10, innerW);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: true, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(widthPx / PX_PER_M, h / PX_PER_M), mat);
  mesh.renderOrder = 10;
  mesh.userData.h = h / PX_PER_M;
  mesh.userData.w = widthPx / PX_PER_M;
  return mesh;
}

export class VRUI {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.camera = camera;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.subtitle = null;
    this.panel = null;
    this.buttons = [];
    this.ray = new THREE.Raycaster();
    this.dwellT = 0;
    this.gazeHover = null;

    // Kijkpunt (reticle) met voortgangsring.
    this.reticle = new THREE.Group();
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.006, 16), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, depthTest: false }));
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.014, 0.02, 32, 1, 0, 0.001), new THREE.MeshBasicMaterial({ color: 0xf2c500, toneMapped: false, depthTest: false, side: THREE.DoubleSide }));
    dot.renderOrder = 20;
    this.ring.renderOrder = 20;
    this.reticle.add(dot, this.ring);
    this.reticle.position.set(0, 0, -1);
    this.reticle.visible = false;
    camera.add(this.reticle);

    // Controllers met straal.
    this.controllers = [];
    for (let i = 0; i < 2; i++) {
      const ctrl = renderer.xr.getController(i);
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xf2c500, transparent: true, opacity: 0.8 }));
      line.scale.z = 3;
      line.visible = false;
      ctrl.add(line);
      ctrl.userData.line = line;
      ctrl.userData.hover = null;
      ctrl.addEventListener('select', () => {
        const b = ctrl.userData.hover;
        if (b) this._activate(b);
      });
      ctrl.addEventListener('connected', () => (line.visible = true));
      ctrl.addEventListener('disconnected', () => (line.visible = false));
      this.controllers.push(ctrl);
    }
    this.controllerParent = null;
  }

  attachControllers(rig) {
    for (const c of this.controllers) rig.add(c);
  }

  get active() {
    return this.renderer.xr.isPresenting;
  }

  _frontPose(dist, dy) {
    const cam = this.camera;
    const p = new THREE.Vector3();
    cam.getWorldPosition(p);
    const d = new THREE.Vector3();
    cam.getWorldDirection(d);
    d.y = 0;
    if (d.lengthSq() < 1e-4) d.set(0, 0, -1);
    d.normalize();
    const pos = p.clone().addScaledVector(d, dist);
    pos.y = p.y + dy;
    return { pos, look: new THREE.Vector3(p.x, pos.y, p.z) };
  }

  showSubtitle(label, labelColor, nl, other, dir) {
    this.hideSubtitle();
    if (!this.active) return;
    const blocks = [
      { text: label.toUpperCase(), size: 30, weight: 700, font: FONT_HEAD, color: labelColor, gap: 0 },
      { text: nl, size: 44, weight: 700, color: '#ffffff', gap: 10 },
    ];
    if (other) blocks.push({ text: other, size: 34, color: '#b9c2bf', gap: 12, dir });
    const m = panelMesh(1300, blocks, { bg: 'rgba(12,14,17,0.82)' });
    const { pos, look } = this._frontPose(1.6, -0.45);
    m.position.copy(pos);
    m.lookAt(look);
    this.root.add(m);
    this.subtitle = m;
  }

  hideSubtitle() {
    if (this.subtitle) {
      this.root.remove(this.subtitle);
      disposeMesh(this.subtitle);
      this.subtitle = null;
    }
  }

  // items: [{letter, nl, other, tried, onSelect}]
  showChoices(title, sub, hint, items, dir, triedLabel) {
    this.clearPanel();
    if (!this.active) return;
    const group = new THREE.Group();
    const head = panelMesh(1500, [
      { text: title, size: 64, weight: 800, font: FONT_HEAD, color: '#f2c500', gap: 0 },
      { text: sub, size: 34, color: '#d7ddd9', gap: 6 },
      { text: hint, size: 26, color: '#97a19c', gap: 10 },
    ], { bg: 'rgba(12,14,17,0.9)' });
    group.add(head);
    let y = -head.userData.h / 2 - 0.03;
    for (const it of items) {
      const blocks = [
        { text: `${it.letter}${it.tried ? '  ·  ' + triedLabel : ''}`, size: 30, weight: 800, font: FONT_HEAD, color: '#f2c500', gap: 0 },
        { text: it.nl, size: 44, weight: 700, color: '#ffffff', gap: 6 },
      ];
      if (it.other) blocks.push({ text: it.other, size: 32, color: '#b9c2bf', gap: 8, dir });
      const b = panelMesh(1500, blocks, { bg: 'rgba(30,35,40,0.95)', accent: '#f2c500' });
      b.position.y = y - b.userData.h / 2;
      y -= b.userData.h + 0.025;
      b.userData.onSelect = it.onSelect;
      this.buttons.push(b);
      group.add(b);
    }
    const { pos, look } = this._frontPose(1.5, 0.05);
    group.position.copy(pos);
    group.lookAt(look);
    group.position.y += -y / 2 - 0.15;
    this.root.add(group);
    this.panel = group;
    this.reticle.visible = true;
  }

  showReflection(sections, buttons, accent, dir) {
    this.clearPanel();
    if (!this.active) return;
    const group = new THREE.Group();
    const blocks = [];
    for (const s of sections) {
      blocks.push({ text: s.text, size: s.size, weight: s.weight || 400, font: s.head ? FONT_HEAD : FONT_BODY, color: s.color || '#e8ece9', gap: s.gap ?? 12, dir: s.dir });
    }
    const p = panelMesh(1700, blocks, { bg: 'rgba(12,14,17,0.93)', accent });
    group.add(p);
    let x = -p.userData.w / 2;
    const bw = (p.userData.w - 0.03) / buttons.length;
    for (const btn of buttons) {
      const b = panelMesh(Math.round(bw * PX_PER_M), [{ text: btn.label, size: 38, weight: 700, color: btn.primary ? '#141414' : '#ffffff', gap: 0 }], {
        bg: btn.primary ? 'rgba(242,197,0,1)' : 'rgba(40,46,52,0.96)',
        pad: 30,
      });
      b.position.set(x + bw / 2, -p.userData.h / 2 - b.userData.h / 2 - 0.03, 0);
      x += bw + 0.03;
      b.userData.onSelect = btn.onSelect;
      this.buttons.push(b);
      group.add(b);
    }
    const { pos, look } = this._frontPose(1.7, 0.0);
    group.position.copy(pos);
    group.lookAt(look);
    this.root.add(group);
    this.panel = group;
    this.reticle.visible = true;
  }

  clearPanel() {
    if (this.panel) {
      this.root.remove(this.panel);
      this.panel.traverse((n) => n.isMesh && disposeMesh(n));
      this.panel = null;
    }
    this.buttons = [];
    this.reticle.visible = false;
    this.dwellT = 0;
    this.gazeHover = null;
  }

  _activate(b) {
    const fn = b.userData.onSelect;
    if (fn) fn();
  }

  _hit(origin, dir) {
    if (!this.buttons.length) return null;
    this.ray.set(origin, dir);
    const hits = this.ray.intersectObjects(this.buttons, false);
    return hits.length ? hits[0].object : null;
  }

  update(dt) {
    if (!this.active || !this.buttons.length) {
      this.reticle.visible = false;
      return;
    }
    const o = new THREE.Vector3();
    const d = new THREE.Vector3();
    const hovered = new Set();
    for (const c of this.controllers) {
      if (!c.userData.line.visible) continue;
      c.getWorldPosition(o);
      d.set(0, 0, -1).applyQuaternion(c.getWorldQuaternion(new THREE.Quaternion()));
      c.userData.hover = this._hit(o, d);
      if (c.userData.hover) hovered.add(c.userData.hover);
    }
    this.camera.getWorldPosition(o);
    this.camera.getWorldDirection(d);
    const g = this._hit(o, d);
    if (g) hovered.add(g);
    if (g && g === this.gazeHover) this.dwellT += dt;
    else this.dwellT = 0;
    this.gazeHover = g;
    for (const b of this.buttons) {
      const on = hovered.has(b);
      b.material.color.setScalar(on ? 1 : 0.82);
      b.scale.setScalar(on ? 1.02 : 1);
    }
    const k = Math.min(1, this.dwellT / DWELL);
    this.ring.geometry.dispose();
    this.ring.geometry = new THREE.RingGeometry(0.014, 0.02, 32, 1, Math.PI / 2, Math.max(0.001, k * Math.PI * 2));
    this.reticle.visible = true;
    if (k >= 1 && g) {
      this.dwellT = 0;
      this._activate(g);
    }
  }
}

function disposeMesh(m) {
  m.geometry?.dispose();
  if (m.material) {
    m.material.map?.dispose();
    m.material.dispose();
  }
}
