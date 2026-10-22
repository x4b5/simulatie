import * as THREE from 'three';
import { Human } from './human.js';
import { tween, ease } from './sim.js';

// Handen die iets vasthouden: een staander, ligger, leuning of een doos. Een greep is een
// contact van de handpalm met een vlak van een voorwerp:
//   { obj, at, f, n, curl, thumb, pole }
//   obj: het voorwerp (Object3D), of null voor een vast punt in de wereld,
//   at:  midden van de handpalm op het vlak (in de assen van obj),
//   f:   richting van de vingers, n: richting waarin de handpalm kijkt (het vlak in),
//   curl, thumb, pole: hoe de vingers krommen en waar de elleboog heen wijst (zie Human.grip).
// Uit het contact volgen elk beeld de pols (het IK-doel) en de stand van de hand. Zo zit de hand
// echt op het vlak (geen vingers door het staal, geen hand in de doos) en beweegt hij precies
// mee als het voorwerp beweegt.

const PALM = 0.022; // van de botlijn van de hand tot de huid van de handpalm
const _q = new THREE.Quaternion();
const _n = new THREE.Vector3();
const _w = new THREE.Vector3();
const _f = new THREE.Vector3();
const _t = new THREE.Vector3();
const _o = new THREE.Vector3();

// Pols en handstand (vingers, duimkant) in de wereld voor contact c.
export function contactPose(h, side, c, wrist, f, thumbSide) {
  if (c.obj) {
    c.obj.updateWorldMatrix(true, false);
    wrist.copy(c.at).applyMatrix4(c.obj.matrixWorld);
    c.obj.getWorldQuaternion(_q);
    f.copy(c.f).applyQuaternion(_q);
    _n.copy(c.n).applyQuaternion(_q);
  } else {
    wrist.copy(c.at);
    f.copy(c.f);
    _n.copy(c.n);
  }
  f.normalize();
  _n.addScaledVector(f, -_n.dot(f)).normalize();
  // Linkerhand: duimkant = handpalm × vingers; rechterhand gespiegeld.
  if (side === 'l') thumbSide.crossVectors(_n, f);
  else thumbSide.crossVectors(f, _n);
  // Het midden van de handpalm ligt ~0,55 van pols tot knokkels voorbij de pols.
  return wrist.addScaledVector(f, -h.bones.arm[side].knuckle * 0.55).addScaledVector(_n, -PALM);
}

// Contact maken: hulpje voor vaste waarden.
export const contact = (obj, at, f, n, opts = {}) => ({ obj, at, f: f.clone().normalize(), n: n.clone().normalize(), ...opts });

// Beide handen van een personage: naar een greep gaan (met een boogje), vasthouden, loslaten.
export class Holds {
  constructor(h) {
    this.h = h;
    this.s = {};
    for (const side of ['l', 'r']) {
      this.s[side] = { c: null, k: 1, tok: 0, over: 0, from: new THREE.Vector3(), f0: new THREE.Vector3(), t0: new THREE.Vector3(), p: new THREE.Vector3(), f: new THREE.Vector3(0, 0, 1), t: new THREE.Vector3(0, 1, 0), lift: 0, out: 0 };
    }
  }

  // Hand naar contact c in dur seconden. lift: boogje omhoog, out: boogje naar achteren (weg van
  // de stelling of het voorwerp). over (0…1): over een rand heen: omhoog gaat de hand eerst
  // omhoog en dan pas naar voren (over de rand), omlaag eerst naar achteren en dan pas omlaag,
  // zodat hij nooit door de rand of het staal eronder snijdt. c = null: loslaten (de arm gaat
  // terug naar de animatie).
  set(side, c, dur = 0, { lift = 0, out = 0, over = 0 } = {}) {
    const st = this.s[side];
    const h = this.h;
    const tok = ++st.tok;
    if (!c) {
      st.c = null;
      h.grip(side, null);
      return Promise.resolve();
    }
    const holding = h.grips[side].on && st.c;
    if (holding) {
      st.from.copy(st.p);
      st.f0.copy(st.f);
      st.t0.copy(st.t);
    } else {
      // Vanuit de animatie: waar de hand nu is en hoe hij nu staat.
      const a = h.bones.arm[side];
      h.handWorld(side, st.from);
      a.hand.getWorldQuaternion(_q);
      st.f0.copy(a.handAxis).applyQuaternion(_q);
      st.t0.copy(a.handSide).applyQuaternion(_q);
    }
    st.c = c;
    st.lift = lift;
    st.out = out;
    st.over = over;
    st.k = dur > 0 ? 0 : 1;
    this._solve(side);
    h.grip(side, st.p, {
      instant: dur <= 0 && !holding,
      ori: (fo, to) => fo.copy(st.f) && to.copy(st.t),
      curl: c.curl ?? [0.95, 0.95, 0.95],
      thumb: c.thumb ?? 0.35,
      pole: c.pole ?? [0.7, -1, -0.25],
    });
    if (dur <= 0) return Promise.resolve();
    return tween(dur, (k) => {
      if (st.tok === tok) st.k = k;
    });
  }

  _solve(side) {
    const st = this.s[side];
    if (!st.c) return;
    contactPose(this.h, side, st.c, _w, _f, _t);
    if (st.k >= 1) {
      st.p.copy(_w);
      st.f.copy(_f);
      st.t.copy(_t);
      return;
    }
    const e = ease(st.k);
    const a = Math.sin(Math.PI * st.k);
    st.p.lerpVectors(st.from, _w, e);
    if (st.over) {
      // Hoogte en vlak elk in hun eigen tempo: wat de hand van de rand af houdt gaat eerst.
      const o = st.over;
      const first = ease(Math.min(1, st.k / (1 - o)));
      const then = ease(Math.max(0, (st.k - o) / (1 - o)));
      const up = _w.y > st.from.y;
      const kh = up ? then : first;
      st.p.lerpVectors(st.from, _w, kh);
      st.p.y = st.from.y + (_w.y - st.from.y) * (up ? first : then);
    }
    st.p.y += a * st.lift;
    if (st.out) {
      // Naar achteren t.o.v. het lichaam.
      _o.set(0, 0, -1).applyQuaternion(this.h.root.getWorldQuaternion(_q));
      st.p.addScaledVector(_o, a * st.out);
    }
    st.f.lerpVectors(st.f0, _f, e).normalize();
    st.t.lerpVectors(st.t0, _t, e).normalize();
  }

  // Elk beeld vóór Human.update: doelen bijwerken (het voorwerp kan bewogen zijn).
  update() {
    this._solve('l');
    this._solve('r');
  }
}

// ------------------------------------------------------------------
// Armen van de speler (first person)
// ------------------------------------------------------------------
// Een Rocketbox-werkman (blauwe werkkleding, werkhandschoenen) waarvan alleen de armen getekend
// worden: de rest van het lichaam is uit de geometrie gehaald. Het lichaam staat onder de camera
// en draait mee met de kijkrichting; de handen gaan met dezelfde grepen als bij Henk naar de
// leuning van de rolsteiger of naar voren om iets aan te pakken. Alleen zichtbaar tijdens die
// handelingen, en nooit in VR (daar zijn de echte handen en controllers er).
const ARM_BONE = /_(L|R)_(UpperArm|Forearm|ForeTwist|Hand|Finger)/;

function keepArms(mesh) {
  const g = mesh.geometry;
  const si = g.attributes.skinIndex;
  const sw = g.attributes.skinWeight;
  const bones = mesh.skeleton.bones;
  const arm = bones.map((b) => ARM_BONE.test(b.name));
  const n = g.attributes.position.count;
  const w = new Float32Array(n);
  for (let v = 0; v < n; v++) {
    let s = 0;
    for (let k = 0; k < 4; k++) if (arm[si.getComponent(v, k)]) s += sw.getComponent(v, k);
    w[v] = s;
  }
  const idx = g.index ? g.index.array : Array.from({ length: n }, (_, i) => i);
  const groups = g.groups.length ? g.groups : [{ start: 0, count: idx.length, materialIndex: 0 }];
  const out = [];
  const ng = [];
  for (const gr of groups) {
    const start = out.length;
    for (let i = gr.start; i < gr.start + gr.count; i += 3) {
      const a = idx[i];
      const b = idx[i + 1];
      const c = idx[i + 2];
      if (w[a] > 0.5 && w[b] > 0.5 && w[c] > 0.5) out.push(a, b, c);
    }
    ng.push({ start, count: out.length - start, materialIndex: gr.materialIndex });
  }
  g.setIndex(out);
  g.clearGroups();
  for (const gr of ng) if (gr.count) g.addGroup(gr.start, gr.count, gr.materialIndex);
  return out.length > 0;
}

export class PlayerArms {
  static async load(scene) {
    const h = await Human.load({ model: 'models/collega.fbx', code: 'm107', anims: 'models/anim_m', facial: false });
    return new PlayerArms(h, scene);
  }

  constructor(h, scene) {
    this.h = h;
    this.holds = new Holds(h);
    h.fidgetOK = false;
    h.model.traverse((m) => {
      if (!m.isMesh) return;
      m.castShadow = false; // het onzichtbare lichaam zou anders een schaduw werpen
      if (!m.isSkinnedMesh || !keepArms(m)) m.visible = false;
    });
    h.root.visible = false;
    scene.add(h.root);
    this.shown = false;
    this.fade = 0; // >0: nog zichtbaar terwijl de armen zakken
  }

  // Armen tonen: handen naar de grepen (l, r: contacten), in dur s vanuit de hangende armen.
  // Pas bij het volgende beeld (dan staat het lijf onder de camera) gaan de handen op weg.
  show(l, r, dur = 0.6) {
    this.shown = true;
    this._pending?.res();
    return new Promise((res) => (this._pending = { l, r, dur, res }));
  }

  // Andere greep terwijl de armen al in beeld zijn.
  move(side, c, dur = 0.5, opts = {}) {
    return this.holds.set(side, c, dur, opts);
  }

  // Loslaten: de armen zakken uit beeld en verdwijnen dan.
  hide() {
    if (!this.shown) return;
    this.shown = false;
    this.fade = 0.7;
    this.holds.set('l', null);
    this.holds.set('r', null);
  }

  reset() {
    this._pending?.res();
    this._pending = null;
    this.shown = false;
    this.fade = 0;
    this.holds.set('l', null);
    this.holds.set('r', null);
    this.h.root.visible = false;
  }

  // Na de camera bijwerken (anders loopt het lijf een beeld achter op de kijkrichting).
  update(dt, camera, xr) {
    if (this.fade > 0) this.fade -= dt;
    const vis = (this.shown || this.fade > 0) && !xr;
    this.h.root.visible = vis;
    if (!vis) {
      // In VR: niets tonen, het scenario hoeft niet op de handen te wachten.
      this._pending?.res();
      this._pending = null;
      return;
    }
    camera.getWorldPosition(_w);
    camera.getWorldDirection(_f);
    const yaw = Math.atan2(_f.x, _f.z);
    const r = this.h.root;
    r.rotation.set(0, yaw, 0);
    // Ogen van het lijf ongeveer op de camera, iets naar achteren: de schouders zitten net
    // achter en onder de camera, de armen komen van onderen het beeld in.
    r.position.set(_w.x - Math.sin(yaw) * 0.18, _w.y - 1.66, _w.z - Math.cos(yaw) * 0.18);
    r.updateMatrixWorld(true);
    const p = this._pending;
    if (p) {
      // Eerst de hangende armen op hun plek, dan pas met de handen op weg.
      this._pending = null;
      this.h.update(1 / 60);
      const o = { lift: 0.04 };
      Promise.all([this.holds.set('l', p.l, p.dur, o), this.holds.set('r', p.r, p.dur * 1.08, o)]).then(p.res);
    }
    this.holds.update();
    this.h.update(dt);
  }
}
