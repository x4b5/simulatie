import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

// Realistisch personage op basis van een Microsoft Rocketbox-avatar (MIT-licentie).
// - Motion-capture-animaties (gebakken naar models/anim_*.bin) met zachte overgangen
// - Hoofd en ogen kijken naar een doel, arm kan naar een punt wijzen (IK bovenop de animatie)
// - Gezichtsuitdrukking via blendshapes (ARKit/FACS): boosheid, knipperen
// - Lipsync via visemen, gestuurd door volume en klankkleur van de stem
// - Zitten aan tafel, wortelbeweging (gaan zitten, opstaan), vaste armhoudingen (dienblad,
//   armen over elkaar) en lachen dat meebeweegt met de lach in de opname

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _q3 = new THREE.Quaternion();
const FWD = new THREE.Vector3(0, 0, 1);
const _qRoot = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
// Hoe sterk gezichtsuitdrukkingen zijn (1 = maximaal van het model). Lager = ingetogener.
export const EXPRESSION = 0.62;
// Hoe sterk de procedurele lichaamsaccenten zijn bovenop de motion capture.
const BODY_ACCENT = 0.6;

const animCache = new Map();

async function loadAnimSet(base) {
  if (animCache.has(base)) return animCache.get(base);
  const p = (async () => {
    const [header, bin] = await Promise.all([
      fetch(`${base}.json`).then((r) => r.json()),
      fetch(`${base}.bin`).then((r) => r.arrayBuffer()),
    ]);
    const q16 = new Int16Array(bin, 0, header.qLen);
    const p32 = new Float32Array(bin, header.pByteOffset, header.pLen);
    const clips = {};
    const nb = header.bones.length;
    for (const c of header.clips) {
      const times = new Float32Array(c.frames);
      for (let f = 0; f < c.frames; f++) times[f] = f / header.fps;
      const tracks = [];
      header.bones.forEach((bone, bi) => {
        if (!c.has[bi]) return;
        const vals = new Float32Array(c.frames * 4);
        for (let f = 0; f < c.frames; f++) {
          const o = c.qOff + (f * nb + bi) * 4;
          vals[f * 4] = q16[o] / 32767;
          vals[f * 4 + 1] = q16[o + 1] / 32767;
          vals[f * 4 + 2] = q16[o + 2] / 32767;
          vals[f * 4 + 3] = q16[o + 3] / 32767;
        }
        tracks.push(new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times, vals));
      });
      const np = c.posBones.length;
      // Wortelbeweging (gaan zitten, opstaan): de horizontale verschuiving bewaren in meters,
      // zodat het personage zelf meeschuift in plaats van ter plekke te blijven.
      const motion = c.motion ? { x: new Float32Array(c.frames), z: new Float32Array(c.frames), fps: header.fps } : null;
      c.posBones.forEach((bone, pi) => {
        const vals = new Float32Array(c.frames * 3);
        const x0 = p32[c.pOff + pi * 3];
        const z0 = p32[c.pOff + pi * 3 + 2];
        for (let f = 0; f < c.frames; f++) {
          const o = c.pOff + (f * np + pi) * 3;
          // Op de plek houden: horizontale verschuiving van de wortel eruit.
          vals[f * 3] = bone === 'Bip01' ? x0 : p32[o];
          vals[f * 3 + 1] = p32[o + 1];
          vals[f * 3 + 2] = bone === 'Bip01' ? z0 : p32[o + 2];
          if (motion && bone === 'Bip01') {
            motion.x[f] = (p32[o] - x0) * 0.01;
            motion.z[f] = (p32[o + 2] - z0) * 0.01;
          }
        }
        tracks.push(new THREE.VectorKeyframeTrack(`${bone}.position`, times, vals));
      });
      clips[c.name] = new THREE.AnimationClip(c.name, c.duration, tracks);
      if (motion) clips[c.name].motion = motion;
    }
    return clips;
  })();
  animCache.set(base, p);
  return p;
}

// Welke blendshapes we bewaren (de rest wordt weggegooid om geheugen te sparen).
const KEEP = {
  sil: 'AA_VI_00_Sil',
  PP: 'AA_VI_01_PP',
  FF: 'AA_VI_02_FF',
  TH: 'AA_VI_03_TH',
  DD: 'AA_VI_04_DD',
  kk: 'AA_VI_05_KK',
  CH: 'AA_VI_06_CH',
  SS: 'AA_VI_07_SS',
  nn: 'AA_VI_08_nn',
  RR: 'AA_VI_09_RR',
  aa: 'AA_VI_10_aa',
  E: 'AA_VI_11_E',
  I: 'AA_VI_12_I',
  O: 'AA_VI_13_O',
  U: 'AA_VI_14_U',
  browDownL: 'AK_01_BrowDownLeft',
  browDownR: 'AK_02_BrowDownRight',
  browInnerUp: 'AK_03_BrowInnerUp',
  browOuterUpL: 'AK_04_BrowOuterUpLeft',
  browOuterUpR: 'AK_05_BrowOuterUpRight',
  cheekSquintL: 'AK_07_CheekSquintLeft',
  cheekSquintR: 'AK_08_CheekSquintRight',
  mouthClose: 'AK_27_MouthClose',
  stretchL: 'AK_46_MouthStretchLeft',
  stretchR: 'AK_47_MouthStretchRight',
  lipRaiser: 'AU_10_UpperLipRaiser',
  lipsPart: 'AU_25_LipsPart',
  blinkL: 'AK_09_EyeBlinkLeft',
  blinkR: 'AK_10_EyeBlinkRight',
  squintL: 'AK_19_EyeSquintLeft',
  squintR: 'AK_20_EyeSquintRight',
  wideL: 'AK_21_EyeWideLeft',
  wideR: 'AK_22_EyeWideRight',
  jawOpen: 'AK_25_JawOpen',
  frownL: 'AK_30_MouthFrownLeft',
  frownR: 'AK_31_MouthFrownRight',
  pressL: 'AK_36_MouthPressLeft',
  pressR: 'AK_37_MouthPressRight',
  smileL: 'AK_44_MouthSmileLeft',
  smileR: 'AK_45_MouthSmileRight',
  upperUpL: 'AK_48_MouthUpperUpLeft',
  upperUpR: 'AK_49_MouthUpperUpRight',
  sneerL: 'AK_50_NoseSneerLeft',
  sneerR: 'AK_51_NoseSneerRight',
  browLower: 'AU_04_BrowLowerer',
  lidTight: 'AU_07_LidTightener',
};

// Gebaren (oude API-namen) → animatieclips.
const POSE_CLIPS = {
  relaxed: ['idle', 'breathe'],
  angry: ['listenAngry', 'idleAngry'],
  armsOut: ['talkAngry', 'talkExcited'],
  shout: ['talkAngry2', 'talkAngry'],
  headHand: ['touchFace'],
  calm: ['talkRelaxed', 'talkNeutral', 'talkFirm'],
  hips: ['talkNeutral', 'idle'],
  crossed: ['idleAngry2', 'idleAngry'],
  wheel: ['sit'],
  clipboard: ['documents', 'idle'],
  firm: ['talkFirm', 'talkAngry'],
};

const texLoader = new THREE.TextureLoader();
function tex(url, srgb) {
  const t = texLoader.load(url);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 4;
  return t;
}

export class Human {
  // anims: één animatieset of een lijst sets (de clips worden samengevoegd).
  static async load({ model, code, anims, facial = true, badge = null }) {
    const manager = new THREE.LoadingManager();
    // Texturen uit het FBX-bestand negeren: we zetten zelf PBR-materialen.
    manager.setURLModifier((u) => (/\.tga$/i.test(u) ? 'data:,' : u));
    const [obj, ...sets] = await Promise.all([new FBXLoader(manager).loadAsync(model), ...[].concat(anims).map(loadAnimSet)]);
    return new Human(obj, Object.assign({}, ...sets), { code, facial, badge });
  }

  constructor(obj, clips, { code, facial }) {
    this.root = new THREE.Group();
    this.model = obj;
    obj.scale.setScalar(0.01);
    this.root.add(obj);
    this.clips = clips;

    const dir = 'models/tex/';
    this.mesh = null;
    obj.traverse((n) => {
      if (n.isMesh) {
        n.castShadow = true;
        n.receiveShadow = true;
        n.frustumCulled = false;
        const mats = [].concat(n.material).map((m) => {
          const part = /head/i.test(m.name) ? 'head' : /helmet/i.test(m.name) ? 'helmet' : /tools/i.test(m.name) ? 'tools' : 'body';
          if (part === 'helmet') return new THREE.MeshBasicMaterial({ visible: false });
          const common = {
            name: m.name,
            map: tex(`${dir}${code}_${part}_color.jpg`, true),
            normalMap: tex(`${dir}${code}_${part}_normal.jpg`, false),
            metalness: 0,
          };
          // Huid: zachte, warme glans aan de randen (sheen) geeft een minder plastic gezicht.
          const mat =
            part === 'head'
              ? new THREE.MeshPhysicalMaterial({
                  ...common,
                  roughness: 0.52,
                  sheen: 0.25,
                  sheenRoughness: 0.8,
                  sheenColor: new THREE.Color(0x8c6656),
                  specularIntensity: 0.6,
                  envMapIntensity: 0.8,
                })
              : new THREE.MeshStandardMaterial({ ...common, roughness: part === 'tools' ? 0.6 : 0.85 });
          mat.normalScale.set(1, -1);
          return mat;
        });
        n.material = Array.isArray(n.material) ? mats : mats[0];
        if (n.morphTargetDictionary) this._pruneMorphs(n);
        if (!this.mesh || n.morphTargetInfluences) this.mesh = n;
      }
    });

    // Botten.
    const B = (name) => obj.getObjectByName(name);
    this.bones = {
      root: B('Bip01'),
      pelvis: B('Bip01_Pelvis'),
      spine2: B('Bip01_Spine2'),
      neck: B('Bip01_Neck'),
      head: B('Bip01_Head'),
      eyeL: B('Bip01_LEye'),
      eyeR: B('Bip01_REye'),
      handL: B('Bip01_L_Hand'),
      clavL: B('Bip01_L_Clavicle'),
      clavR: B('Bip01_R_Clavicle'),
      handR: B('Bip01_R_Hand'),
      arm: {
        l: { up: B('Bip01_L_UpperArm'), fore: B('Bip01_L_Forearm'), hand: B('Bip01_L_Hand') },
        r: { up: B('Bip01_R_UpperArm'), fore: B('Bip01_R_Forearm'), hand: B('Bip01_R_Hand') },
      },
    };

    // Kijkrichting van hoofd en ogen in rustpose bepalen (model kijkt naar +z).
    this._orient();

    this.mixer = new THREE.AnimationMixer(obj);
    this.actions = {};
    for (const [name, clip] of Object.entries(clips)) {
      const a = this.mixer.clipAction(clip);
      a.setLoop(THREE.LoopRepeat, Infinity);
      this.actions[name] = a;
    }
    this.current = null;

    // Toestand (zelfde API als het eenvoudige personage).
    this.handPose = 'relaxed';
    this.aim = { l: null, r: null };
    this.aimW = { l: 0, r: 0 };
    this.anger = 0;
    this.angerTarget = 0;
    this.talk = null;
    this.talkSpec = null;
    this.lookTarget = null;
    this.lookW = 0;
    this.path = [];
    this.walkSpeed = 1.3;
    this.seat = 0;
    this.faceYaw = null;
    this.blinkT = 1 + Math.random() * 3;
    this.blink = 0;
    this.nodT = 0;
    this.shakeT = 0;
    this.time = Math.random() * 10;
    this.mouth = { open: 0, round: 0, wide: 0, close: 0 };
    this.onStep = null;
    this._stepPhase = 0;
    this._lastStepSign = 0;
    this.seatOffset = -0.5;
    this.sitClip = 'sit'; // houding als seat = 1 (bijvoorbeeld 'sitTable': handen op tafel)
    this.torsoFollow = 0; // deel van de kijkrichting dat de romp meedraait (zittend)
    this.upright = false; // hoofd draaien zonder te kantelen (zie _look)
    this.lean = 0; // romp achterover (+) of naar voren (-), in radialen
    this._lean = 0;
    this.armPose = null; // vaste armhouding bovenop de animatie (zie ARM_POSES)
    this.armPoseW = 0;
    this.mood = {}; // grondstemming als hij niet praat, bijvoorbeeld { smile: 0.3 }
    this.laugh = 0; // lachstoten (volgt het volume van de lach)
    this.laughMood = 0; // lachend gezicht (trager)
    this.chuckleT = 0;
    // Spraak, nadruk, adem en ogen.
    this.speech = null; // { track, clock, emo, level, si, bi }
    this.vis = {}; // huidige visemengewichten (gedempt)
    this.emph = 0; // nadruk-envelop (0..1)
    this.emphSign = 1;
    this.breath = 0; // inademing (0..1)
    this.breathT = 0;
    this.pant = 0; // nahijgen na schreeuwen
    this.jaw = 0;
    this.emo = { shout: 0, smile: 0, worry: 0, sarcasm: 0, sad: 0 };
    this.sacc = new THREE.Vector2();
    this.saccTarget = new THREE.Vector2();
    this.saccT = 0.5;
    this.glanceT = 0;
    this.glanceDir = new THREE.Vector2();
    this.jabs = [];
    this._play('idle', 0);
  }

  _pruneMorphs(mesh) {
    const dict = mesh.morphTargetDictionary;
    const geo = mesh.geometry;
    const keepIdx = [];
    const newDict = {};
    this.morph = {};
    for (const [key, suffix] of Object.entries(KEEP)) {
      const full = Object.keys(dict).find((k) => k.endsWith(suffix));
      if (full === undefined) continue;
      newDict[key] = keepIdx.length;
      keepIdx.push(dict[full]);
    }
    for (const attr of Object.keys(geo.morphAttributes)) {
      geo.morphAttributes[attr] = keepIdx.map((i) => geo.morphAttributes[attr][i]);
    }
    mesh.morphTargetDictionary = newDict;
    mesh.morphTargetInfluences = new Array(keepIdx.length).fill(0);
    this.morphMesh = mesh;
    this.morphIdx = newDict;
  }

  _orient() {
    this.root.updateMatrixWorld(true);
    const local = (bone) => {
      bone.getWorldQuaternion(_q);
      return FWD.clone().applyQuaternion(_q.invert());
    };
    this.headFwd = local(this.bones.head);
    this.eyeFwdL = this.bones.eyeL ? local(this.bones.eyeL) : null;
    this.eyeFwdR = this.bones.eyeR ? local(this.bones.eyeR) : null;
    // Lengtes van de arm (voor wijzen).
    this.bones.arm.l.fore.getWorldPosition(_v);
    this.bones.arm.l.up.getWorldPosition(_v2);
    this.upperLen = _v.distanceTo(_v2);
    // Richting van de bovenarm in de lokale ruimte van het bot (naar de onderarm).
    for (const s of ['l', 'r']) {
      const a = this.bones.arm[s];
      a.upAxis = a.fore.position.clone().normalize();
      a.foreAxis = a.hand.position.clone().normalize();
    }
  }

  _play(name, fade = 0.45, timeScale = 1) {
    const a = this.actions[name];
    if (!a) return;
    if (this.current === a) {
      a.timeScale = timeScale;
      return;
    }
    const once = this.forced && this.forced.name === name && !this.forced.loop;
    // Een clip die nog aan het uitfaden is niet herstarten: dan loopt de beweging gewoon door.
    const stillRunning = a.isRunning() && a.getEffectiveWeight() > 0.05 && !once;
    if (!stillRunning) {
      a.reset();
      // Begin ergens willekeurig in lange clips, zodat herhaling minder opvalt.
      if (a.getClip().duration > 10) a.time = Math.random() * (a.getClip().duration - 4);
    }
    a.timeScale = timeScale;
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = once;
    a.enabled = true;
    a.setEffectiveWeight(1);
    a.play();
    if (this.current) this.current.crossFadeTo(a, fade, false);
    else a.fadeIn(fade);
    this.current = a;
  }

  setHands(name) {
    this.handPose = name;
  }

  // Start lipsync voor een regel. clock() geeft seconden sinds de start van het geluid,
  // level() het actuele volume (of null).
  // emo.laugh: [[van, tot], …] stukken waarin de opname lacht.
  speak(track, clock, emo = {}, level = null) {
    this.speech = { track, clock, level, si: 0, bi: 0, laugh: emo.laugh };
    this.emoTarget = { shout: 0, smile: 0, worry: 0, sarcasm: 0, ...emo };
    if (emo.shout > 0.5) this.pant = 0;
  }

  stopSpeaking() {
    if (this.speech && (this.emoTarget?.shout || 0) > 0.45) this.pant = 1;
    this.speech = null;
    this.emoTarget = { shout: 0, smile: this.emoTarget?.smile * 0.5 || 0, worry: 0, sarcasm: 0 };
    if (Math.random() < 0.7) this.blink = 0.16;
  }

  // Non-verbale reactie terwijl de ander praat.
  //  'soften'  : uitademen, schouders zakken, kleine knik
  //  'scoff'   : ogen rollen omhoog, smalende grijns, hoofd schudden
  //  'startle' : even terugdeinzen (verbazing), daarna nog bozer
  react(kind) {
    if (kind === 'soften') {
      this.inhale(0.5);
      this.emoTarget = { ...(this.emoTarget || {}), worry: 0.25 };
      setTimeout(() => this.nod(), 900);
    } else if (kind === 'scoff') {
      this.glanceT = 0.8;
      this.glanceDir.set(0.08, 0.32);
      this.emoTarget = { ...(this.emoTarget || {}), sarcasm: 0.9 };
      setTimeout(() => this.shake(), 700);
      setTimeout(() => (this.emoTarget = { ...(this.emoTarget || {}), sarcasm: 0 }), 2200);
    } else if (kind === 'startle') {
      this.surprise = 0.7;
      this.emph = 1;
    }
  }

  // Kort grinniken zonder geluid (dur seconden, sterkte 0..1).
  chuckle(dur = 1.2, amp = 0.5) {
    this.chuckleT = dur;
    this.chuckleAmp = amp;
  }

  // Wereldpositie van een hand ('l' of 'r').
  handWorld(side, v) {
    return this.bones.arm[side].hand.getWorldPosition(v);
  }

  // Zichtbaar inademen (vóór een zin of in een pauze).
  inhale(dur = 0.35) {
    this.breathT = dur;
  }

  // Kort gebaar met een arm naar een punt (prikken, hakken), daarna terug.
  jab(side, worldPoint, dur = 0.5) {
    this.jabs.push({ side, p: worldPoint.clone(), t: dur });
  }

  setAim(side, worldPoint) {
    this.aim[side] = worldPoint ? worldPoint.clone() : null;
  }

  nod() {
    this.nodT = 1.0;
  }

  shake() {
    this.shakeT = 1.2;
  }

  walkTo(points, speed = 1.3) {
    this.cancelWalk();
    this.path = points.map((p) => new THREE.Vector3(p[0], 0, p[1]));
    this.walkSpeed = speed;
    return new Promise((r) => (this._arrive = r));
  }

  cancelWalk() {
    this.path = [];
    if (this._arrive) {
      const r = this._arrive;
      this._arrive = null;
      r();
    }
  }

  faceTowards(x, z) {
    const p = this.root.position;
    this.faceYaw = Math.atan2(x - p.x, z - p.z);
  }

  headWorld(v) {
    this.bones.head.updateWorldMatrix(true, false);
    return this.bones.head.getWorldPosition(v).add(_v3.set(0, 0.06, 0));
  }

  chestWorld(v) {
    return this.bones.spine2.getWorldPosition(v);
  }

  // Speelt een animatie één keer (of herhaald bij loop=true) en negeert zolang de gewone keuze.
  playForced(name, timeScale = 1, loop = false, fade = 0.5) {
    this.forced = { name, ts: timeScale, loop, fade };
    const a = this.actions[name];
    return a ? a.getClip().duration / timeScale : 0;
  }

  clearForced() {
    this.forced = null;
  }

  _chooseClip(moving) {
    if (this.forced) return [this.forced.name, this.forced.ts];
    if (this.seat > 0.5) return [this.sitClip, 1];
    if (moving) {
      const fast = this.walkSpeed > 1.45 && this.actions.walkFast;
      const name = fast ? 'walkFast' : 'walk';
      const natural = fast ? 1.65 : 1.25;
      const v = Math.max(this.curSpeed || 0, 0.35);
      return [name, THREE.MathUtils.clamp(v / natural, 0.45, 1.5)];
    }
    if (this.turning) return ['walk', 0.55];
    // Wijzen: presentatiegebaar als basis, arm wordt daarna met IK gericht.
    const options = POSE_CLIPS[this.handPose] || POSE_CLIPS.relaxed;
    const name = options.find((n) => this.actions[n]) || 'idle';
    return [name, 1];
  }

  update(dt) {
    this.time += dt;

    // Lopen.
    let moving = false;
    if (this.path.length) {
      const p = this.root.position;
      const target = this.path[0];
      _v.set(target.x - p.x, 0, target.z - p.z);
      const dist = _v.length();
      if (dist < 0.04) {
        this.path.shift();
        if (!this.path.length && this._arrive) {
          const r = this._arrive;
          this._arrive = null;
          r();
        }
      } else {
        _v.normalize();
        // Geleidelijk op gang komen en afremmen voor het laatste punt.
        const remaining = this.path.length === 1 ? dist : 99;
        const vMax = Math.min(this.walkSpeed, Math.sqrt(2 * 2.2 * remaining) + 0.25);
        this.curSpeed = Math.min(vMax, (this.curSpeed || 0) + 2.6 * dt);
        p.addScaledVector(_v, Math.min(dist, this.curSpeed * dt));
        this.root.rotation.y = turnTowards(this.root.rotation.y, Math.atan2(_v.x, _v.z), 6 * dt);
        moving = true;
        this.faceYaw = null;
        this._stepPhase += dt * this.walkSpeed * 2.6;
        const sgn = Math.sign(Math.sin(this._stepPhase * Math.PI));
        if (sgn !== this._lastStepSign && this.onStep) this.onStep(this);
        this._lastStepSign = sgn;
      }
    }
    if (!moving && this.faceYaw !== null && !this.lockYaw) this.root.rotation.y = turnTowards(this.root.rotation.y, this.faceYaw, 3.5 * dt);
    if (!moving) this.curSpeed = 0;

    // Draait hij op de plek? Dan kleine stapjes in plaats van glijden.
    let dy = this.root.rotation.y - (this._prevYaw ?? this.root.rotation.y);
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this._prevYaw = this.root.rotation.y;
    const yawRate = dt > 0 ? Math.abs(dy) / dt : 0;
    if (!moving && this.seat < 0.5 && !this.lockYaw && yawRate > 0.45) this.turnHold = 0.3;
    else this.turnHold = Math.max(0, (this.turnHold || 0) - dt);
    this.turning = !moving && this.turnHold > 0;

    const [clip, ts] = this._chooseClip(moving);
    this._play(clip, moving || this.turning ? 0.45 : this.forced ? this.forced.fade : 0.95, ts);
    this.model.position.y = this.seat > 0.5 ? this.seatOffset * this.seat * 100 * 0.01 : 0;
    this.mixer.update(dt);
    this._rootMotion();
    this.root.updateMatrixWorld(true);

    // Procedurele lagen bovenop de animatie.
    this._speechClock(dt);
    this._beatBody(dt);
    this._aimArms(dt);
    this._look(dt);
    this._face(dt);
  }

  // Clips met wortelbeweging verplaatsen het hele personage (in de kijkrichting van de wortel).
  _rootMotion() {
    const a = this.current;
    const m = a && this.forced?.name === a.getClip().name ? a.getClip().motion : null;
    if (!m) {
      this._motionPrev = null;
      return;
    }
    const f = Math.min(m.x.length - 1, a.time * m.fps);
    const i = Math.floor(f);
    const j = Math.min(i + 1, m.x.length - 1);
    const x = m.x[i] + (m.x[j] - m.x[i]) * (f - i);
    const z = m.z[i] + (m.z[j] - m.z[i]) * (f - i);
    const prev = this._motionPrev;
    if (prev && prev.m === m && a.time >= prev.t) {
      const dx = x - prev.x;
      const dz = z - prev.z;
      const yaw = this.root.rotation.y;
      this.root.position.x += dx * Math.cos(yaw) + dz * Math.sin(yaw);
      this.root.position.z += -dx * Math.sin(yaw) + dz * Math.cos(yaw);
    }
    this._motionPrev = { m, t: a.time, x, z };
  }

  // Totale verschuiving (in wortelruimte, meters) die een clip met wortelbeweging maakt.
  motionOffset(name) {
    const m = this.clips[name]?.motion;
    return m ? new THREE.Vector2(m.x[m.x.length - 1], m.z[m.z.length - 1]) : new THREE.Vector2();
  }

  // Loopt de tijdlijn van de huidige regel af: nadruk en adem.
  _speechClock(dt) {
    const sp = this.speech;
    const emoT = this.emoTarget || { shout: 0, smile: 0, worry: 0, sarcasm: 0 };
    for (const k of Object.keys(this.emo)) {
      const want = Math.max(emoT[k] || 0, this.mood[k] || 0);
      this.emo[k] += (want - this.emo[k]) * (1 - Math.exp(-3 * dt));
    }
    this._laughClock(dt);
    this.emphTarget = Math.max(0, (this.emphTarget || 0) - dt * 1.6);
    this.emph += (this.emphTarget - this.emph) * (1 - Math.exp(-7 * dt));
    if (this.breathT > 0) {
      this.breathT -= dt;
      this.breath += (1 - this.breath) * (1 - Math.exp(-10 * dt));
    } else this.breath *= Math.exp(-5 * dt);
    this.pant = Math.max(0, this.pant - dt * 0.12);
    if (!sp) return;
    const t = sp.clock();
    const tr = sp.track;
    while (sp.si < tr.s.length && tr.s[sp.si][0] <= t) {
      const st = tr.s[sp.si][1];
      this.emphTarget = Math.max(this.emphTarget || 0, st);
      if (st >= 0.85 && Math.random() < 0.5) this.blink = 0.16;
      sp.si++;
    }
    while (sp.bi < tr.b.length && tr.b[sp.bi][0] <= t) {
      this.inhale(tr.b[sp.bi][1] * 0.7);
      // Soms kort wegkijken bij een pauze, zoals mensen doen als ze nadenken.
      if (Math.random() < 0.45) {
        this.glanceT = 0.45 + Math.random() * 0.4;
        this.glanceDir.set((Math.random() < 0.5 ? -1 : 1) * (0.25 + Math.random() * 0.2), -0.12 - Math.random() * 0.1);
      }
      sp.bi++;
    }
  }

  // Lachen: in de lachstukken van de opname volgen borst en schouders het volume van de lach
  // (elke "ha" een stoot), het gezicht lacht mee en het hoofd gaat iets achterover.
  _laughClock(dt) {
    let want = 0;
    const sp = this.speech;
    if (sp?.laugh) {
      const t = sp.clock();
      if (sp.laugh.some(([a, b]) => t >= a && t <= b)) want = 0.25 + 0.75 * Math.min(1, loudAt(sp.track, t) * 1.6);
    }
    if (this.chuckleT > 0) {
      this.chuckleT -= dt;
      want = Math.max(want, this.chuckleAmp * (0.45 + 0.55 * Math.abs(Math.sin(this.time * 10.5))) * Math.min(1, this.chuckleT * 3));
    }
    this.laugh += (want - this.laugh) * (1 - Math.exp(-16 * dt));
    this.laughMood += ((want > 0 ? 1 : 0) - this.laughMood) * (1 - Math.exp(-(want > 0 ? 5 : 1.6) * dt));
  }

  // Ritme van het lichaam: op nadruk het hoofd en de romp naar voren, borst die ademt.
  _beatBody(dt) {
    const e = this.emph * this.emph;
    const br = this.breath * 0.6 + this.pant * (0.5 + 0.5 * Math.sin(this.time * 7.5));
    const sp2 = this.bones.spine2;
    if (!sp2) return;
    const side = _v.set(1, 0, 0).applyQuaternion(this.root.getWorldQuaternion(_qRoot));
    this._lean += (this.lean - this._lean) * (1 - Math.exp(-2.5 * dt));
    const pitch = (e * 0.06 * (this.emo.shout > 0.3 ? 1.2 : 0.7) + this.laugh * 0.09) * BODY_ACCENT - br * 0.022 - this._lean;
    if (Math.abs(pitch) > 1e-4) {
      sp2.getWorldQuaternion(_q);
      _q2.setFromAxisAngle(side, pitch);
      const worldNew = _q2.multiply(_q);
      sp2.parent.getWorldQuaternion(_q3);
      sp2.quaternion.copy(_q3.invert().multiply(worldNew));
      sp2.updateMatrixWorld(true);
    }
    // Lachen: schouders gaan mee omhoog op elke lachstoot.
    if (this.laugh > 0.01 && this.bones.clavL) {
      const fwd = _v.set(0, 0, 1).applyQuaternion(this.root.getWorldQuaternion(_qRoot));
      for (const [bone, sign] of [[this.bones.clavL, 1], [this.bones.clavR, -1]]) {
        bone.getWorldQuaternion(_q);
        _q2.setFromAxisAngle(fwd, sign * this.laugh * 0.09 * BODY_ACCENT);
        const worldNew = _q2.multiply(_q);
        bone.parent.getWorldQuaternion(_q3);
        bone.quaternion.copy(_q3.invert().multiply(worldNew));
      }
      sp2.updateMatrixWorld(true);
    }
    // Korte gebaren (prikken/hakken) via de wijs-IK.
    for (let i = this.jabs.length - 1; i >= 0; i--) {
      const j = this.jabs[i];
      j.t -= dt;
      if (j.t <= 0) {
        if (this.aim[j.side] === j.p) this.aim[j.side] = null;
        this.jabs.splice(i, 1);
      } else if (!this.aim[j.side] || this.aim[j.side] === j.p) this.aim[j.side] = j.p;
    }
  }

  _aimArms(dt) {
    // Vaste armhouding (dienblad, armen over elkaar …): richting van boven- en onderarm.
    this.armPoseW += ((this.armPose ? 1 : 0) - this.armPoseW) * (1 - Math.exp(-4 * dt));
    if (this.armPose) this._lastArmPose = this.armPose;
    const pose = ARM_POSES[this._lastArmPose];
    if (pose && this.armPoseW > 0.01) {
      const w = this.armPoseW * this.armPoseW * (3 - 2 * this.armPoseW);
      this.root.getWorldQuaternion(_qRoot);
      for (const s of ['l', 'r']) {
        const a = this.bones.arm[s];
        const k = s === 'l' ? 1 : -1;
        const [up, fore] = pose[s];
        this._pointBone(a.up, a.upAxis, _v2.set(up[0] * k, up[1], up[2]).normalize().applyQuaternion(_qRoot), w);
        a.up.updateMatrixWorld(true);
        this._pointBone(a.fore, a.foreAxis, _v2.set(fore[0] * k, fore[1], fore[2]).normalize().applyQuaternion(_qRoot), w);
        a.fore.updateMatrixWorld(true);
      }
    }
    for (const s of ['l', 'r']) {
      const want = this.aim[s] ? 1 : 0;
      this.aimW[s] += (want - this.aimW[s]) * (1 - Math.exp(-3.2 * dt));
      if (this.aim[s]) this._lastAim = this._lastAim || {};
      if (this.aim[s]) (this._lastAim[s] = this.aim[s]);
      const raw = this.aimW[s];
      // Zachte S-curve en minder ver bij prikgebaren: armen schieten niet meer recht.
      const isJab = this.jabs.some((j) => j.side === s && j.p === (this.aim[s] || this._lastAim?.[s]));
      const w = raw * raw * (3 - 2 * raw) * (isJab ? 0.55 : 0.85);
      const target = this.aim[s] || this._lastAim?.[s];
      if (w < 0.01 || !target) continue;
      const a = this.bones.arm[s];
      // Bovenarm richten.
      a.up.getWorldPosition(_v);
      const desired = _v2.copy(target).sub(_v).normalize();
      // iets omhoog zodat het een duidelijk wijsgebaar is
      desired.y += 0.08;
      desired.normalize();
      this._pointBone(a.up, a.upAxis, desired, w);
      a.up.updateMatrixWorld(true);
      // Onderarm gestrekt in dezelfde richting.
      this._pointBone(a.fore, a.foreAxis, desired, w * 0.6);
      a.fore.updateMatrixWorld(true);
    }
  }

  // Draait een bot zodat zijn lokale as `axis` in wereldrichting `dir` wijst (met gewicht w).
  _pointBone(bone, axis, dir, w) {
    bone.getWorldQuaternion(_q);
    const cur = _v3.copy(axis).applyQuaternion(_q).normalize();
    _q2.setFromUnitVectors(cur, dir);
    _q2.slerp(_q3.identity(), 1 - w);
    const worldNew = _q2.multiply(_q);
    bone.parent.getWorldQuaternion(_q3);
    bone.quaternion.copy(_q3.invert().multiply(worldNew));
  }

  _look(dt) {
    let target = null;
    if (this.lookTarget) target = typeof this.lookTarget === 'function' ? this.lookTarget(new THREE.Vector3()) : this.lookTarget;
    this.lookW += ((target ? 1 : 0) - this.lookW) * (1 - Math.exp(-4 * dt));
    if (target) {
      // Het kijkdoel glijdt naar een nieuw punt, zodat het hoofd niet ineens omklapt.
      if (!this._lookPos) this._lookPos = target.clone();
      else this._lookPos.lerp(target, 1 - Math.exp(-4.5 * dt));
      this._lastLook = this._lookPos.clone();
    }
    const t = target ? this._lookPos : this._lastLook;
    const head = this.bones.head;
    if (t && this.lookW > 0.01 && this.torsoFollow > 0) {
      // Zittend draait de romp een stukje mee naar wie hij aankijkt.
      const sp2 = this.bones.spine2;
      sp2.getWorldPosition(_v);
      this.root.getWorldQuaternion(_qRoot);
      const fwd = _v3.set(0, 0, 1).applyQuaternion(_qRoot);
      const d = Math.atan2(t.x - _v.x, t.z - _v.z) - Math.atan2(fwd.x, fwd.z);
      const yaw = THREE.MathUtils.clamp(Math.atan2(Math.sin(d), Math.cos(d)), -0.9, 0.9) * this.torsoFollow * this.lookW;
      sp2.getWorldQuaternion(_q);
      _q2.setFromAxisAngle(UP, yaw);
      const worldNew = _q2.multiply(_q);
      sp2.parent.getWorldQuaternion(_q3);
      sp2.quaternion.copy(_q3.invert().multiply(worldNew));
      sp2.updateMatrixWorld(true);
    }
    if (t && this.lookW > 0.01) {
      // Lichaam meedraaien als het doel te ver opzij is.
      if (!this.path.length && this.seat < 0.5 && !this.lockYaw) {
        const p = this.root.position;
        const yaw = Math.atan2(t.x - p.x, t.z - p.z);
        let d = yaw - this.root.rotation.y;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        if (Math.abs(d) > 0.7) this.root.rotation.y += Math.sign(d) * Math.min(Math.abs(d) - 0.65, 1.3 * dt);
      }
      for (const [bone, fwd, weight, maxAng] of [
        [this.bones.neck, this.headFwd, 0.3, 0.45],
        [head, this.headFwd, 0.6, 0.8],
      ]) {
        bone.updateMatrixWorld(true);
        head.getWorldPosition(_v);
        const desired = _v2.copy(t).sub(_v).normalize();
        head.getWorldQuaternion(_q);
        const cur = _v3.copy(fwd).applyQuaternion(_q).normalize();
        if (this.upright) {
          // Zoals een echt hoofd: eerst draaien om de verticale as, dan knikken; niet scheef kantelen.
          const k = weight * this.lookW;
          const dYaw = THREE.MathUtils.clamp(shortAngle(Math.atan2(desired.x, desired.z) - Math.atan2(cur.x, cur.z)), -maxAng, maxAng);
          const dPitch = THREE.MathUtils.clamp(Math.asin(desired.y) - Math.asin(THREE.MathUtils.clamp(cur.y, -1, 1)), -maxAng * 0.7, maxAng * 0.7);
          const side = _v.set(cur.x, 0, cur.z).normalize().cross(UP);
          _q2.setFromAxisAngle(UP, dYaw * k).multiply(_q3.setFromAxisAngle(side, dPitch * k));
        } else {
          const ang = Math.min(cur.angleTo(desired), maxAng);
          if (ang < 1e-3) continue;
          const axis = _v.crossVectors(cur, desired).normalize();
          _q2.setFromAxisAngle(axis, ang * weight * this.lookW);
        }
        bone.getWorldQuaternion(_q);
        const worldNew = _q2.multiply(_q);
        bone.parent.getWorldQuaternion(_q3);
        bone.quaternion.copy(_q3.invert().multiply(worldNew));
      }
    }
    // Knikken en nee schudden, plus kleine praatbewegingen.
    let pitch = 0;
    let yaw = 0;
    if (this.nodT > 0) {
      this.nodT -= dt;
      pitch += Math.sin((1 - this.nodT) * 9) * 0.08 * Math.min(1, this.nodT * 2.5);
    }
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      yaw += Math.sin((1.2 - this.shakeT) * 10) * 0.1 * Math.min(1, this.shakeT * 2);
    }
    // Op nadruk: korte knik naar voren/omlaag (boos) of omhoog (rustig).
    pitch += this.emph * this.emph * (this.anger > 0.4 ? 0.07 : -0.04) * BODY_ACCENT;
    if (this.speech) pitch += this.jaw * 0.025;
    // Lachen: hoofd iets achterover en meeschokken; verdriet: hoofd iets omlaag.
    pitch += -this.laughMood * 0.09 * BODY_ACCENT - this.laugh * 0.03 + this.emo.sad * 0.07;
    // Kort wegkijken (nadenken): hoofd draait een beetje mee.
    let gx = 0;
    let gy = 0;
    if (this.glanceT > 0) {
      this.glanceT -= dt;
      const k = Math.min(1, this.glanceT * 4, (0.9 - this.glanceT) * 6 + 0.2);
      gx = this.glanceDir.x * k;
      gy = this.glanceDir.y * k;
      yaw += gx * 0.35;
      pitch -= gy * 0.3;
    }
    if (pitch || yaw) {
      // Rond de verticale en zijwaartse wereldas van het lichaam draaien.
      head.getWorldQuaternion(_q);
      const up = _v.set(0, 1, 0);
      const side = _v2.set(1, 0, 0).applyQuaternion(this.root.getWorldQuaternion(_qRoot));
      _q2.setFromAxisAngle(up, yaw).multiply(_q3.setFromAxisAngle(side, pitch));
      const worldNew = _q2.multiply(_q);
      head.parent.getWorldQuaternion(_q3);
      head.quaternion.copy(_q3.invert().multiply(worldNew));
    }
    head.updateMatrixWorld(true);
    // Oogsprongetjes: kleine snelle verplaatsingen, minder als iemand boos staart.
    this.saccT -= dt;
    if (this.saccT < 0) {
      const amp = this.anger > 0.6 && !this.speech ? 0.012 : 0.03;
      this.saccTarget.set((Math.random() - 0.5) * 2 * amp, (Math.random() - 0.5) * amp);
      this.saccT = 0.35 + Math.random() * (this.anger > 0.6 ? 2.2 : 1.4);
    }
    this.sacc.lerp(this.saccTarget, 1 - Math.exp(-40 * dt));
    // Ogen maken oogcontact.
    if (t && this.eyeFwdL) {
      for (const [eye, fwd] of [[this.bones.eyeL, this.eyeFwdL], [this.bones.eyeR, this.eyeFwdR]]) {
        eye.updateMatrixWorld(true);
        eye.getWorldPosition(_v);
        const desired = _v2.copy(t).sub(_v).normalize();
        // Oogsprongetjes en wegkijken bovenop het doel.
        const right = _v3.crossVectors(desired, UP).normalize();
        desired.addScaledVector(right, this.sacc.x + gx).addScaledVector(UP, this.sacc.y + gy).normalize();
        eye.getWorldQuaternion(_q);
        const cur = _v3.copy(fwd).applyQuaternion(_q).normalize();
        const ang = Math.min(cur.angleTo(desired), 0.5);
        if (ang < 1e-3) continue;
        const axis = _v.crossVectors(cur, desired).normalize();
        _q2.setFromAxisAngle(axis, ang * this.lookW);
        const worldNew = _q2.multiply(_q);
        eye.parent.getWorldQuaternion(_q3);
        eye.quaternion.copy(_q3.invert().multiply(worldNew));
      }
    }
  }

  // Visemen op tijdstip t uit de tijdlijn: elke mondstand heeft een zachte "bult" rond zijn
  // middelpunt, zodat klanken in elkaar overlopen (co-articulatie).
  _visemesAt(track, t, out) {
    const v = track.v;
    // binair zoeken naar het eerste keyframe rond t - 0.3 s
    let lo = 0;
    let hi = v.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (v[mid][0] < t - 0.3) lo = mid + 1;
      else hi = mid;
    }
    for (let i = lo; i < v.length && v[i][0] < t + 0.3; i++) {
      const [c, name, g, d] = v[i];
      const sigma = Math.max(0.028, d * 0.55) + (name === 'PP' ? 0 : 0.018);
      const x = (t - c) / sigma;
      const w = g * Math.exp(-0.5 * x * x);
      if (w > (out[name] || 0)) out[name] = w;
    }
    return out;
  }

  _face(dt) {
    if (!this.morphMesh) return;
    const inf = this.morphMesh.morphTargetInfluences;
    const set = (k, val) => {
      const i = this.morphIdx[k];
      if (i !== undefined) inf[i] = THREE.MathUtils.clamp(val, 0, 1);
    };
    this.anger += (this.angerTarget - this.anger) * (1 - Math.exp(-2.2 * dt));
    // Schrik dooft langzaam uit en verdringt zolang de boosheid.
    this.surprise = Math.max(0, (this.surprise || 0) - dt * 0.55);
    const SUR = this.surprise * EXPRESSION;
    const A = this.anger * (1 - this.surprise * 0.85) * EXPRESSION;
    const E = this.emo;
    const emph = this.emph * EXPRESSION;

    // ---- Spraak ----
    const want = {};
    let loud = 0;
    let speaking = false;
    if (this.speech) {
      const sp = this.speech;
      // Lippen lopen ~50 ms voor op het geluid, zoals bij echte sprekers.
      const t = sp.clock() + 0.05;
      if (t < sp.track.dur + 0.2) {
        this._visemesAt(sp.track, t, want);
        speaking = true;
      }
      if (sp.track.e) {
        // Gemeten luidheid van de opname (per 20 ms), lineair geïnterpoleerd.
        loud = loudAt(sp.track, t);
        // Stilte binnen de zin: lippen gaan dicht.
        const gate = THREE.MathUtils.smoothstep(loud, 0.025, 0.11);
        for (const k of Object.keys(want)) if (k !== 'PP') want[k] *= gate;
        loud = Math.min(1.2, loud * 1.35);
      } else {
        const lv = sp.level ? sp.level() : null;
        loud = lv === null ? 0.65 : THREE.MathUtils.clamp(lv * 7, 0, 1.2);
      }
    } else if (this.talk) {
      // Terugval zonder tijdlijn: alleen op volume.
      const r = this.talk();
      const lv = typeof r === 'number' ? r : r?.level || 0;
      const o = THREE.MathUtils.clamp(lv * 9, 0, 1);
      want.aa = o * 0.8;
      loud = o;
      speaking = o > 0.02;
    }
    const VIS = ['sil', 'PP', 'FF', 'TH', 'DD', 'kk', 'CH', 'SS', 'nn', 'RR', 'aa', 'E', 'I', 'O', 'U'];
    // Klinkers ruimer bij luid praten en schreeuwen, medeklinkers blijven strak.
    const vowelGain = 0.78 + 0.25 * Math.min(1, loud) + E.shout * 0.12;
    for (const name of VIS) {
      let target = want[name] || 0;
      if (name === 'aa' || name === 'E' || name === 'O') target *= vowelGain;
      const cur = this.vis[name] || 0;
      const rate = target > cur ? 38 : 22;
      this.vis[name] = cur + (target - cur) * (1 - Math.exp(-rate * dt));
      set(name, this.vis[name]);
    }
    const vs = this.vis;
    // Kaak: opening van de klinker × volume; dicht bij p/b/m.
    const openness = (vs.aa || 0) * 0.55 + (vs.O || 0) * 0.38 + (vs.E || 0) * 0.3 + (vs.I || 0) * 0.14 + (vs.U || 0) * 0.16 + (vs.RR || 0) * 0.12 + (vs.kk || 0) * 0.12;
    const jawT = speaking ? openness * (0.6 + 0.45 * Math.min(1, loud)) * (1 + E.shout * 0.2) * (1 - (vs.PP || 0) * 0.9) : 0;
    const breathOpen = this.breath * 0.18 + this.pant * (0.12 + 0.06 * Math.sin(this.time * 7.5));
    // Lachen opent de kaak op elke lachstoot.
    const LA = this.laugh * EXPRESSION;
    const LM = this.laughMood * EXPRESSION;
    this.jaw += (Math.max(jawT, LA * 0.5) + breathOpen - this.jaw) * (1 - Math.exp(-30 * dt));
    set('jawOpen', this.jaw + SUR * 0.3);
    set('mouthClose', (vs.PP || 0) * 0.35);
    set('lipsPart', speaking ? 0.12 + breathOpen : breathOpen * 1.2);

    // ---- Emotie, ook tijdens het praten ----
    const shoutNow = E.shout * (speaking ? 0.6 + 0.4 * Math.min(1, loud) : 0.35) * EXPRESSION;
    const angryEmph = A > 0.25 ? emph : 0;
    const calmEmph = A <= 0.25 ? emph : 0;
    set('browDownL', A * 0.85 + angryEmph * 0.3);
    set('browDownR', A * 0.85 + angryEmph * 0.3);
    set('browLower', A * 0.55 + angryEmph * 0.25);
    const SAD = E.sad * EXPRESSION;
    set('browInnerUp', Math.max(0, 0.25 - A) * 0.5 + E.worry * 0.7 + calmEmph * 0.45 + SUR * 0.8 + SAD * 0.9 + LM * 0.15);
    set('browOuterUpL', calmEmph * 0.5 + E.sarcasm * 0.25 + SUR * 0.7);
    set('browOuterUpR', calmEmph * 0.5 + SUR * 0.7);
    set('sneerL', A * 0.3 + shoutNow * 0.25);
    set('sneerR', A * 0.3 + shoutNow * 0.25);
    set('squintL', A * 0.32 + angryEmph * 0.2 + LM * 0.45);
    set('squintR', A * 0.32 + angryEmph * 0.2 + LM * 0.45);
    set('cheekSquintL', shoutNow * 0.3 + E.smile * 0.4 + LM * 0.7);
    set('cheekSquintR', shoutNow * 0.3 + E.smile * 0.4 + LM * 0.7);
    // Tanden ontbloten bij schreeuwen, gespannen lippen als hij zwijgt.
    const vowelOpen = (vs.aa || 0) + (vs.E || 0) + (vs.I || 0);
    set('upperUpL', A * 0.18 * vowelOpen + shoutNow * 0.45);
    set('upperUpR', A * 0.18 * vowelOpen + shoutNow * 0.45);
    set('lipRaiser', shoutNow * 0.25);
    set('stretchL', shoutNow * 0.35 * Math.min(1, vowelOpen + 0.3));
    set('stretchR', shoutNow * 0.35 * Math.min(1, vowelOpen + 0.3));
    set('frownL', A * 0.45 * (speaking ? 0.6 : 1) + SAD * 0.55);
    set('frownR', A * 0.45 * (speaking ? 0.6 : 1) + SAD * 0.55);
    set('pressL', (A * 0.3 + SAD * 0.3) * (speaking ? 0 : 1) * (1 - breathOpen * 3));
    set('pressR', (A * 0.3 + SAD * 0.3) * (speaking ? 0 : 1) * (1 - breathOpen * 3));
    const roundness = (vs.O || 0) + (vs.U || 0);
    set('smileL', (E.smile + E.sarcasm * 0.35) * (1 - roundness * 0.7) + (this.smile || 0) + LM * 0.8);
    set('smileR', E.smile * (1 - roundness * 0.7) + (this.smile || 0) + LM * 0.8);
    set('wideL', angryEmph * 0.35 * (A > 0.7 ? 1 : 0.5) + SUR * 0.9);
    set('wideR', angryEmph * 0.35 * (A > 0.7 ? 1 : 0.5) + SUR * 0.9);

    // ---- Knipperen (vaker bij spanning) ----
    this.blinkT -= dt;
    if (this.blinkT < 0) {
      this.blink = 0.16;
      this.blinkT = (A > 0.6 ? 1.6 : 2.4) + Math.random() * 3;
    }
    this.blink = Math.max(0, this.blink - dt);
    const b = this.blink > 0 ? Math.sin((this.blink / 0.16) * Math.PI) : 0;
    set('blinkL', b);
    set('blinkR', b);
  }
}

// Vaste armhoudingen in de ruimte van het lichaam (x = links, y = omhoog, z = vooruit),
// voor de linkerarm; de rechterarm is gespiegeld. [richting bovenarm, richting onderarm]
const ARM_POSES = {
  // Dienblad dragen: ellebogen langs het lijf, onderarmen naar voren.
  tray: { l: [[0.16, -1, 0.22], [-0.2, 0.05, 1]], r: [[0.16, -1, 0.22], [-0.2, 0.05, 1]] },
  // Armen over elkaar: onderarmen gekruist voor de borst (links iets hoger).
  crossed: { l: [[0.3, -1, 0.42], [-1, 0.22, 0.32]], r: [[0.3, -1, 0.38], [-1, 0.08, 0.42]] },
  // Sussen: handen voor het lichaam, iets omhoog ("ho, rustig").
  calm: { l: [[0.35, -0.65, 0.7], [-0.15, 0.45, 1]], r: [[0.35, -0.65, 0.7], [-0.15, 0.45, 1]] },
};

// Luidheid van de opname (0..~1.2) op tijdstip t, uit de lipsync-tijdlijn (per 20 ms).
function loudAt(track, t) {
  const e = track.e;
  if (!e) return 0;
  const f = Math.max(0, (t - 0.02) / 0.02);
  const i = Math.floor(f);
  const a0 = e[Math.min(i, e.length - 1)] || 0;
  const a1 = e[Math.min(i + 1, e.length - 1)] || 0;
  return (a0 + (a1 - a0) * (f - i)) / 99;
}

function shortAngle(d) {
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function turnTowards(cur, target, maxStep) {
  return cur + THREE.MathUtils.clamp(shortAngle(target - cur), -maxStep, maxStep);
}
