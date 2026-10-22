import * as THREE from 'three';

// Een vallende doos als star lichaam (Hoog en droog, tak B): zwaartekracht, tollen, botsen en
// stuiteren tegen de vloer, het staal van de stelling en de mensen. Eenvoudig maar natuurkundig:
// impulsen op de contactpunten (met wrijving), in vaste kleine stapjes (1/240 s), zodat de val
// niet afhangt van de beeldsnelheid.
//
// Botsers:
//   planes:   { y, e, mu }                      horizontaal vlak (de vloer)
//   aabbs:    { min, max, e, mu }               blok (de doos eronder, roosters)
//   capsules: { a, b, r, e, mu, tag }           staaf met straal r (liggers, staanders, armen, benen)
// De capsules van mensen worden elk beeld opnieuw uit de botten gezet (zie setCapsules).

const STEP = 1 / 240;
const G = 9.81;
const _v = new THREE.Vector3();
const _r = new THREE.Vector3();
const _n = new THREE.Vector3();
const _t = new THREE.Vector3();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qi = new THREE.Quaternion();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _l = new THREE.Vector3();

export class BoxBody {
  // half: halve afmetingen (x, y, z) van de doos.
  constructor(mesh, half) {
    this.mesh = mesh;
    this.half = half.clone();
    const [x, y, z] = [half.x * 2, half.y * 2, half.z * 2];
    // Traagheid van een massief blok (massa 1).
    this.invI = new THREE.Vector3(12 / (y * y + z * z), 12 / (x * x + z * z), 12 / (x * x + y * y));
    this.v = new THREE.Vector3();
    this.w = new THREE.Vector3();
    this.on = false;
    this.acc = 0;
    this.still = 0;
    this.planes = [];
    this.aabbs = [];
    this.capsules = [];
    this.people = [];
    this.onHit = null; // (soort, snelheid, punt) bij een harde klap
    // Punten op de doos (lokaal): hoeken, midden van de ribben en van de vlakken.
    this.pts = [];
    for (const i of [-1, 0, 1]) for (const j of [-1, 0, 1]) for (const k of [-1, 0, 1]) if (i || j || k) this.pts.push(new THREE.Vector3(i * half.x, j * half.y, k * half.z));
  }

  start(v, w) {
    this.v.copy(v);
    this.w.copy(w);
    this.on = true;
    this.acc = 0;
    this.still = 0;
  }

  stop() {
    this.on = false;
  }

  // Wereldsnelheid van een punt van de doos.
  _velAt(r, out) {
    return out.crossVectors(this.w, r).add(this.v);
  }

  // I⁻¹ · u in de wereld.
  _invI(u, out) {
    _qi.copy(this.mesh.quaternion).invert();
    out.copy(u).applyQuaternion(_qi).multiply(this.invI).applyQuaternion(this.mesh.quaternion);
    return out;
  }

  // Impuls op contactpunt P met normaal n (van de botser naar de doos) en diepte d.
  _resolve(P, n, d, e, mu, kind) {
    const pos = this.mesh.position;
    if (d > 0) pos.addScaledVector(n, Math.min(d, 0.02) * 0.6);
    _r.subVectors(P, pos);
    this._velAt(_r, _v);
    const vn = _v.dot(n);
    if (vn >= 0) return;
    // Harde klap: melden (geluid, schrikreactie; het scenario bepaalt hoe vaak).
    if (-vn > 0.9 && this.onHit) this.onHit(kind, -vn, P);
    const rn = _a.crossVectors(_r, n);
    const k = 1 + n.dot(_b.crossVectors(this._invI(rn, _l), _r));
    const j = (-(1 + (-vn > 0.5 ? e : 0)) * vn) / k;
    this.v.addScaledVector(n, j);
    this.w.add(this._invI(rn.multiplyScalar(j), _l));
    // Wrijving langs het vlak.
    this._velAt(_r, _v);
    _t.copy(_v).addScaledVector(n, -_v.dot(n));
    const vt = _t.length();
    if (vt < 1e-5) return;
    _t.multiplyScalar(1 / vt);
    const rt = _a.crossVectors(_r, _t);
    const kt = 1 + _t.dot(_b.crossVectors(this._invI(rt, _l), _r));
    const jt = Math.min(vt / kt, mu * j);
    this.v.addScaledVector(_t, -jt);
    this.w.add(this._invI(rt.multiplyScalar(-jt), _l));
  }

  // Punt P (wereld) t.o.v. de doos: dichtstbijzijnde punt op/in de doos in out; geeft de afstand
  // (0 als P binnen ligt).
  _closest(P, out) {
    _qi.copy(this.mesh.quaternion).invert();
    _p.copy(P).sub(this.mesh.position).applyQuaternion(_qi);
    const h = this.half;
    out.set(THREE.MathUtils.clamp(_p.x, -h.x, h.x), THREE.MathUtils.clamp(_p.y, -h.y, h.y), THREE.MathUtils.clamp(_p.z, -h.z, h.z));
    const d = out.distanceTo(_p);
    out.applyQuaternion(this.mesh.quaternion).add(this.mesh.position);
    return d;
  }

  _contacts() {
    const m = this.mesh;
    let floor = false;
    // Punten van de doos tegen vlakken en blokken.
    for (const lp of this.pts) {
      const P = _p.copy(lp).applyQuaternion(m.quaternion).add(m.position);
      for (const pl of this.planes) {
        if (P.y < pl.y) {
          floor = true;
          this._resolve(P.clone(), _n.set(0, 1, 0), pl.y - P.y, pl.e, pl.mu, 'floor');
          P.copy(lp).applyQuaternion(m.quaternion).add(m.position);
        }
      }
      for (const bx of this.aabbs) {
        if (P.x <= bx.min.x || P.x >= bx.max.x || P.y <= bx.min.y || P.y >= bx.max.y || P.z <= bx.min.z || P.z >= bx.max.z) continue;
        // Het vlak van het blok waar het punt het minst diep in zit.
        const c = [[P.x - bx.min.x, -1, 0, 0], [bx.max.x - P.x, 1, 0, 0], [P.y - bx.min.y, 0, -1, 0], [bx.max.y - P.y, 0, 1, 0], [P.z - bx.min.z, 0, 0, -1], [bx.max.z - P.z, 0, 0, 1]];
        c.sort((u, w) => u[0] - w[0]);
        this._resolve(P.clone(), _n.set(c[0][1], c[0][2], c[0][3]), c[0][0], bx.e, bx.mu, bx.tag || 'steel');
        P.copy(lp).applyQuaternion(m.quaternion).add(m.position);
      }
    }
    // Staven (staal, armen, benen) tegen de doos: bollen langs de staaf, rond het stuk dat het
    // dichtst bij de doos ligt.
    const reach = this.half.length() + 0.05;
    const C = new THREE.Vector3();
    for (const cp of [...this.capsules, ...this.people]) {
      const ab = _a.subVectors(cp.b, cp.a);
      const len = ab.length();
      if (len < 1e-4) continue;
      const u = ab.multiplyScalar(1 / len).clone();
      const s0 = THREE.MathUtils.clamp(_b.subVectors(m.position, cp.a).dot(u), 0, len);
      // Snelle afwijzing: te ver weg.
      C.copy(cp.a).addScaledVector(u, s0);
      if (C.distanceTo(m.position) > reach + cp.r) continue;
      const lo = Math.max(0, s0 - reach);
      const hi = Math.min(len, s0 + reach);
      const n = Math.max(1, Math.ceil((hi - lo) / 0.03));
      for (let i = 0; i <= n; i++) {
        C.copy(cp.a).addScaledVector(u, lo + ((hi - lo) * i) / n);
        const Q = new THREE.Vector3();
        const d = this._closest(C, Q);
        if (d >= cp.r) continue;
        if (d > 1e-5) {
          _n.subVectors(Q, C).multiplyScalar(1 / d);
          this._resolve(Q, _n.clone(), cp.r - d, cp.e, cp.mu, cp.tag);
        } else {
          // Middelpunt van de bol in de doos: naar buiten via het dichtstbijzijnde vlak.
          _n.subVectors(m.position, C).normalize();
          this._resolve(C.clone(), _n.clone(), cp.r, cp.e, cp.mu, cp.tag);
        }
      }
    }
    return floor;
  }

  // Een stap van dt seconden (in vaste stapjes). Geeft false als de doos stil ligt.
  update(dt) {
    if (!this.on || !(dt > 0)) return this.on;
    const m = this.mesh;
    this.acc += Math.min(dt, 0.1);
    while (this.acc >= STEP && this.on) {
      this.acc -= STEP;
      this.v.y -= G * STEP;
      m.position.addScaledVector(this.v, STEP);
      const wl = this.w.length();
      if (wl > 1e-6) {
        _q.setFromAxisAngle(_v.copy(this.w).multiplyScalar(1 / wl), wl * STEP);
        m.quaternion.premultiply(_q).normalize();
      }
      const floor = this._contacts();
      // Karton: wat luchtweerstand, en op de vloer snel uitgedempt.
      this.v.multiplyScalar(1 - (floor ? 2.5 : 0.05) * STEP);
      this.w.multiplyScalar(1 - (floor ? 4 : 0.2) * STEP);
      if (floor && this.v.length() < 0.06 && this.w.length() < 0.3) this.still += STEP;
      else this.still = 0;
      if (this.still > 0.3) this.on = false;
    }
    return this.on;
  }
}

// Capsules van een personage uit zijn botten (romp, hoofd, armen, handen, benen, voeten).
// out: lijst die hergebruikt wordt.
export function bodyCapsules(h, out = [], tag = 'body') {
  const B = h.bones;
  const W = (b) => b.getWorldPosition(new THREE.Vector3());
  // arm: 'l' of 'r' voor de capsules van een arm en hand.
  const seg = (i, a, b, r, arm = null) => {
    const c = (out[i] ||= { a: new THREE.Vector3(), b: new THREE.Vector3(), r, e: 0.15, mu: 0.6, tag });
    c.a.copy(a);
    c.b.copy(b);
    c.r = r;
    c.arm = arm;
    return c;
  };
  let i = 0;
  const pelvis = W(B.pelvis);
  const neck = W(B.neck);
  const head = W(B.head);
  seg(i++, pelvis, neck, 0.15);
  seg(i++, head, head.clone().add(_v.set(0, 0.12, 0)), 0.1);
  for (const s of ['l', 'r']) {
    const a = B.arm[s];
    const up = W(a.up);
    const fore = W(a.fore);
    const hand = W(a.hand);
    seg(i++, up, fore, 0.055, s);
    seg(i++, fore, hand, 0.045, s);
    a.hand.getWorldQuaternion(_q);
    seg(i++, hand, hand.clone().addScaledVector(_v.copy(a.handAxis).applyQuaternion(_q), 0.16), 0.035, s);
    const L = B.leg[s];
    const th = W(L.up);
    const kn = W(L.fore);
    const ft = W(L.foot);
    seg(i++, th, kn, 0.08);
    seg(i++, kn, ft, 0.06);
  }
  out.length = i;
  return out;
}
