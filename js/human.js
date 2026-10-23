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
const _f = new THREE.Vector3();
const _u = new THREE.Vector3();
const _r = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _q4 = new THREE.Quaternion();
const _qR2 = new THREE.Quaternion();
const _v4 = new THREE.Vector3();
const _v5 = new THREE.Vector3();
// Lichaamsassen (links, omhoog, vooruit) en hulpvectoren voor kijken, IK en eigen handelingen.
const _bx = new THREE.Vector3();
const _by = new THREE.Vector3(0, 1, 0);
const _bz = new THREE.Vector3();
const _fx = new THREE.Vector3();
const _fz = new THREE.Vector3();
const _fa = new THREE.Vector3();
const _fb = new THREE.Vector3();
const _fc = new THREE.Vector3();
const _fg = new THREE.Vector3();
const _gzT = new THREE.Vector3();
const _gzN = new THREE.Vector3();
const _gzH = new THREE.Vector3();
const _gzE = new THREE.Vector3();
const _ikS = new THREE.Vector3();
const _ikD = new THREE.Vector3();
const _ikP = new THREE.Vector3();
const _ikE = new THREE.Vector3();
const _ikT = new THREE.Vector3();
const _ikPole = new THREE.Vector3();
const _qF = new THREE.Quaternion();
// Vingers krommen naar de handpalm toe: draaiing om deze as van elk vingerkootje.
const GRIP_AXIS = new THREE.Vector3(0, 0, 1);
// Hoe ver de ogen in de oogkas mogen draaien t.o.v. het hoofd (rad): opzij, omhoog, omlaag.
// Wat verder ligt, neemt het hoofd over; anders zie je alleen nog oogwit.
const EYE_YAW = 0.35;
const EYE_UP = 0.12;
const EYE_DOWN = 0.25;
// Hoe sterk gezichtsuitdrukkingen zijn (1 = maximaal van het model). Lager = ingetogener.
export const EXPRESSION = 0.62;
// Lachen krijgt een eigen, iets sterkere maat: met 0,62 leest een lach als gapen of verbazing
// (ronde mond, neutrale ogen). Blijft ingetogen, maar herkenbaar als lach.
export const EXPRESSION_LAUGH = 0.85;
// Hoe sterk de procedurele lichaamsaccenten zijn bovenop de motion capture.
const BODY_ACCENT = 0.6;
// Duur van een knipper (s): snel dicht, rustiger weer open.
const BLINK = 0.2;
// Gedeelde toestand van de oefening. quiet = de tijd staat (bijna) stil bij de keuze: dan begint
// niemand aan een eigen handeling (kopje pakken, nek wrijven …).
export const LIFE = { quiet: false };

const smoothstep = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
// Minimum-jerk-profiel (zachter begin en eind dan smoothstep): zo bewegen handen bij reiken.
const minJerk = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * x * (10 + x * (-15 + 6 * x)));
const rnd = (a, b) => a + Math.random() * (b - a);

// Gedempte veer (positie x, snelheid v) richting `target`, in kleine stapjes zodat hij ook bij
// een grote tijdstap stabiel blijft. zeta < 1: licht doorschieten en terugveren.
function spring(s, target, omega, zeta, dt) {
  const n = Math.max(1, Math.ceil(dt / 0.012));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    s.v += (omega * omega * (target - s.x) - 2 * zeta * omega * s.v) * h;
    s.x += s.v * h;
  }
  return s.x;
}
const sp0 = (x = 0) => ({ x, v: 0 });

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
// Houdingen met praatloops waarin de hand soms tot naast het hoofd komt (zie de handbegrenzing).
const HAND_CAP_POSES = new Set(['armsOut', 'shout', 'firm']);
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

// ---- Levende huid en ogen ----
// Per hoekpunt: x = hoort bij een oogbol (gewicht van de oogbotten), y = hoort bij een hand
// (hand- en vingerbotten). Zo weten de shaders waar oog en blote huid zitten, ook al delen ogen
// en gezicht één textuur en handen en kleding een andere.
function tagVertices(mesh) {
  const g = mesh.geometry;
  const sk = mesh.skeleton;
  if (!sk || !g.attributes.skinIndex || g.attributes.aTag) return;
  const eye = new Set();
  const hand = new Set();
  sk.bones.forEach((b, i) => {
    if (/_[LR]Eye$/.test(b.name)) eye.add(i);
    else if (/_[LR]_(Hand|Finger)/.test(b.name)) hand.add(i);
  });
  const si = g.attributes.skinIndex;
  const sw = g.attributes.skinWeight;
  const tag = new Float32Array(si.count * 2);
  for (let v = 0; v < si.count; v++) {
    for (let k = 0; k < 4; k++) {
      const b = si.getComponent(v, k);
      const w = sw.getComponent(v, k);
      if (eye.has(b)) tag[v * 2] += w;
      else if (hand.has(b)) tag[v * 2 + 1] += w;
    }
  }
  g.setAttribute('aTag', new THREE.BufferAttribute(tag, 2));
}

// Verbergt lichaamsdriehoeken waarvan alle hoekpunten in een van de UV-rechthoeken liggen
// (rechthoek [u0, y0, u1, y1], y van boven in de textuur): de hoekpunten vallen samen.
function hideBodyParts(mesh, mats, boxes) {
  const g = mesh.geometry;
  const uv = g.attributes.uv;
  const pos = g.attributes.position;
  const idx = g.index;
  const vi = (i) => (idx ? idx.getX(i) : i);
  const inBox = (v) => {
    const x = uv.getX(v);
    const y = 1 - uv.getY(v);
    return boxes.some(([u0, y0, u1, y1]) => x >= u0 && x <= u1 && y >= y0 && y <= y1);
  };
  const groups = g.groups.length ? g.groups : [{ start: 0, count: idx ? idx.count : pos.count, materialIndex: 0 }];
  for (const gr of groups) {
    if (!/body/i.test(mats[gr.materialIndex]?.name || '') || /head|tools|helmet/i.test(mats[gr.materialIndex].name)) continue;
    for (let i = gr.start; i < gr.start + gr.count; i += 3) {
      const a = vi(i);
      const b = vi(i + 1);
      const c = vi(i + 2);
      if (!(inBox(a) && inBox(b) && inBox(c))) continue;
      for (const v of [b, c]) {
        pos.setXYZ(v, pos.getX(a), pos.getY(a), pos.getZ(a));
        for (const m of g.morphAttributes.position || []) m.setXYZ(v, m.getX(a), m.getY(a), m.getZ(a));
      }
    }
  }
  pos.needsUpdate = true;
}

// Huid: licht dringt een eindje onder de huid en komt rood terug. Benadering: per kleurkanaal
// "omwikkelde" belichting (rood loopt verder door voorbij de schaduwgrens dan blauw).
const SKIN_LIGHTS = THREE.ShaderChunk.lights_physical_pars_fragment.replace(
  'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );',
  `vec3 sssW = vec3( 0.5, 0.2, 0.1 ) * sssMask;
	vec3 sssIrr = saturate( ( vec3( dot( geometryNormal, directLight.direction ) ) + sssW ) / ( 1.0 + sssW ) ) * directLight.color;
	reflectedLight.directDiffuse += sssIrr * BRDF_Lambert( material.diffuseColor );`,
);

// Maakt van een Rocketbox-materiaal levende huid (en bij het hoofd: natte ogen).
// - Huid (gezicht, hals, handen; alleen huidtinten): iets warmer en verzadigder, zachte
//   roodachtige lichtdoorval, matte glans (geen plastic).
// - Ogen: nat en glanzend (lage ruwheid, weerspiegeling van de ruimte en de lampen), oogwit
//   minder fel en iets grijzer, iris donkerder en voller, schaduw van het bovenooglid en in
//   de ooghoeken. Zonder dat oogwit zie je de "dode", starende blik.
function liveSkin(mat, head) {
  mat.defines = { ...(mat.defines || {}), ...(head ? { HUMAN_HEAD: '' } : {}) };
  mat.customProgramCacheKey = () => (head ? 'human-head' : 'human-body') + (mat.defines?.CLOTH_TINT || '');
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aTag;\nvarying vec2 vTag;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTag = aTag;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vTag;\nfloat sssMask = 0.0;\nfloat eyeMask = 0.0;')
      .replace('#include <lights_physical_pars_fragment>', SKIN_LIGHTS)
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
	#ifdef CLOTH_TINT
	{
		// Andere kleur werkkleding: alleen blauwe stof (overall), huid en wit blijven.
		vec3 c0 = diffuseColor.rgb;
		float blue = smoothstep( 0.015, 0.08, c0.b - max( c0.r, c0.g ) );
		float l0 = dot( c0, vec3( 0.2126, 0.7152, 0.0722 ) );
		diffuseColor.rgb = mix( c0, CLOTH_TINT * ( l0 * 3.4 ), blue );
	}
	#endif
	{
		vec3 c = diffuseColor.rgb;
		float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
	#ifdef HUMAN_HEAD
		eyeMask = smoothstep( 0.5, 0.9, vTag.x );
		float zone = 1.0 - eyeMask;
	#else
		float zone = smoothstep( 0.25, 0.75, vTag.y );
	#endif
		// Alleen huidtinten (rood > groen >= blauw, niet bijna zwart): geen mouwen of handschoenen.
		float key = smoothstep( 0.0, 0.035, c.r - c.g ) * smoothstep( -0.012, 0.012, c.g - c.b ) * smoothstep( 0.012, 0.05, l );
		sssMask = zone * key;
	#ifdef HUMAN_HEAD
		vec3 warm = max( mix( vec3( l ), c, 1.06 ), 0.0 ) * vec3( 1.035, 0.99, 0.955 );
	#else
		// De handen in de Rocketbox-texturen zijn bleek roze: iets voller en warmer, iets donkerder.
		vec3 warm = max( mix( vec3( l ), c, 1.22 ), 0.0 ) * vec3( 0.97, 0.88, 0.8 );
	#endif
		diffuseColor.rgb = mix( c, warm, sssMask );
	#ifdef HUMAN_HEAD
		float scl = smoothstep( 0.1, 0.32, l );
		vec3 sclera = mix( vec3( l ), c, 0.45 ) * vec3( 0.76, 0.74, 0.72 );
		vec3 iris = max( mix( vec3( l ), c, 1.45 ), 0.0 ) * 0.62;
		diffuseColor.rgb = mix( diffuseColor.rgb, mix( iris, sclera, scl ), eyeMask );
	#endif
	}`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
	#ifdef HUMAN_HEAD
		roughnessFactor = mix( roughnessFactor, 0.06, eyeMask );
	#else
		roughnessFactor = mix( roughnessFactor, 0.6, sssMask );
	#endif`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
	#ifdef HUMAN_HEAD
		if ( eyeMask > 0.0 ) {
			// Bovenooglid en wimpers werpen schaduw op de bovenkant van de oogbol; de randen
			// (ooghoeken, waar de oogbol wegdraait) zijn donkerder.
			float facing = saturate( dot( normal, normalize( vViewPosition ) ) );
			float occ = 0.6 * smoothstep( -0.05, 0.5, normal.y ) + 0.45 * ( 1.0 - smoothstep( 0.35, 0.85, facing ) );
			diffuseColor.rgb *= 1.0 - eyeMask * min( occ, 0.75 );
		}
	#endif`,
      );
  };
}

export class Human {
  // anims: één animatieset of een lijst sets (de clips worden samengevoegd).
  // Optioneel: bodyCode = andere textuurset voor kleding en handen (bijv. 'm108k': zonder hesje en
  // handschoenen), hideUV = rechthoeken [u0, y0, u1, y1] in textuurcoördinaten (y van boven) waarvan
  // de lichaamsdriehoeken verborgen worden (losse onderdelen zoals een portofoon).
  static async load({ model, code, anims, facial = true, badge = null, bodyCode = null, hideUV = null }) {
    const manager = new THREE.LoadingManager();
    // Texturen uit het FBX-bestand negeren: we zetten zelf PBR-materialen.
    manager.setURLModifier((u) => (/\.tga$/i.test(u) ? 'data:,' : u));
    const [obj, ...sets] = await Promise.all([new FBXLoader(manager).loadAsync(model), ...[].concat(anims).map(loadAnimSet)]);
    return new Human(obj, Object.assign({}, ...sets), { code, facial, badge, bodyCode, hideUV });
  }

  constructor(obj, clips, { code, facial, bodyCode, hideUV }) {
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
          const part = /head/i.test(m.name) ? 'head' : /helmet/i.test(m.name) ? 'helmet' : /tools/i.test(m.name) ? 'tools' : /opacity/i.test(m.name) ? 'opacity' : 'body';
          if (part === 'helmet') return new THREE.MeshBasicMaterial({ visible: false });
          if (part === 'opacity') {
            // Haarplukjes langs de haargrens (modellen "with opacity"): textuur met doorzichtigheid.
            // Alpha-to-coverage geeft met anti-aliasing zachte randen zonder sorteerproblemen.
            return new THREE.MeshStandardMaterial({
              name: m.name,
              map: tex(`${dir}${code}_opacity_color.png`, true),
              alphaTest: 0.4,
              alphaToCoverage: true,
              side: THREE.DoubleSide,
              roughness: 0.7,
              metalness: 0,
              envMapIntensity: 0.5,
            });
          }
          const common = {
            name: m.name,
            map: tex(`${dir}${(part === 'body' && bodyCode) || code}_${part}_color.jpg`, true),
            normalMap: tex(`${dir}${(part === 'body' && bodyCode) || code}_${part}_normal.jpg`, false),
            metalness: 0,
          };
          // Huid: zachte, warme glans aan de randen (sheen) geeft een minder plastic gezicht.
          const mat =
            part === 'head'
              ? new THREE.MeshPhysicalMaterial({
                  ...common,
                  roughness: 0.55,
                  sheen: 0.2,
                  sheenRoughness: 0.8,
                  sheenColor: new THREE.Color(0x9a6252),
                  specularIntensity: 0.55,
                  envMapIntensity: 0.65,
                })
              : new THREE.MeshStandardMaterial({ ...common, roughness: part === 'tools' ? 0.6 : 0.85 });
          mat.normalScale.set(1, -1);
          if (part !== 'tools') liveSkin(mat, part === 'head');
          return mat;
        });
        if (hideUV) hideBodyParts(n, mats, hideUV);
        n.material = Array.isArray(n.material) ? mats : mats[0];
        tagVertices(n);
        if (n.morphTargetDictionary) this._pruneMorphs(n);
        if (!this.mesh || n.morphTargetInfluences) this.mesh = n;
      }
    });

    // Botten.
    const B = (name) => obj.getObjectByName(name);
    this.bones = {
      root: B('Bip01'),
      pelvis: B('Bip01_Pelvis'),
      spine1: B('Bip01_Spine1'),
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
      leg: {
        l: { up: B('Bip01_L_Thigh'), fore: B('Bip01_L_Calf'), foot: B('Bip01_L_Foot') },
        r: { up: B('Bip01_R_Thigh'), fore: B('Bip01_R_Calf'), foot: B('Bip01_R_Foot') },
      },
    };

    // Kijkrichting van hoofd en ogen in rustpose bepalen (model kijkt naar +z).
    this._orient();
    // Alle botten, om de pose uit de animatie elk beeld schoon te kunnen herstellen (zie update).
    this._allBones = [];
    obj.traverse((n) => n.isBone && this._allBones.push(n));
    this._animQ = null;

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
    this.time = Math.random() * 10;
    this.mouth = { open: 0, round: 0, wide: 0, close: 0 };
    this.onStep = null;
    this._lastStepSign = 0;
    this.seatOffset = -0.5;
    this.sitClip = 'sit'; // houding als seat = 1 (bijvoorbeeld 'sitTable': handen op tafel)
    this.torsoFollow = 0; // deel van de kijkrichting dat de romp meedraait (zittend)
    this.upright = false; // hoofd draaien zonder te kantelen (zie _look)
    this.lean = 0; // romp achterover (+) of naar voren (-), in radialen
    this.hips = { pitch: 0, roll: 0 }; // bekken kantelen (zie _hipsBend)
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
    // Levendigheid in rust: elk gezicht net iets anders (scheefte van de mond, hoe ver de
    // oogleden hangen), een ademritme en kleine, korte gezichtsbewegingen.
    this.asym = (Math.random() < 0.5 ? -1 : 1) * (0.4 + Math.random() * 0.6);
    this.lidRest = 0.13 + Math.random() * 0.06;
    this.micro = null;
    this._lipsRest = 0;
    this.microT = 1.5 + Math.random() * 3;
    // Clipgewichten (eigen overgangen met een S-curve in plaats van lineair overvloeien).
    this._w = new Map();
    this._fade = new Map();
    // Lichaam in rust: ademritme (sneller na boosheid of schreeuwen), zuchten, kleine
    // gewichtsverplaatsingen en houdingswisselingen. Elk personage met eigen tempo.
    this.arousal = 0;
    this._breathPh = Math.random() * Math.PI * 2;
    this.breathCycle = 0;
    this._sigh = null;
    this._shift = { roll: sp0(), pitch: sp0(), yaw: sp0(), t: rnd(2, 8), want: [0, 0, 0] };
    this._posture = { lean: sp0(), t: rnd(6, 14), want: 0 };
    this._fidgetLean = sp0();
    // Eigen handelingen (kopje, nek, gezicht …). props: { cup, cutlery, phone } (Object3D's).
    this.props = {};
    this.fidgetOK = true; // het scenario kan ze tijdelijk uitzetten
    this.fidget = null;
    this.fidgetT = rnd(4, 12);
    this.fidgetRate = 1; // hoe vaak (1 = gewoon)
    this._fxHead = { pitch: 0, roll: 0, yaw: 0 };
    // Kijken: hoek-veren voor hoofd en romp, ogen eerst (zie _gaze).
    this._gz = null;
    this._lookWs = sp0();
    // Kleine hoofdbewegingen tijdens het luisteren: elk personage eigen frequenties.
    this._noise = Array.from({ length: 6 }, () => [rnd(0.35, 1.1), rnd(0, 6.3)]);
    this._nod = null;
    this._shake = null;
    this.aimS = { l: sp0(), r: sp0() };
    // Klimmen: voeten (enkels) en handen vast op een punt in de wereld, met IK (zie pinFoot, grip).
    this.feet = { l: { p: null, on: false, w: sp0(), pitch: 0 }, r: { p: null, on: false, w: sp0(), pitch: 0 } };
    this.grips = { l: { p: null, on: false, w: sp0(), ori: null }, r: { p: null, on: false, w: sp0(), ori: null } };
    this._handQ = { l: null, r: null };
    this._yawV = 0;
    this._acc = 0;
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
    this.bones.head.getWorldQuaternion(_q);
    this.headUp = UP.clone().applyQuaternion(_q.invert());
    this.eyeFwdL = this.bones.eyeL ? local(this.bones.eyeL) : null;
    this.eyeFwdR = this.bones.eyeR ? local(this.bones.eyeR) : null;
    // Ruststand van de ogen (recht vooruit in het hoofd). De animaties sturen de ogen niet aan,
    // dus elk beeld beginnen we hier opnieuw; anders stapelt de oogdraaiing zich op.
    if (this.eyeFwdL) this.eyeRest = [this.bones.eyeL.quaternion.clone(), this.bones.eyeR.quaternion.clone()];
    // Lengtes van de arm (voor wijzen).
    this.bones.arm.l.fore.getWorldPosition(_v);
    this.bones.arm.l.up.getWorldPosition(_v2);
    this.upperLen = _v.distanceTo(_v2);
    this.bones.arm.l.hand.getWorldPosition(_v2);
    this.foreLen = _v.distanceTo(_v2);
    // Lengtes en richtingen van de benen (voor voeten op een sport of ligger, zie pinFoot).
    const leg = this.bones.leg.l;
    leg.up.getWorldPosition(_v);
    leg.fore.getWorldPosition(_v2);
    this.thighLen = _v.distanceTo(_v2);
    leg.foot.getWorldPosition(_v);
    this.calfLen = _v.distanceTo(_v2);
    for (const s of ['l', 'r']) {
      const L = this.bones.leg[s];
      L.upAxis = L.fore.position.clone().normalize();
      L.foreAxis = L.foot.position.clone().normalize();
    }
    // Richting van de bovenarm in de lokale ruimte van het bot (naar de onderarm).
    for (const s of ['l', 'r']) {
      const a = this.bones.arm[s];
      a.upAxis = a.fore.position.clone().normalize();
      a.foreAxis = a.hand.position.clone().normalize();
      // Hand: richting van de middelvinger en dwars (wijsvinger min pink), en de vingers in de
      // ruststand (gestrekt), voor een open hand.
      const S = s === 'l' ? 'L' : 'R';
      const f = (n) => a.hand.getObjectByName(`Bip01_${S}_Finger${n}`);
      if (f(2) && f(1) && f(4)) {
        a.handAxis = f(2).position.clone().normalize();
        a.handSide = f(1).position.clone().sub(f(4).position);
        a.handSide.addScaledVector(a.handAxis, -a.handSide.dot(a.handAxis)).normalize();
        a.fingers = [];
        // [bot, ruststand, duim?, kootje (0 = bij de knokkel, 1 = midden, 2 = top)]
        a.hand.traverse((b) => {
          const m = b !== a.hand && /Finger(\d)(\d?)$/.exec(b.name);
          if (m) a.fingers.push([b, b.quaternion.clone(), m[1] === '0', m[2] ? +m[2] : 0]);
        });
        // Afstand pols → knokkels (voor een hand met de handpalm op een vlak, zie grip).
        a.hand.getWorldPosition(_v);
        a.knuckle = f(2).getWorldPosition(_v2).distanceTo(_v);
      }
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
    const w0 = this._w.get(a) || 0;
    const stillRunning = a.isRunning() && w0 > 0.05 && !once;
    if (!stillRunning) {
      a.reset();
      // Begin ergens willekeurig in lange clips, zodat herhaling minder opvalt.
      if (a.getClip().duration > 10) a.time = Math.random() * (a.getClip().duration - 4);
    }
    a.timeScale = timeScale;
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = once;
    a.enabled = true;
    a.play();
    // Overvloeien met een S-curve (zacht beginnen en zacht eindigen) in plaats van lineair.
    for (const [b, w] of this._w) if (b !== a) this._fade.set(b, { from: w, to: 0, t: 0, dur: fade });
    this._fade.set(a, { from: stillRunning ? w0 : 0, to: 1, t: 0, dur: fade });
    if (!this._w.has(a)) this._w.set(a, 0);
    this.current = a;
  }

  // Clipgewichten bijwerken; samen altijd 1 (anders schemert de rustpose erdoor).
  _fades(dt) {
    let sum = 0;
    for (const [a, f] of this._fade) {
      f.t += dt;
      const k = f.dur > 0 ? smoothstep(f.t / f.dur) : 1;
      this._w.set(a, f.from + (f.to - f.from) * k);
      if (k >= 1) {
        this._fade.delete(a);
        if (f.to === 0) {
          a.stop();
          this._w.delete(a);
        }
      }
    }
    for (const w of this._w.values()) sum += w;
    for (const [a, w] of this._w) a.setEffectiveWeight(sum > 1e-4 ? w / sum : a === this.current ? 1 : 0);
  }

  setHands(name) {
    this.handPose = name;
  }

  // Start lipsync voor een regel. clock() geeft seconden sinds de start van het geluid,
  // level() het actuele volume (of null).
  // emo.laugh: [[van, tot], …] stukken waarin de opname lacht.
  speak(track, clock, emo = {}, level = null) {
    this.speech = { track, clock, level, si: 0, bi: 0, wi: 1, laugh: emo.laugh, avert: emo.avert || 0 };
    // Sprekers kijken niet onafgebroken: aan het begin van een zin soms even weg, en bij een
    // excuus of schaamte (emo.avert) vaker en omlaag.
    const av = emo.avert || 0;
    if (!emo.shout && Math.random() < 0.3 + av * 0.6) {
      setTimeout(() => {
        if (this.speech?.track === track) this.avert(0.6 + Math.random() * 0.5 + av * 0.3, av);
      }, 150 + Math.random() * 350);
    }
    this.emoTarget = { shout: 0, smile: 0, worry: 0, sarcasm: 0, ...emo };
    if (emo.shout > 0.5) this.pant = 0;
  }

  stopSpeaking() {
    if (this.speech && (this.emoTarget?.shout || 0) > 0.45) this.pant = 1;
    this.speech = null;
    this.emoTarget = { shout: 0, smile: this.emoTarget?.smile * 0.5 || 0, worry: 0, sarcasm: 0 };
    if (Math.random() < 0.7) this.blink = BLINK;
  }

  // Kleding een andere kleur geven (alleen de blauwe stof), bijv. 'vec3(0.30, 0.40, 0.28)'.
  tintClothes(glslColor) {
    this.root.traverse((n) => {
      if (!n.isMesh) return;
      for (const m of [].concat(n.material)) {
        if (!m.defines || 'HUMAN_HEAD' in m.defines || !m.onBeforeCompile) continue;
        m.defines = { ...m.defines, CLOTH_TINT: glslColor };
        m.needsUpdate = true;
      }
    });
  }

  // Even de blik afwenden (dur s). down 0..1: hoe sterk omlaag (schaamte, nadenken).
  avert(dur = 0.8, down = 0.3) {
    if (this.glanceT > 0) return;
    if (this._canBlink() && Math.random() < 0.5) this.blink = BLINK;
    this.glanceDur = this.glanceT = dur;
    const side = Math.random() < 0.5 ? -1 : 1;
    this.glanceDir.set(side * (0.18 + Math.random() * 0.17) * (1 - down * 0.5), -0.1 - down * 0.22 - Math.random() * 0.06);
  }

  // Non-verbale reactie terwijl de ander praat.
  //  'soften'  : uitademen, schouders zakken, kleine knik
  //  'scoff'   : ogen rollen omhoog, smalende grijns, hoofd schudden
  //  'startle' : even terugdeinzen (verbazing), daarna nog bozer
  react(kind) {
    if (kind === 'soften') {
      // Opgelucht uitademen: zucht, schouders zakken, daarna een kleine knik.
      this.sigh(0.8);
      this.emoTarget = { ...(this.emoTarget || {}), worry: 0.25 };
      setTimeout(() => this.nod(0.8), 1600);
    } else if (kind === 'scoff') {
      this.glanceDur = this.glanceT = 0.8;
      this.glanceDir.set(0.08, 0.32);
      this.emoTarget = { ...(this.emoTarget || {}), sarcasm: 0.9 };
      setTimeout(() => this.shake(), 700);
      setTimeout(() => (this.emoTarget = { ...(this.emoTarget || {}), sarcasm: 0 }), 2200);
    } else if (kind === 'startle') {
      this.surprise = 0.7;
      this.emph = 1;
    } else if (kind === 'recoil') {
      // Geschrokken terugdeinzen: grote ogen, hoofd ruk achterover, knipper.
      this.surprise = 0.9;
      this.emph = 1;
      this._recoilT = 0.9;
      if (this._canBlink()) this.blink = BLINK;
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

  // Zucht: diep in (borst en schouders omhoog, hoofd iets op), even vasthouden, lang uit
  // (schouders zakken onder de rust, hoofd iets omlaag). Duurt ~2,4 s.
  sigh(amp = 1) {
    this._sigh = { t: 0, amp };
    this.inhale(0.75);
  }

  // Kort gebaar met een arm naar een punt (prikken, hakken), daarna terug.
  // strength: hoe ver de arm meegaat (laag = losjes, hoog = echt wijzen).
  // Verloop: aanloop (arm even terug/omhoog, schouder op) → slag (snel, iets voorbij het doel)
  // → vasthouden → ontspannen (langzamer terug). De hand loopt iets achter op de onderarm.
  jab(side, worldPoint, dur = 0.5, strength = 0.55) {
    this.jabs.push({ side, p: worldPoint.clone(), age: 0, dur, strength });
  }

  setAim(side, worldPoint) {
    this.aim[side] = worldPoint ? worldPoint.clone() : null;
  }

  // Voet ('l' of 'r') met de enkel op punt p in de wereld zetten (een sport, ligger of de vloer),
  // of loslaten met null. Het scenario mag p daarna zelf verplaatsen (dezelfde Vector3): zo stapt
  // de voet mee. feet[side].pitch: tenen omlaag (+) of omhoog (−), in radialen (begint op 0).
  // instant: zonder overgang.
  pinFoot(side, p, { instant = false } = {}) {
    const f = this.feet[side];
    if (p) f.p = p;
    f.on = !!p;
    f.pitch = 0;
    if (instant) {
      f.w.x = p ? 1 : 0;
      f.w.v = 0;
    }
  }

  // Hand ('l' of 'r') met de pols op punt p (vasthouden aan een staander, ligger of leuning), of
  // loslaten met null. Net als bij pinFoot mag p meebewegen.
  // ori: functie (vingers, duimkant) die elk beeld beide richtingen van de hand in de wereld invult
  // (zie js/hands.js: de handpalm op een vlak van een staander, leuning of doos).
  // curl: hoe ver de vingers krommen per kootje [knokkel, midden, top] (radialen), thumb: de duim.
  // pole: richting van de elleboog in de assen van het lichaam (standaard opzij, omlaag, iets terug).
  grip(side, p, { instant = false, ori = null, curl = null, thumb = null, pole = null } = {}) {
    const g = this.grips[side];
    if (p) g.p = p;
    g.on = !!p;
    if (ori) g.ori = ori;
    if (curl !== null) g.curl = [].concat(curl);
    if (thumb !== null) g.thumb = thumb;
    if (pole) g.pole = pole;
    if (instant) {
      g.w.x = p ? 1 : 0;
      g.w.v = 0;
      g.c = null;
    }
  }

  // Knikken / nee schudden: zacht in- en uitgezet, steeds net iets anders (amplitude, tempo).
  nod(amp = 1) {
    this._nod = { t: 0, dur: rnd(0.85, 1.1), amp: amp * rnd(0.85, 1.15), n: rnd(1.4, 1.6) };
  }

  shake(amp = 1) {
    this._shake = { t: 0, dur: rnd(1.1, 1.35), amp: amp * rnd(0.85, 1.15), n: rnd(1.9, 2.2) };
  }

  // Terug naar rust (bij opnieuw beginnen): geen handeling, voorwerpen op hun plek, kijken opnieuw.
  resetLife() {
    if (this.fidget?.prop) this._releaseProp(this.fidget);
    this.fidget = null;
    this._fidgetLeanWant = 0;
    this._fidgetLean.x = this._fidgetLean.v = 0;
    for (const o of Object.values(this.props || {})) {
      const h = o?.userData.home;
      if (h) {
        o.position.copy(h.pos);
        o.quaternion.copy(h.quat);
      }
    }
    this.fidgetT = rnd(4, 12);
    this._sigh = null;
    this._nod = this._shake = null;
    this.jabs.length = 0;
    this.arousal = 0;
    this._gz = null;
    this._lookWs.x = this._lookWs.v = 0;
    this.lookW = 0;
    this._yawV = 0;
    this.hips.pitch = this.hips.roll = 0;
    for (const s of ['l', 'r']) {
      this.pinFoot(s, null, { instant: true });
      this.grip(s, null, { instant: true });
      const g = this.grips[s];
      g.curl = g.thumb = g.pole = g.ori = null;
    }
  }

  // Lopende eigen handeling netjes afronden en een tijd geen nieuwe beginnen.
  settle(seconds = 4) {
    if (this.fidget) this.fidget.abort = true;
    this.fidgetT = Math.max(this.fidgetT, seconds);
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
      // Stappen in het tempo van de echte snelheid (ook bij op gang komen en afremmen), anders glijden de voeten.
      const v = Math.max(this.curSpeed || 0, 0.25);
      return [name, THREE.MathUtils.clamp(v / natural, 0.3, 1.5)];
    }
    if (this.turning) return ['walk', 0.55];
    // Wijzen: presentatiegebaar als basis, arm wordt daarna met IK gericht.
    const options = POSE_CLIPS[this.handPose] || POSE_CLIPS.relaxed;
    const name = options.find((n) => this.actions[n]) || 'idle';
    return [name, 1];
  }

  update(dt) {
    // Stilstaande tijd: niets doen. De mixer schrijft dan geen nieuwe pose, en de procedurele
    // lagen zouden zich anders bovenop de vorige stapelen.
    if (!(dt > 0)) return;
    this.time += dt;

    // Lopen.
    let moving = false;
    // Tussenpunten bereikt: meteen door naar het volgende (geen haperend beeld op elke hoek).
    while (this.path.length > 1 && _v.set(this.path[0].x - this.root.position.x, 0, this.path[0].z - this.root.position.z).length() < 0.04) this.path.shift();
    if (this.path.length) {
      const p = this.root.position;
      const target = this.path[0];
      _v.set(target.x - p.x, 0, target.z - p.z);
      const dist = _v.length();
      if (dist < 0.04) {
        this.path.shift();
        moving = this.path.length > 0;
        if (!this.path.length && this._arrive) {
          const r = this._arrive;
          this._arrive = null;
          r();
        }
      } else {
        _v.normalize();
        // Snelheid: zacht op gang komen en afremmen (de versnelling zelf loopt op en af, geen
        // constante versnelling die ineens begint), iets langzamer door een scherpe bocht.
        let remaining = dist;
        for (let i = 1; i < this.path.length; i++) remaining += this.path[i].distanceTo(this.path[i - 1]);
        let vT = Math.min(this.walkSpeed, Math.sqrt(2 * 1.2 * Math.max(0, remaining - 0.03)) + 0.05);
        if (this.path.length > 1 && dist < 0.8) {
          _v2.set(this.path[1].x - target.x, 0, this.path[1].z - target.z).normalize();
          const bend = Math.acos(THREE.MathUtils.clamp(_v.dot(_v2), -1, 1));
          vT = Math.min(vT, this.walkSpeed * (1 - 0.3 * (bend / Math.PI) * (1 - dist / 0.8)));
        }
        const v0 = this.curSpeed || 0;
        const accWant = THREE.MathUtils.clamp((vT - v0) * 3.2, -2.6, 1.7);
        this._acc += (accWant - this._acc) * (1 - Math.exp(-9 * dt));
        this.curSpeed = THREE.MathUtils.clamp(v0 + this._acc * dt, 0.06, this.walkSpeed * 1.05);
        p.addScaledVector(_v, Math.min(dist, this.curSpeed * dt));
        // Naar de looprichting draaien: zacht inzetten en uitlopen, niet met een vaste hoeksnelheid.
        const err = shortAngle(Math.atan2(_v.x, _v.z) - this.root.rotation.y);
        this._yawV += (THREE.MathUtils.clamp(err * 6, -4.5, 4.5) - this._yawV) * (1 - Math.exp(-12 * dt));
        this.root.rotation.y += this._yawV * dt;
        moving = true;
        this.faceYaw = null;
      }
    }
    if (!moving) {
      this.curSpeed = 0;
      this._acc = 0;
      // Op de plek draaien (naar iemand toe, of mee met een blik ver opzij): zacht in- en uitlopen.
      let want = null;
      if (this.faceYaw !== null) want = this.faceYaw;
      else if (this.seat < 0.5 && this._gz && this.lookW > 0.5 && Math.abs(this._gz.desY) > 0.75) {
        want = this.root.rotation.y + Math.sign(this._gz.desY) * (Math.abs(this._gz.desY) - 0.6);
      }
      if (want !== null && !this.lockYaw) {
        const err = shortAngle(want - this.root.rotation.y);
        this._yawV += (THREE.MathUtils.clamp(err * 5, -2.6, 2.6) - this._yawV) * (1 - Math.exp(-8 * dt));
      } else this._yawV *= Math.exp(-12 * dt);
      if (!this.lockYaw) this.root.rotation.y += this._yawV * dt;
      else this._yawV = 0;
    }
    // Voetstappen (geluid) op het ritme van de loopanimatie.
    if (moving && this.onStep && this.current && /walk/.test(this.current.getClip().name)) {
      const ph = this.current.time / this.current.getClip().duration;
      const sgn = Math.sign(Math.sin(ph * Math.PI * 2));
      if (sgn !== this._lastStepSign) this.onStep(this);
      this._lastStepSign = sgn;
    }

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
    this._fades(dt);
    // De mixer schrijft een bot alleen als de animatiewaarde verandert. Blijft die gelijk (twee
    // beelden tussen dezelfde sleutels), dan bleef de procedurele draaiing van het vorige beeld
    // staan en stapelde de nieuwe erbovenop (hoofd/romp schoten een beeld lang door). Daarom eerst
    // de pose uit de animatie van vorig beeld terugzetten.
    if (this._animQ) for (let i = 0; i < this._allBones.length; i++) this._allBones[i].quaternion.copy(this._animQ[i]);
    this.mixer.update(dt);
    if (!this._animQ) this._animQ = this._allBones.map((b) => b.quaternion.clone());
    else for (let i = 0; i < this._allBones.length; i++) this._animQ[i].copy(this._allBones[i].quaternion);
    this._rootMotion();
    this.root.updateMatrixWorld(true);
    this._hipsBend(dt); // bekken kantelen (klimmen)
    this._legs(dt); // voeten op een sport of ligger

    // Procedurele lagen bovenop de animatie.
    this._speechClock(dt);
    this._bodyLife(dt); // adem, zucht, gewicht verplaatsen, houding
    this._beatBody(dt); // nadruk, lachen
    this._gaze(dt); // kijkdoel → hoofd/romp/ogen (romp draait hier al mee)
    this._fidgets(dt); // eigen handelingen plannen
    this._aimArms(dt); // armhouding, gebaren, eigen handelingen, pols die naijlt
    this._lookHead(dt); // nek, hoofd en ogen
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
      if (st >= 0.85 && Math.random() < 0.5) this.blink = BLINK;
      sp.si++;
    }
    while (sp.bi < tr.b.length && tr.b[sp.bi][0] <= t) {
      this.inhale(tr.b[sp.bi][1] * 0.7);
      // Soms kort wegkijken bij een pauze, zoals mensen doen als ze nadenken.
      if (Math.random() < 0.45) {
        if (Math.random() < 0.5 && this._canBlink()) this.blink = BLINK;
        this.glanceDur = this.glanceT = 0.45 + Math.random() * 0.4;
        this.glanceDir.set((Math.random() < 0.5 ? -1 : 1) * (0.25 + Math.random() * 0.2), -0.12 - Math.random() * 0.1);
      }
      sp.bi++;
    }
    // Pauze tussen woorden (> 0,4 s): soms even wegkijken, vaker bij een excuus.
    const w = tr.w;
    if (w) {
      while (sp.wi < w.length && w[sp.wi][0] <= t) {
        if (w[sp.wi][0] - w[sp.wi - 1][1] > 0.4 && Math.random() < 0.35 + sp.avert * 0.4) this.avert(0.6 + Math.random() * 0.6, sp.avert);
        sp.wi++;
      }
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

  // Assen van het lichaam in de wereld: _bx = links, _by = omhoog, _bz = vooruit.
  _bodyAxes() {
    this.root.getWorldQuaternion(_qRoot);
    _bx.set(1, 0, 0).applyQuaternion(_qRoot);
    _bz.set(0, 0, 1).applyQuaternion(_qRoot);
    _by.set(0, 1, 0);
  }

  // Draait een bot in de wereld: eerst om de voorwaartse as (roll), dan zijwaarts (pitch,
  // + = voorover) en om de verticale as (yaw, + = naar links).
  _rotBody(bone, pitch, roll, yaw) {
    if (Math.abs(pitch) + Math.abs(roll) + Math.abs(yaw) < 1e-6) return;
    bone.getWorldQuaternion(_q);
    _q2.setFromAxisAngle(_by, yaw).multiply(_q3.setFromAxisAngle(_bx, pitch)).multiply(_q4.setFromAxisAngle(_bz, roll));
    _q.premultiply(_q2);
    bone.parent.getWorldQuaternion(_q3);
    bone.quaternion.copy(_q3.invert().multiply(_q));
    bone.updateMatrixWorld(true);
  }

  // Schouders optrekken (+) of laten zakken (−), en naar voren (protractie, +).
  _shoulders(raiseL, raiseR, fwdL = 0, fwdR = 0) {
    if (!this.bones.clavL) return;
    for (const [bone, sign, r, f] of [[this.bones.clavL, 1, raiseL, fwdL], [this.bones.clavR, -1, raiseR, fwdR]]) {
      if (Math.abs(r) + Math.abs(f) < 1e-6) continue;
      bone.getWorldQuaternion(_q);
      _q2.setFromAxisAngle(_bz, sign * r).multiply(_q3.setFromAxisAngle(_by, -sign * f));
      _q.premultiply(_q2);
      bone.parent.getWorldQuaternion(_q3);
      bone.quaternion.copy(_q3.invert().multiply(_q));
    }
    this.bones.spine2.updateMatrixWorld(true);
  }

  // Het lichaam leeft ook als het "niets" doet:
  //  - ademen: borst en schouders gaan op en neer; sneller en dieper na boosheid, schreeuwen of
  //    lachen, en pas na een tijd weer rustig. Inademen korter dan uitademen.
  //  - zuchten (sigh): diep in, even vast, lang uit.
  //  - om de 6–15 s het gewicht iets verplaatsen (romp kantelt/draait een fractie), zacht in 1–2 s.
  //  - zittend af en toe een andere houding: iets achterover, of iets meer op de onderarmen.
  _bodyLife(dt) {
    const sp1 = this.bones.spine1;
    const sp2 = this.bones.spine2;
    if (!sp2) return;
    this._bodyAxes();
    const seated = this.seat > 0.5;
    const want = Math.max(this.anger * 0.8, this.emo.shout, this.pant, this.laugh * 0.7, (this.surprise || 0) * 0.8);
    this.arousal += (want - this.arousal) * (1 - Math.exp(-(want > this.arousal ? 1.2 : 0.07) * dt));
    const period = (this._breathBase ||= rnd(4.2, 5.2)) - 2.1 * this.arousal;
    this._breathPh += (dt * Math.PI * 2) / period;
    const u = (this._breathPh / (Math.PI * 2)) % 1;
    const b = u < 0.4 ? smoothstep(u / 0.4) : 1 - smoothstep((u - 0.4) / 0.6);
    const speaking = !!(this.speech || this.talk);
    const amp = (speaking ? 0.35 : 1) * (1 + 0.9 * this.arousal);
    this.breathCycle = b * amp;
    // Zucht.
    let sChest = 0;
    let sShoulder = 0;
    this._sighHead = 0;
    this._sighOut = 0;
    if (this._sigh) {
      const s = this._sigh;
      s.t += dt;
      const up = smoothstep(s.t / 0.9) * (1 - smoothstep((s.t - 1.05) / 1.3));
      const drop = smoothstep((s.t - 1.05) / 1.3) * (1 - smoothstep((s.t - 2.5) / 0.9));
      sChest = (up - drop * 0.35) * s.amp;
      sShoulder = (up - drop * 0.55) * s.amp;
      this._sighHead = (-up + drop * 0.7) * s.amp;
      this._sighOut = drop * (1 - smoothstep((s.t - 1.9) / 0.6)) * s.amp;
      if (s.t > 3.5) this._sigh = null;
    }
    // Gewicht verplaatsen.
    const sh = this._shift;
    sh.t -= dt;
    if (sh.t < 0) {
      sh.t = rnd(6, 15);
      // Steeds naar de andere kant (of het midden), zodat elke verschuiving ook echt iets doet.
      const side = sh.want[0] > 0 ? -1 : 1;
      sh.want = [side * rnd(0.4, 1) * 0.028, rnd(-1, 1) * 0.018, -Math.sign(sh.want[2] || 1) * rnd(0.3, 1) * 0.045];
    }
    const roll = spring(sh.roll, sh.want[0], 2.4, 1, dt);
    const pitch = spring(sh.pitch, sh.want[1], 2.4, 1, dt);
    const yaw = spring(sh.yaw, sh.want[2], 2.4, 1, dt);
    // Houding (zittend).
    const po = this._posture;
    po.t -= dt;
    if (po.t < 0) {
      po.t = rnd(8, 18);
      const r = Math.random();
      po.want = r < 0.4 ? 0 : r < 0.7 ? rnd(0.03, 0.05) : -rnd(0.025, 0.04);
    }
    const lean = spring(po.lean, seated ? po.want : 0, 1.8, 1, dt);
    const fl = spring(this._fidgetLean, this._fidgetLeanWant || 0, 3.2, 1, dt);
    // Romp: verdeeld over twee wervels, zodat het een buiging is en geen knik.
    const P = pitch - lean + fl - 0.016 * b * amp - sChest * 0.035;
    if (sp1) this._rotBody(sp1, P * 0.45, roll * 0.4, yaw * 0.4);
    this._rotBody(sp2, P * 0.55, roll * 0.6, yaw * 0.6);
    // Schouders: ademen en zuchten.
    const sr = 0.028 * b * amp + sShoulder * 0.055;
    this._shoulders(sr, sr);
  }

  // Ritme van het lichaam: op nadruk het hoofd en de romp naar voren, borst die ademt.
  _beatBody(dt) {
    const e = this.emph * this.emph;
    const br = this.breath * 0.6 + this.pant * (0.5 + 0.5 * Math.sin(this.time * 7.5));
    const sp2 = this.bones.spine2;
    if (!sp2) return;
    this._lean += (this.lean - this._lean) * (1 - Math.exp(-2.5 * dt));
    const pitch = (e * 0.06 * (this.emo.shout > 0.3 ? 1.2 : 0.7) + this.laugh * 0.09) * BODY_ACCENT - br * 0.022 - this._lean;
    this._rotBody(sp2, pitch, 0, 0);
    // Lachen (en hijgen): schouders gaan mee omhoog.
    const lr = this.laugh * 0.09 * BODY_ACCENT + br * 0.015;
    if (lr > 1e-3) this._shoulders(lr, lr);
  }

  // ------------------------------------------------------------------
  // Kijken. Zoals bij echte mensen: de ogen springen meteen naar het nieuwe doel, het hoofd volgt
  // 100–200 ms later met een zachte aanloop, schiet een fractie door en veert terug; de romp
  // volgt nog later en alleen een deel. Gerekend in hoeken t.o.v. het lichaam, zodat het hoofd
  // nooit omklapt als het doel (net) achter iemand langs gaat.
  // ------------------------------------------------------------------
  _gaze(dt) {
    let target = null;
    let id = this.lookTarget;
    if (this.lookTarget) target = typeof this.lookTarget === 'function' ? this.lookTarget(_gzT) : _gzT.copy(this.lookTarget);
    else if (this.path.length && this.curSpeed > 0.25) {
      // Lopen zonder doel: kijken waar je heen gaat (een paar meter vooruit, iets omlaag).
      const nx = this.path[0];
      _gzT.set(nx.x - this.root.position.x, 0, nx.z - this.root.position.z);
      if (_gzT.lengthSq() > 1e-4) {
        _gzT.normalize().multiplyScalar(3).add(this.root.position).setY(1.1);
        target = _gzT;
        id = 'walk';
      }
    }
    const fg = this.fidget?.gazeNow;
    if (fg) {
      target = _gzT.copy(fg);
      id = 'fidget';
    }
    this.lookW = THREE.MathUtils.clamp(spring(this._lookWs, target ? (id === 'walk' ? 0.55 : 1) : 0, 4.2, 1, dt), 0, 1);
    if (!target && !this._gz) return;
    this._bodyAxes();
    const N = this.bones.neck.getWorldPosition(_gzN);
    const by = Math.atan2(_bz.x, _bz.z);
    let g = this._gz;
    if (target) {
      const dx = target.x - N.x;
      const dyy = target.y - N.y;
      const dz = target.z - N.z;
      const yawRel = shortAngle(Math.atan2(dx, dz) - by);
      const pitch = Math.atan2(dyy, Math.hypot(dx, dz));
      if (!g || this.lookW < 0.03) {
        // Begin bij waar het hoofd nu (in de animatie) kijkt.
        this.bones.head.getWorldQuaternion(_q);
        _v.copy(this.headFwd).applyQuaternion(_q);
        const hy = shortAngle(Math.atan2(_v.x, _v.z) - by);
        const hp = Math.asin(THREE.MathUtils.clamp(_v.y, -1, 1));
        g = this._gz = { hy: sp0(hy), hp: sp0(hp), ty: sp0(0), ey: hy, ep: hp, desY: yawRel, desP: pitch, holdY: hy, holdP: hp, delay: 0.12, tDelay: 0.3, omega: 6, id, dist: 1.5 };
      }
      let uu = g.desY + shortAngle(yawRel - g.desY);
      if (Math.abs(uu) > Math.PI + 0.5) uu -= Math.sign(uu) * Math.PI * 2;
      const jump = Math.hypot(uu - g.desY, pitch - g.desP);
      if (id !== g.id || jump > 0.1) {
        const amp = Math.hypot(uu - g.hy.x, pitch - g.hp.x);
        if (amp > 0.06) {
          g.holdY = g.desY;
          g.holdP = g.desP;
          g.delay = rnd(0.1, 0.2);
          g.tDelay = g.delay + rnd(0.12, 0.28);
          g.omega = THREE.MathUtils.clamp(9.5 / (1 + 1.25 * amp), 3.0, 9.5);
          // Bij een grote blikwisseling knipperen mensen vaak.
          if (amp > 0.35 && this._canBlink() && Math.random() < 0.7) this.blink = BLINK;
        }
        g.id = id;
      }
      g.desY = uu;
      g.desP = pitch;
      g.dist = Math.max(0.35, Math.hypot(dx, dyy, dz));
    }
    g.delay -= dt;
    g.tDelay -= dt;
    spring(g.hy, g.delay > 0 ? g.holdY : g.desY, g.omega, 0.7, dt);
    spring(g.hp, g.delay > 0 ? g.holdP : g.desP, g.omega, 0.78, dt);
    spring(g.ty, g.tDelay > 0 ? g.holdY : g.desY, g.omega * 0.5, 0.95, dt);
    const ke = 1 - Math.exp(-38 * dt);
    g.ey += (g.desY - g.ey) * ke;
    g.ep += (g.desP - g.ep) * ke;
    // Romp: zittend een deel (torsoFollow), staand een klein beetje.
    const tf = this.torsoFollow || (this.seat < 0.5 ? 0.1 : 0);
    if (tf > 0 && this.lookW > 0.01) {
      const yaw = THREE.MathUtils.clamp(g.ty.x, -0.9, 0.9) * tf * this.lookW;
      this._rotBody(this.bones.spine2, 0, 0, yaw);
    }
  }

  // ------------------------------------------------------------------
  // Eigen handelingen (zelfaanrakingen en kleine bezigheden), op willekeurige momenten en per
  // persoon anders: slokje koffie, nek wrijven, kin in de hand, neus, krabben, mouw goed doen,
  // bestek verleggen, telefoon. Nooit tijdens het keuzemoment, niet tijdens praten, niet als de
  // armen al iets doen (wijzen, dienblad, armen over elkaar) en niet bij boosheid of schrik.
  // ------------------------------------------------------------------
  _fidgetFree() {
    return !LIFE.quiet && this.fidgetOK && !this.speech && !this.talk && !this.path.length && !this.turning && !this.forced &&
      !this.armPose && !this.aim.l && !this.aim.r && !this.jabs.length && this.armPoseW < 0.05;
  }

  _fidgets(dt) {
    const f = this.fidget;
    if (f) {
      if (!this._fidgetFree() || this.anger > 0.6 || (this.surprise || 0) > 0.2) f.abort = true;
      this._runFidget(f, dt);
      return;
    }
    this._fidgetLeanWant = 0;
    this.fidgetT -= dt;
    if (this.fidgetT > 0) return;
    const calm = this.anger < 0.45 && (this.surprise || 0) < 0.08 && this.laugh < 0.1 && !this._sigh && !this._nod && !this._shake;
    if (!this._fidgetFree() || !calm) {
      this.fidgetT = rnd(1, 3);
      return;
    }
    this._startFidget();
    this.fidgetT = rnd(9, 20) / this.fidgetRate;
  }

  // Punt t.o.v. een bot of punt: lx naar links (k = kant), ly omhoog, lz vooruit (lichaamsassen,
  // of van het hoofd als head = true).
  _bp(out, base, lx, ly, lz, head = false) {
    if (head) {
      this.bones.head.getWorldQuaternion(_q);
      _fz.copy(this.headFwd).applyQuaternion(_q).setY(0).normalize();
      _fx.crossVectors(_by, _fz).normalize();
    } else {
      _fz.copy(_bz);
      _fx.copy(_bx);
    }
    return out.copy(base).addScaledVector(_fx, lx).addScaledVector(_by, ly).addScaledVector(_fz, lz);
  }

  _startFidget() {
    const seated = this.seat > 0.5;
    const pr = this.props;
    const opts = [
      ['neck', 1],
      // Kin in de hand alleen als hij ongeveer recht vooruit kijkt (een rustend hoofd draait niet ver).
      ['chin', Math.abs(this._gz?.desY || 0) > 0.35 ? 0 : seated ? 1.2 : 0.6],
      ['nose', 0.7],
      ['scratch', 0.9],
      ['sleeve', 0.8],
    ];
    if (seated && pr.cup && !this.noSip) opts.push(['cup', 3]);
    if (seated && pr.cutlery) opts.push(['cutlery', 1.1]);
    if (seated && pr.phone) opts.push(['phone', 2.4]);
    const list = opts.filter(([k, w]) => k !== this._lastFidget && w > 0);
    let r = Math.random() * list.reduce((a, [, w]) => a + w, 0);
    let kind = list[0][0];
    for (const [k, w] of list) if ((r -= w) <= 0) { kind = k; break; }
    this._lastFidget = kind;
    const f = this._makeFidget(kind);
    if (f) this.fidget = f;
  }

  // Kant van een voorwerp t.o.v. het lichaam ('l' of 'r').
  _sideOf(obj) {
    obj.getWorldPosition(_v);
    this.root.getWorldPosition(_v2);
    this._bodyAxes();
    return _v.sub(_v2).dot(_bx) >= 0 ? 'l' : 'r';
  }

  // Een handeling = reeks stukken: elk stuk beweegt de hand (IK-doel) van het vorige doel naar
  // `to` in `dur` s (minimum-jerk, met een boogje omhoog), daarna `hold` s vasthouden (eventueel
  // met een kleine wrijf- of krabbeweging). Doelen zijn functies: ze bewegen mee met het lichaam.
  _makeFidget(kind) {
    const H = this.bones.head;
    const seated = this.seat > 0.5;
    let side = Math.random() < 0.5 ? 'l' : 'r';
    const k = () => (side === 'l' ? 1 : -1);
    const other = () => this.bones.arm[side === 'l' ? 'r' : 'l'];
    const W = (b, o) => b.getWorldPosition(o);
    const f = { kind, side, t: 0, i: 0, segs: [], pole: null, gaze: null, head: null, prop: null, abort: false };
    const rubAx = (a) => (out) => out.copy(a === 'x' ? _bx : a === 'y' ? _by : _bz);
    if (kind === 'neck') {
      // Nek wrijven: hand achter in de nek aan dezelfde kant, elleboog naar buiten en omhoog.
      f.pole = (o) => o.copy(_bx).multiplyScalar(k()).addScaledVector(_by, -0.25).addScaledVector(_bz, 0.7);
      const p = (o) => this._bp(o, W(this.bones.neck, o), k() * 0.1, 0.07, -0.01);
      // Vingers om de nek heen naar achteren, duim omhoog.
      f.ori = (fo, to) => {
        fo.copy(_bz).multiplyScalar(-0.8).addScaledVector(_bx, -k() * 0.6).addScaledVector(_by, 0.15);
        to.copy(_by);
      };
      f.segs = [
        { to: p, dur: rnd(0.75, 0.95), hold: rnd(1.2, 2.2), arc: 0.06, rub: { ax: rubAx('x'), amp: 0.016, hz: rnd(1.1, 1.5) } },
        { to: null, dur: rnd(0.8, 1.0), arc: 0.03 },
      ];
      f.head = (w) => ({ pitch: 0.07 * w, roll: -k() * 0.035 * w });
    } else if (kind === 'chin') {
      // Kin of wang in de hand (zittend: elleboog op tafel).
      f.pole = (o) => o.copy(_bx).multiplyScalar(k() * 0.6).addScaledVector(_by, -1).addScaledVector(_bz, 0.2);
      const p = (o) => this._bp(o, W(H, o), k() * 0.025, -0.085, 0.14, true);
      // Handpalm naar het gezicht, vingers omhoog (de kin rust op de vingers), duim naar buiten.
      f.ori = (fo, to) => {
        this._bp(fo, _v5.set(0, 0, 0), 0, 1, -0.25, true);
        to.copy(_fx).multiplyScalar(k());
      };
      f.segs = [
        { to: p, dur: rnd(0.7, 0.9), hold: rnd(1.6, 3.4), arc: 0.03, rub: { ax: rubAx('y'), amp: 0.005, hz: 0.4 } },
        { to: null, dur: rnd(0.75, 0.95), arc: 0.02 },
      ];
      f.head = (w) => ({ pitch: 0.025 * w, roll: k() * 0.04 * w });
    } else if (kind === 'nose') {
      // Even langs de neus of de mond wrijven.
      f.pole = (o) => o.copy(_bx).multiplyScalar(k() * 0.5).addScaledVector(_by, -1).addScaledVector(_bz, 0.3);
      const p = (o) => this._bp(o, W(H, o), k() * 0.02, -0.01, 0.16, true);
      f.ori = (fo, to) => {
        this._bp(fo, _v5.set(0, 0, 0), -k() * 0.15, 1, -0.3, true);
        to.copy(_fx).multiplyScalar(k());
      };
      f.segs = [
        { to: p, dur: rnd(0.55, 0.7), hold: rnd(0.5, 0.9), arc: 0.03, rub: { ax: rubAx('y'), amp: 0.009, hz: rnd(2, 2.6) } },
        { to: null, dur: rnd(0.65, 0.8), arc: 0.02 },
      ];
      f.head = (w) => ({ pitch: 0.03 * w, roll: 0 });
    } else if (kind === 'scratch' || kind === 'sleeve') {
      // Onderarm krabben, of de mouw van de andere arm goedtrekken (pols → iets naar de elleboog).
      const at = (u, up) => (o) => {
        const a = other();
        W(a.fore, _v4);
        return W(a.hand, o).lerp(_v4, u).addScaledVector(_by, up).addScaledVector(_bx, k() * 0.07);
      };
      f.pole = (o) => o.copy(_bx).multiplyScalar(k() * 0.7).addScaledVector(_by, -0.8).addScaledVector(_bz, -0.2);
      // Vingers naar de andere arm toe en iets omlaag, duim naar voren.
      f.ori = (fo, to) => {
        fo.copy(_bx).multiplyScalar(-k()).addScaledVector(_by, -0.45);
        to.copy(_bz);
      };
      if (kind === 'scratch') {
        f.segs = [
          { to: at(0.5, 0.05), dur: rnd(0.5, 0.65), hold: rnd(0.7, 1.2), arc: 0.04, rub: { ax: (o) => W(other().hand, o).sub(W(other().fore, _v4)).normalize(), amp: 0.014, hz: rnd(3.2, 4) } },
          { to: null, dur: rnd(0.6, 0.75), arc: 0.03 },
        ];
      } else {
        f.segs = [
          { to: at(0.12, 0.035), dur: rnd(0.55, 0.7), hold: 0.12, arc: 0.04 },
          { to: at(0.32, 0.04), dur: rnd(0.35, 0.45), hold: 0.15, arc: 0.0 },
          { to: null, dur: rnd(0.6, 0.75), arc: 0.03 },
        ];
      }
      f.gaze = Math.random() < 0.55 ? { from: 0, to: 1, pt: at(0.3, 0) } : null;
    } else if (kind === 'cup' || kind === 'phone' || kind === 'cutlery') {
      const prop = kind === 'cup' ? this.props.cup : kind === 'phone' ? this.props.phone : this.props.cutlery;
      side = this._sideOf(prop);
      const home = (prop.userData.home ||= { pos: prop.position.clone(), quat: prop.quaternion.clone() });
      f.prop = { obj: prop, home, held: false, off: new THREE.Vector3(), tilt: 0, slide: null };
      const offW = (o) => o.copy(f.prop.off).applyQuaternion(this.root.getWorldQuaternion(_qR2));
      // Waar de hand het voorwerp pakt: aan de kant naar de persoon toe, iets boven het blad.
      const grip = kind === 'cup' ? 0.045 : 0.012;
      const grab = (o) => {
        prop.parent.localToWorld(o.copy(home.pos));
        this.bones.arm[side].up.getWorldPosition(_v4);
        _v4.sub(o).setY(0).normalize();
        return o.addScaledVector(_v4, kind === 'cup' ? 0.1 : 0.085).addScaledVector(_by, grip);
      };
      f.pole = (o) => o.copy(_bx).multiplyScalar(k() * 0.8).addScaledVector(_by, -1).addScaledVector(_bz, -0.15);
      f.reach = true;
      if (kind === 'cup') {
        // Kopje naar de mond (hoofd iets achterover), slokje, terugzetten op dezelfde plek.
        const mouth = (o) => this._bp(o, W(H, o), 0, -0.045, 0.16, true).sub(offW(_v5));
        f.segs = [
          { to: grab, dur: rnd(0.8, 1.0), hold: 0.15, arc: 0.05, grab: true },
          { to: mouth, dur: rnd(0.85, 1.05), hold: rnd(0.7, 1.2), arc: 0.03, sip: true },
          { to: grab, dur: rnd(0.8, 1.0), hold: 0.12, arc: 0.03, release: true },
          { to: null, dur: rnd(0.65, 0.85), arc: 0.03 },
        ];
        f.head = (w, seg) => ({ pitch: seg === 1 ? -0.09 * w : 0, roll: 0 });
        f.gaze = Math.random() < 0.7 ? { from: 0, to: 0.75, pt: grab } : null;
      } else if (kind === 'phone') {
        // Telefoon pakken, even kijken (duim beweegt), terugleggen.
        const view = (o) => this._bp(o, W(this.bones.neck, o), k() * 0.05, -0.24, 0.3).sub(offW(_v5));
        f.segs = [
          { to: grab, dur: rnd(0.8, 1.0), hold: 0.15, arc: 0.04, grab: true },
          { to: view, dur: rnd(0.8, 1.0), hold: rnd(3, 6), arc: 0.03, view: true, rub: { ax: rubAx('z'), amp: 0.004, hz: 2.8 } },
          { to: grab, dur: rnd(0.8, 1.0), hold: 0.12, arc: 0.03, release: true },
          { to: null, dur: rnd(0.65, 0.85), arc: 0.03 },
        ];
        f.gaze = { from: 0, to: 3, pt: (o) => prop.getWorldPosition(o) };
        f.head = (w, seg) => ({ pitch: seg === 1 ? 0.12 * w : 0, roll: 0 });
      } else {
        // Bestek een stukje verleggen (blijft binnen een paar cm van de beginplek).
        const dest = (o) => {
          grab(o);
          return o.addScaledVector(_bz, f.prop.dz).addScaledVector(_bx, f.prop.dx);
        };
        f.prop.dz = rnd(-0.03, 0.03);
        f.prop.dx = rnd(-0.02, 0.02);
        f.prop.slide = true;
        f.segs = [
          { to: grab, dur: rnd(0.7, 0.9), hold: 0.12, arc: 0.04, grab: true },
          { to: dest, dur: rnd(0.35, 0.5), hold: 0.1, arc: 0.0, release: true },
          { to: null, dur: rnd(0.6, 0.8), arc: 0.03 },
        ];
        f.gaze = Math.random() < 0.6 ? { from: 0, to: 1.2, pt: grab } : null;
      }
    }
    if (!f.segs.length) return null;
    f.from = null; // startpunt van het huidige stuk (wordt bij de start vastgelegd)
    return f;
  }

  // Voortgang van een handeling; berekent het IK-doel (f.target), het gewicht (f.w) en
  // waar hij naar kijkt. Afbreken (abort): de rest sneller en zonder vasthouden.
  _runFidget(f, dt) {
    const speed = f.abort ? 2.5 : 1;
    f.t += dt * speed;
    let seg = f.segs[f.i];
    if (f.abort && seg.hold && f.t > seg.dur) f.t = seg.dur + seg.hold;
    while (seg && f.t >= seg.dur + (seg.hold || 0)) {
      // Stuk klaar: eindpunt wordt het begin van het volgende stuk.
      f.t -= seg.dur + (seg.hold || 0);
      // Pakken/loslaten pas na de IK van dit beeld (zie _aimArms), anders klopt de greep niet.
      if (seg.grab && f.prop) f.pending = 'grab';
      if (seg.release && f.prop) f.pending = 'release';
      f.fromPt = seg.to ? seg.to(new THREE.Vector3()) : null;
      f.fromFn = seg.to;
      f.i++;
      seg = f.segs[f.i];
    }
    if (!seg) {
      if (f.prop?.held) this._releaseProp(f);
      this.fidget = null;
      this._fidgetLeanWant = 0;
      return;
    }
    const last = f.i === f.segs.length - 1;
    const s = Math.min(1, f.t / seg.dur);
    const m = minJerk(s);
    // Van: het vorige doel (live), of bij het eerste stuk de hand zoals de animatie hem zet.
    const A = f.i === 0 ? this.bones.arm[f.side].hand.getWorldPosition(_fa) : f.fromFn ? f.fromFn(_fa) : _fa.copy(f.fromPt);
    const B = seg.to ? seg.to(_fb) : this.bones.arm[f.side].hand.getWorldPosition(_fb);
    f.target = (f.target || new THREE.Vector3()).lerpVectors(A, B, m).addScaledVector(_by, Math.sin(Math.PI * s) * (seg.arc || 0));
    if (seg.rub && f.t > seg.dur) {
      const ht = f.t - seg.dur;
      const env = smoothstep(ht / 0.25) * (1 - smoothstep((ht - seg.hold + 0.25) / 0.25));
      f.target.addScaledVector(seg.rub.ax(_fc), seg.rub.amp * env * Math.sin(ht * seg.rub.hz * Math.PI * 2));
    }
    // Gewicht: opbouwen in het eerste stuk, afbouwen in het laatste.
    f.w = f.i === 0 ? smoothstep(s / 0.55) : last ? 1 - smoothstep((s - 0.35) / 0.65) : 1;
    // Romp iets naar voren als het voorwerp ver weg staat (reiken, terugzetten).
    if (f.reach) {
      const reachSeg = seg.grab || seg.release;
      this.bones.arm[f.side].up.getWorldPosition(_v4);
      const need = reachSeg ? THREE.MathUtils.clamp((_v4.distanceTo(B) - (this.upperLen + this.foreLen) * 0.82) * 1.6, 0, 0.3) : 0;
      this._fidgetLeanWant = need;
    }
    // Kijken (even naar het voorwerp of de arm).
    const tt = f.segs.slice(0, f.i).reduce((a, sg) => a + sg.dur + (sg.hold || 0), 0) + f.t;
    f.gazeNow = f.gaze && !f.abort && tt >= f.gaze.from && tt <= f.gaze.to ? f.gaze.pt(_fg) : null;
    const hw = f.i === 0 ? smoothstep(s) : last ? 1 - smoothstep(s) : 1;
    this._fxHead = f.head ? f.head(hw, f.i) : { pitch: 0, roll: 0 };
    // Kopje kantelen bij het drinken, telefoon met het scherm naar het gezicht.
    if (f.prop) {
      const want = seg.sip ? 0.5 * smoothstep((f.t - seg.dur * 0.6) / (seg.dur * 0.5)) : seg.view ? 1.0 * smoothstep(s) : 0;
      const prev = f.segs[f.i - 1];
      const tilt = want || ((prev?.sip || prev?.view) && !seg.sip ? (prev.sip ? 0.5 : 1.0) * (1 - smoothstep(s / 0.6)) : 0);
      f.prop.tilt = tilt;
    }
  }

  _grabProp(f) {
    const p = f.prop;
    p.held = true;
    p.obj.getWorldPosition(_v);
    this.bones.arm[f.side].hand.getWorldPosition(_v2);
    // Verschil hand → voorwerp, in de assen van het lichaam (blijft goed als hij iets draait).
    this.root.getWorldQuaternion(_qRoot);
    p.off.copy(_v).sub(_v2).applyQuaternion(_q.copy(_qRoot).invert());
    p.q0 = p.obj.quaternion.clone();
  }

  _releaseProp(f) {
    const p = f.prop;
    p.held = false;
    p.tilt = 0;
    if (p.slide) {
      // Bestek: blijft liggen waar het is neergelegd (hoogte en stand van thuis).
      p.obj.position.y = p.home.pos.y;
      p.obj.quaternion.copy(p.home.quat);
    } else {
      // Kopje en telefoon: precies terug op hun plek (verschil is een paar mm).
      p.obj.position.copy(p.home.pos);
      p.obj.quaternion.copy(p.home.quat);
    }
  }

  // Voorwerp in de hand meenemen.
  _carryProp(f) {
    const p = f.prop;
    if (!p?.held) return;
    this.bones.arm[f.side].hand.getWorldPosition(_v);
    this.root.getWorldQuaternion(_qRoot);
    _v.add(_v2.copy(p.off).applyQuaternion(_qRoot));
    if (p.slide) {
      p.obj.parent.localToWorld(_v3.copy(p.home.pos));
      _v.y = _v3.y;
    }
    p.obj.parent.worldToLocal(_v);
    p.obj.position.copy(_v);
    // Kantelen naar het gezicht toe (om de zij-as van het lichaam).
    if (p.tilt) {
      p.obj.parent.getWorldQuaternion(_q3);
      _q.copy(_q3).multiply(p.home.quat);
      this._bodyAxes();
      _q2.setFromAxisAngle(_bx, -p.tilt);
      _q.premultiply(_q2);
      p.obj.quaternion.copy(_q3.invert().multiply(_q));
    } else p.obj.quaternion.copy(p.home.quat);
  }

  // Twee-botten-IK voor een arm: schouder → elleboog → pols naar `T`, elleboog richting `pole`.
  _ik(side, T, pole, w) {
    this._ikChain(this.bones.arm[side], this.upperLen, this.foreLen, T, pole, w);
  }

  // Twee-botten-IK voor een ledemaat { up, fore, upAxis, foreAxis } met lengtes l1 en l2:
  // het eind van `fore` naar `T`, het middelste gewricht (elleboog, knie) richting `pole`.
  _ikChain(a, l1, l2, T, pole, w) {
    const S = a.up.getWorldPosition(_ikS);
    const D = _ikD.copy(T).sub(S);
    const d = THREE.MathUtils.clamp(D.length(), Math.abs(l1 - l2) + 0.03, (l1 + l2) * 0.995);
    D.normalize();
    const x = (l1 * l1 + d * d - l2 * l2) / (2 * d);
    const h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
    const P = _ikP.copy(pole).addScaledVector(D, -pole.dot(D)).normalize();
    const E = _ikE.copy(S).addScaledVector(D, x).addScaledVector(P, h);
    this._pointBone(a.up, a.upAxis, _ikT.copy(E).sub(S).normalize(), w);
    a.up.updateMatrixWorld(true);
    a.fore.getWorldPosition(_ikE);
    const Tc = _ikS.addScaledVector(D, d);
    this._pointBone(a.fore, a.foreAxis, _ikT.copy(Tc).sub(_ikE).normalize(), w);
    a.fore.updateMatrixWorld(true);
  }

  // Bekken kantelen bovenop de animatie (klimmen, afstappen): pitch = heupen buigen (+ = voorover),
  // roll = bekken scheef (+ = linkerheup omlaag). De rug buigt een deel terug, zodat de borst
  // rustiger blijft dan het bekken. Alleen met vastgezette voeten (pinFoot) zinvol: de benen
  // worden daarna met IK opnieuw naar de voeten gezet.
  _hipsBend(dt) {
    const st = (this._hipsS ||= { p: sp0(), r: sp0() });
    const p = spring(st.p, this.hips.pitch, 4.5, 1, dt);
    const r = spring(st.r, this.hips.roll, 4.5, 1, dt);
    if (Math.abs(p) + Math.abs(r) < 1e-4 || !this.bones.pelvis) return;
    this._bodyAxes();
    this._rotBody(this.bones.pelvis, p, r, 0);
    if (this.bones.spine1) this._rotBody(this.bones.spine1, -p * 0.35, -r * 0.75, 0);
  }

  // Voeten op hun punt (pinFoot): heup → knie → enkel met IK, de knie naar voren en iets naar
  // buiten. De voet houdt de stand uit de animatie (plat), eventueel met de tenen omlaag (pitch).
  _legs(dt) {
    let axes = false;
    for (const s of ['l', 'r']) {
      const f = this.feet[s];
      const w = THREE.MathUtils.clamp(spring(f.w, f.on ? 1 : 0, 7, 1, dt), 0, 1);
      if (w < 0.002 || !f.p) continue;
      if (!axes) {
        this._bodyAxes();
        axes = true;
      }
      const L = this.bones.leg[s];
      L.foot.getWorldQuaternion(_qF);
      _ikPole.copy(_bz).addScaledVector(_bx, s === 'l' ? 0.15 : -0.15);
      this._ikChain(L, this.thighLen, this.calfLen, f.p, _ikPole, w);
      if (f.pitch) _qF.premultiply(_q.setFromAxisAngle(_bx, f.pitch));
      L.foot.parent.getWorldQuaternion(_q3);
      L.foot.quaternion.slerp(_q3.invert().multiply(_qF), w);
      L.foot.updateMatrixWorld(true);
    }
  }

  _aimArms(dt) {
    this._bodyAxes();
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
        if (pose[s][2] && a.handAxis) {
          // Open hand in een vaste stand: vingers en duim gestrekt, handpalm gericht.
          const [fing, side] = pose[s][2];
          _f.set(fing[0] * k, fing[1], fing[2]).normalize().applyQuaternion(_qRoot);
          _r.set(side[0] * k, side[1], side[2]).normalize().applyQuaternion(_qRoot);
          this._orientBone(a.hand, a.handAxis, a.handSide, _f, _r, w);
          for (const [b, rest] of a.fingers) b.quaternion.slerp(rest, w);
        }
      }
    }

    // Gebaren: blijvend wijzen (setAim) of een prik/hak (jab) met aanloop, slag, vasthouden en
    // ontspannen. Schouder en bovenrug doen mee; de pols ijlt na (zie onder).
    const G = { l: null, r: null };
    for (const s of ['l', 'r']) {
      let jab = null;
      for (const j of this.jabs) if (j.side === s) jab = j;
      const st = this.aimS[s];
      if (this.aim[s]) {
        (this._lastAim ||= {})[s] = this.aim[s];
        spring(st, 1, 5.5, 0.85, dt);
        G[s] = { p: this.aim[s], w: THREE.MathUtils.clamp(st.x, 0, 1.04) * 0.85, cock: 0, point: false };
      } else if (jab) {
        jab.age += dt;
        const d = jab.dur;
        const ant = THREE.MathUtils.clamp(d * 0.22, 0.08, 0.16);
        // Kort en fel (prikken) of rustig (knop indrukken, wijzen): de slag duurt naar verhouding.
        const stroke = THREE.MathUtils.clamp(d * 0.38, 0.14, 0.4);
        const relax = 0.45 + d * 0.2;
        const t = jab.age;
        let w;
        let cock = 0;
        if (t < ant) {
          cock = smoothstep(t / ant);
          w = 0.15 * cock;
        } else if (t < ant + stroke) {
          const u = (t - ant) / stroke - 1;
          w = 0.15 + 0.85 * (1 + 1.9 * u * u * u + 0.9 * u * u); // even voorbij het doel, dan terug
          cock = 1 - smoothstep(((t - ant) / stroke) * 1.4);
        } else if (t < d) w = 1;
        else w = 1 - minJerk((t - d) / relax);
        if (t > d + relax) {
          this.jabs.splice(this.jabs.indexOf(jab), 1);
          w = 0;
        }
        st.x = w;
        st.v = 0;
        (this._lastAim ||= {})[s] = jab.p;
        G[s] = { p: jab.p, w: w * jab.strength, cock, point: jab.strength > 0.7, raw: w };
      } else {
        spring(st, 0, 3.4, 1, dt);
        if (st.x > 0.005 && this._lastAim?.[s]) G[s] = { p: this._lastAim[s], w: Math.max(0, st.x) * 0.85, cock: 0, point: false };
      }
    }
    // De mocap-praatloops (boos, armen uit) zetten soms een open hand naast het hoofd: dat leest
    // als zwaaien of bellen. Komt de pols boven schouderhoogte zonder dat er een gebaar loopt, dan
    // trekt een zachte IK hem terug naar onder de schouder.
    if (HAND_CAP_POSES.has(this.handPose)) {
      for (const s of ['l', 'r']) {
        // Ook tijdens de aanloop en het ontspannen van een prik (gebaar nog zwak): dan kan de
        // mocap de hand anders voor het eigen gezicht zetten.
        if (G[s] && (this.aim[s] || G[s].w >= 0.3)) continue;
        const a = this.bones.arm[s];
        a.up.getWorldPosition(_v);
        a.hand.getWorldPosition(_v2);
        const over = _v2.y - (_v.y - 0.06);
        const cap = (this._cap ||= { l: { x: 0, v: 0 }, r: { x: 0, v: 0 }, p: { l: new THREE.Vector3(), r: new THREE.Vector3() } });
        spring(cap[s], THREE.MathUtils.clamp(over / 0.12, 0, 1), 9, 1, dt);
        if (cap[s].x > 0.02 && (!G[s] || G[s].w < Math.min(1, cap[s].x) * 0.55)) {
          cap.p[s].copy(_v2);
          cap.p[s].y = _v.y - 0.32;
          G[s] = { p: cap.p[s], w: Math.min(1, cap[s].x) * 0.55, cock: 0, point: false };
        }
      }
    }
    // Bovenrug en schouders doen mee met het gebaar (en de aanloop: eerst iets de andere kant op).
    {
      let yaw = 0;
      let pitch = 0;
      const raise = { l: 0, r: 0 };
      const fwd = { l: 0, r: 0 };
      for (const s of ['l', 'r']) {
        const g = G[s];
        if (!g || g.w < 0.01) continue;
        const k = s === 'l' ? -1 : 1; // rechterarm naar voren: borst draait naar links
        this.bones.arm[s].up.getWorldPosition(_v);
        const high = THREE.MathUtils.clamp((g.p.y - _v.y + 0.25) / 0.5, 0, 1);
        yaw += k * (0.05 * g.w - 0.035 * g.cock);
        pitch += 0.025 * g.w;
        raise[s] += 0.05 * g.w * high + 0.04 * g.cock;
        fwd[s] += 0.07 * g.w - 0.04 * g.cock;
      }
      if (yaw || pitch) this._rotBody(this.bones.spine2, pitch * BODY_ACCENT, 0, yaw * BODY_ACCENT);
      if (raise.l || raise.r || fwd.l || fwd.r) this._shoulders(raise.l, raise.r, fwd.l, fwd.r);
    }
    for (const s of ['l', 'r']) {
      const g = G[s];
      if (!g || g.w < 0.01) continue;
      const a = this.bones.arm[s];
      // Bovenarm richten.
      a.up.getWorldPosition(_v);
      const desired = _v2.copy(g.p).sub(_v).normalize();
      // iets omhoog zodat het een duidelijk wijsgebaar is
      desired.y += 0.08;
      desired.normalize();
      this._pointBone(a.up, a.upAxis, desired, g.w);
      a.up.updateMatrixWorld(true);
      // Onderarm in dezelfde richting (bij echt wijzen bijna gestrekt). In de aanloop iets
      // meer gebogen (hand omhoog/terug), zodat de slag ergens vandaan komt.
      // Wijst het gebaar omlaag (naar iemand die zit), dan nauwelijks aanloop omhoog: anders komt
      // de hand eerst naast of voor het eigen gezicht.
      _v3.copy(desired).addScaledVector(_by, 0.7 * g.cock * (desired.y < -0.15 ? 0.25 : 1)).normalize();
      this._pointBone(a.fore, a.foreAxis, _v3, g.w * (g.point ? 0.95 : 0.6));
      a.fore.updateMatrixWorld(true);
      // Bij echt wijzen de pols recht: de hand in het verlengde van de onderarm, niet omhoog geknikt.
      if (g.point && a.handAxis) {
        a.fore.getWorldQuaternion(_q);
        const kk = smoothstep(g.raw ?? 1);
        this._pointBone(a.hand, a.handAxis, _v2.copy(a.foreAxis).applyQuaternion(_q).normalize(), kk * 0.85);
        // Wijsvinger gestrekt.
        for (const [b, rest] of a.fingers) if (/Finger1\d?$/.test(b.name)) b.quaternion.slerp(rest, kk * 0.9);
      }
    }

    // Eigen handeling: arm met IK naar het doel, schouder iets mee, voorwerp in de hand.
    const f = this.fidget;
    if (f && f.target && f.w > 0.001 && !G[f.side]) {
      const s = f.side;
      const k = s === 'l' ? 1 : -1;
      this._shoulders(s === 'l' ? 0.03 * f.w : 0, s === 'r' ? 0.03 * f.w : 0, s === 'l' ? 0.03 * f.w : 0, s === 'r' ? 0.03 * f.w : 0);
      this._ik(s, f.target, f.pole(_ikPole), f.w);
      if (f.ori && this.bones.arm[s].handAxis) {
        const a = this.bones.arm[s];
        f.ori(_f, _r);
        _f.normalize();
        this._orientBone(a.hand, a.handAxis, a.handSide, _f, _r.normalize(), f.w * 0.8);
      } else if (f.prop?.held || (f.prop && f.i <= 2 && f.w > 0.3)) {
        // Hand om het voorwerp: vingers naar voren en iets naar binnen, duimkant omhoog.
        const a = this.bones.arm[s];
        if (a.handAxis) {
          f.prop.obj.getWorldPosition(_v);
          a.hand.getWorldPosition(_v2);
          _f.copy(_v).sub(_v2).setY(0);
          if (_f.lengthSq() < 1e-6) _f.copy(_bz);
          _f.normalize().addScaledVector(_bx, -k * 0.3).normalize();
          this._orientBone(a.hand, a.handAxis, a.handSide, _f, _r.copy(_by), f.w * 0.6);
        }
      }
      if (f.pending === 'grab') this._grabProp(f);
      else if (f.pending === 'release') this._releaseProp(f);
      f.pending = null;
      this._carryProp(f);
    }

    // Vasthouden (grip): hand met IK op zijn punt, ook als de arm net een gebaar maakte. Boven
    // schouderhoogte gaat de schouder mee omhoog.
    for (const s of ['l', 'r']) {
      const g = this.grips[s];
      const w = THREE.MathUtils.clamp(spring(g.w, g.on ? 1 : 0, 6, 1, dt), 0, 1);
      if (w < 0.002 || !g.p) continue;
      const k = s === 'l' ? 1 : -1;
      this.bones.arm[s].up.getWorldPosition(_v);
      const high = THREE.MathUtils.clamp((g.p.y - _v.y) / 0.45, 0, 1) * w * 0.1;
      if (high > 1e-3) this._shoulders(s === 'l' ? high : 0, s === 'r' ? high : 0);
      const pl = g.pole || [0.7, -1, -0.25];
      this._ik(s, g.p, _ikPole.copy(_bx).multiplyScalar(k * pl[0]).addScaledVector(_by, pl[1]).addScaledVector(_bz, pl[2]), w);
      const a = this.bones.arm[s];
      if (g.ori && a.handAxis) {
        g.ori(_f, _r);
        this._orientBone(a.hand, a.handAxis, a.handSide, _f.normalize(), _r.normalize(), w);
      }
      // Vingers om de staander, ligger, leuning of doos: elk kootje krommer dan in rust. De kromming
      // volgt zacht (vingers sluiten en openen niet in één beeld).
      const want = g.curl || [0.95, 0.95, 0.95];
      g.c = g.c || [want[0], want[1] ?? want[0], want[2] ?? want[0], g.thumb ?? 0.35];
      const kc = 1 - Math.exp(-12 * dt);
      for (let j = 0; j < 3; j++) g.c[j] += ((want[j] ?? want[0]) - g.c[j]) * kc;
      g.c[3] += ((g.thumb ?? 0.35) - g.c[3]) * kc;
      for (const [b, rest, thumb, j] of a.fingers || []) {
        _q.copy(rest).multiply(_q2.setFromAxisAngle(GRIP_AXIS, thumb ? g.c[3] : g.c[j]));
        b.quaternion.slerp(_q, w);
      }
    }

    // Pols ijlt na (overlappende beweging): de stand van de hand volgt de onderarm met ~60 ms
    // vertraging, zodat gebaren uitlopen in plaats van stijf stoppen.
    this.root.getWorldQuaternion(_qRoot);
    _q4.copy(_qRoot).invert();
    const kl = 1 - Math.exp(-16 * dt);
    for (const s of ['l', 'r']) {
      const hand = this.bones.arm[s].hand;
      hand.getWorldQuaternion(_q);
      _q.premultiply(_q4);
      const hq = this._handQ[s];
      // Een hand die iets vasthoudt ijlt niet na: die zit vast aan de staander, leuning of doos.
      if (!hq || hq.angleTo(_q) > 0.8 || (this.grips[s].on && this.grips[s].w.x > 0.6)) {
        this._handQ[s] = hq ? hq.copy(_q) : _q.clone();
        continue;
      }
      hq.slerp(_q, kl);
      _q.copy(_qRoot).multiply(hq);
      hand.parent.getWorldQuaternion(_q3);
      hand.quaternion.copy(_q3.invert().multiply(_q));
      hand.updateMatrixWorld(true);
    }
  }

  // Draait een bot zodat zowel `axis` naar `dir` als (zo goed als kan) `side` naar `sideDir` wijst.
  _orientBone(bone, axis, side, dir, sideDir, w) {
    _v.crossVectors(axis, side);
    _m.makeBasis(axis, side, _v);
    _v2.copy(sideDir).addScaledVector(dir, -sideDir.dot(dir)).normalize();
    _v3.crossVectors(dir, _v2);
    _m2.makeBasis(dir, _v2, _v3);
    // wereldstand = doelbasis × lokale basis⁻¹
    _q2.setFromRotationMatrix(_m2.multiply(_m.transpose()));
    bone.parent.getWorldQuaternion(_q3);
    _q2.premultiply(_q3.invert());
    bone.quaternion.slerp(_q2, w);
    bone.updateMatrixWorld(true);
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

  // Nek, hoofd en ogen naar de punten uit _gaze; daarbovenop knikken, schudden, nadruk, lachen,
  // kleine luisterbewegingen en de eigen handelingen.
  _lookHead(dt) {
    const head = this.bones.head;
    const g = this._gz;
    let t = null;
    let te = null;
    if (g && this.lookW > 0.01) {
      this._bodyAxes();
      const by = Math.atan2(_bz.x, _bz.z);
      const N = this.bones.neck.getWorldPosition(_gzN);
      const dirTo = (out, yaw, pitch) => out.set(Math.sin(by + yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(by + yaw) * Math.cos(pitch)).multiplyScalar(g.dist).add(N);
      t = dirTo(_gzH, g.hy.x, g.hp.x);
      te = dirTo(_gzE, g.ey, g.ep);
    }
    if (t) {
      for (const [bone, fwd, weight, maxAng] of [
        [this.bones.neck, this.headFwd, 0.3, 0.45],
        [head, this.headFwd, 0.6, 0.8],
      ]) {
        bone.updateMatrixWorld(true);
        head.getWorldPosition(_v);
        const desired = _v2.copy(t).sub(_v).normalize();
        // Nooit een ongeldige kijkrichting doorgeven (een NaN blijft anders voor altijd in het bot).
        if (!Number.isFinite(desired.x + desired.y + desired.z)) continue;
        head.getWorldQuaternion(_q);
        const cur = _v3.copy(fwd).applyQuaternion(_q).normalize();
        // Bij een grote hoek draait het hoofd verder mee, zodat de ogen binnen hun grens blijven.
        const share = (d, eyeMax) => (bone === head ? Math.max(weight, 1 - eyeMax / Math.max(Math.abs(d), 1e-3)) : weight);
        if (this.upright) {
          // Zoals een echt hoofd: eerst draaien om de verticale as, dan knikken; niet scheef kantelen.
          const rawYaw = shortAngle(Math.atan2(desired.x, desired.z) - Math.atan2(cur.x, cur.z));
          const rawPitch = Math.asin(THREE.MathUtils.clamp(desired.y, -1, 1)) - Math.asin(THREE.MathUtils.clamp(cur.y, -1, 1));
          const dYaw = THREE.MathUtils.clamp(rawYaw, -maxAng, maxAng) * share(rawYaw, EYE_YAW - 0.05) * this.lookW;
          const dPitch = THREE.MathUtils.clamp(rawPitch, -maxAng * 0.7, maxAng * 0.7) * share(rawPitch, (rawPitch > 0 ? EYE_UP : EYE_DOWN) - 0.03) * this.lookW;
          const side = _v.set(cur.x, 0, cur.z).normalize().cross(UP);
          _q2.setFromAxisAngle(UP, dYaw).multiply(_q3.setFromAxisAngle(side, dPitch));
        } else {
          const raw = cur.angleTo(desired);
          const ang = Math.min(raw, maxAng);
          if (ang < 1e-3) continue;
          const axis = _v.crossVectors(cur, desired).normalize();
          _q2.setFromAxisAngle(axis, ang * share(raw, EYE_YAW - 0.05) * this.lookW);
        }
        bone.getWorldQuaternion(_q);
        const worldNew = _q2.multiply(_q);
        bone.parent.getWorldQuaternion(_q3);
        _q4.copy(bone.quaternion);
        bone.quaternion.copy(_q3.invert().multiply(worldNew));
        if (bone === this.bones.neck && this.bones.clavL) {
          // De sleutelbeenderen hangen aan de nek: hoofd draaien mag de schouders (en de handen
          // op tafel) niet meeslepen. Draaiing van de nek voor de schouders terugdraaien.
          _q2.copy(bone.quaternion).invert().multiply(_q4);
          this.bones.clavL.quaternion.premultiply(_q2);
          this.bones.clavR.quaternion.premultiply(_q2);
        }
      }
    }
    // Knikken en nee schudden, plus kleine praatbewegingen.
    let pitch = 0;
    let yaw = 0;
    let roll = 0;
    if (this._nod) {
      const n = this._nod;
      n.t += dt;
      const u = n.t / n.dur;
      const env = smoothstep(u / 0.2) * (1 - smoothstep((u - 0.55) / 0.45));
      pitch += Math.sin(u * n.n * Math.PI * 2) * 0.08 * n.amp * env;
      if (u >= 1) this._nod = null;
    }
    if (this._shake) {
      const n = this._shake;
      n.t += dt;
      const u = n.t / n.dur;
      const env = smoothstep(u / 0.18) * (1 - smoothstep((u - 0.5) / 0.5));
      yaw += Math.sin(u * n.n * Math.PI * 2) * 0.1 * n.amp * env;
      if (u >= 1) this._shake = null;
    }
    // Op nadruk: korte knik naar voren/omlaag (boos) of omhoog (rustig).
    pitch += this.emph * this.emph * (this.anger > 0.4 ? 0.07 : -0.04) * BODY_ACCENT;
    if (this.speech) pitch += this.jaw * 0.025;
    // Lachen: hoofd iets achterover en meeschokken; verdriet: hoofd iets omlaag.
    pitch += -this.laughMood * 0.09 * BODY_ACCENT - this.laugh * 0.03 + this.emo.sad * 0.07;
    // Terugdeinzen (react('recoil')): hoofd ruk 6-8° achterover, dan langzaam terug.
    if (this._recoilT > 0) {
      this._recoilT = Math.max(0, this._recoilT - dt);
      const u = 1 - this._recoilT / 0.9;
      pitch -= (u < 0.15 ? u / 0.15 : 1 - smoothstep((u - 0.15) / 0.85)) * 0.13;
    }
    // Zucht: hoofd iets op bij het inademen, iets omlaag bij het uitademen.
    pitch += (this._sighHead || 0) * 0.045;
    // Luisteren: het hoofd staat nooit stil (heel kleine, trage bewegingen en een lichte kanteling).
    if (!this.speech && !this.talk && this.lookW > 0.3) {
      const z = this._noise;
      const tt = this.time;
      const k = this.lookW * (this.anger > 0.6 ? 0.5 : 1);
      yaw += (0.012 * Math.sin(tt * z[0][0] + z[0][1]) + 0.006 * Math.sin(tt * z[1][0] * 2.3 + z[1][1])) * k;
      pitch += (0.009 * Math.sin(tt * z[2][0] + z[2][1]) + 0.005 * Math.sin(tt * z[3][0] * 2.1 + z[3][1])) * k;
      roll += (0.014 * Math.sin(tt * z[4][0] * 0.7 + z[4][1]) + 0.005 * Math.sin(tt * z[5][0] * 1.9 + z[5][1])) * k;
    }
    // Eigen handeling (slokje: hoofd iets achterover; nek wrijven: hoofd iets voorover).
    if (this.fidget) {
      pitch += this._fxHead.pitch || 0;
      roll += this._fxHead.roll || 0;
    }
    // Kort wegkijken (nadenken): hoofd draait een beetje mee.
    let gx = 0;
    let gy = 0;
    if (this.glanceT > 0) {
      this.glanceT -= dt;
      const k = Math.max(0, Math.min(1, this.glanceT * 4, ((this.glanceDur || 0.9) - this.glanceT) * 6 + 0.2));
      gx = this.glanceDir.x * k;
      gy = this.glanceDir.y * k;
      yaw += gx * 0.35;
      pitch -= gy * 0.3;
    }
    if (pitch || yaw || roll) {
      // Rond de verticale, zijwaartse en voorwaartse as van het lichaam draaien.
      this._bodyAxes();
      head.getWorldQuaternion(_q);
      _q2.setFromAxisAngle(_by, yaw).multiply(_q3.setFromAxisAngle(_bx, pitch)).multiply(_q4.setFromAxisAngle(_bz, roll));
      const worldNew = _q2.multiply(_q);
      head.parent.getWorldQuaternion(_q3);
      head.quaternion.copy(_q3.invert().multiply(worldNew));
    }
    head.updateMatrixWorld(true);
    // Oogsprongetjes: tussen de ogen en soms de mond van wie hij aankijkt, minder als hij boos staart.
    this.saccT -= dt;
    if (this.saccT < 0) {
      const stare = this.anger > 0.6 && !this.speech;
      const dist = g ? g.dist : 1.5;
      const sc = THREE.MathUtils.clamp(1.3 / dist, 0.4, 1.4) * (stare ? 0.4 : 1);
      const r = Math.random();
      const [x, y] = r < 0.42 ? [-0.02, 0.004] : r < 0.84 ? [0.02, 0.004] : [0, -0.032];
      this.saccTarget.set((x + rnd(-0.006, 0.006)) * sc, (y + rnd(-0.004, 0.004)) * sc);
      this.saccT = stare ? rnd(0.6, 2.6) : rnd(0.3, 1.6);
    }
    this.sacc.lerp(this.saccTarget, 1 - Math.exp(-40 * dt));
    // Ogen maken oogcontact, gemeten vanuit de kijkrichting van het hoofd (vooruit, omhoog, opzij).
    this._eyePitch = 0;
    if (!this.eyeRest) return;
    head.getWorldQuaternion(_q);
    const F = _f.copy(this.headFwd).applyQuaternion(_q).normalize();
    const U = _u.copy(this.headUp).applyQuaternion(_q);
    U.addScaledVector(F, -U.dot(F)).normalize();
    const R = _r.crossVectors(U, F);
    const eyes = [[this.bones.eyeL, this.eyeFwdL], [this.bones.eyeR, this.eyeFwdR]];
    for (let i = 0; i < 2; i++) {
      const [eye, fwd] = eyes[i];
      eye.quaternion.copy(this.eyeRest[i]);
      if (!te || this.lookW < 0.01) continue;
      eye.updateMatrixWorld(true);
      eye.getWorldPosition(_v);
      const desired = _v2.copy(te).sub(_v).normalize();
      // Oogsprongetjes en wegkijken bovenop het doel.
      const right = _v3.crossVectors(desired, UP).normalize();
      desired.addScaledVector(right, this.sacc.x + gx).addScaledVector(UP, this.sacc.y + gy).normalize();
      // Draaien binnen de oogkas, apart begrensd opzij en omhoog/omlaag.
      const yaw = THREE.MathUtils.clamp(Math.atan2(desired.dot(R), desired.dot(F)), -EYE_YAW, EYE_YAW) * this.lookW;
      const pitch = THREE.MathUtils.clamp(Math.asin(THREE.MathUtils.clamp(desired.dot(U), -1, 1)), -EYE_DOWN, EYE_UP) * this.lookW;
      this._eyePitch = pitch;
      const dir = _v2.copy(F).multiplyScalar(Math.cos(pitch) * Math.cos(yaw))
        .addScaledVector(R, Math.cos(pitch) * Math.sin(yaw))
        .addScaledVector(U, Math.sin(pitch));
      eye.getWorldQuaternion(_q);
      const cur = _v3.copy(fwd).applyQuaternion(_q).normalize();
      _q2.setFromUnitVectors(cur, dir);
      const worldNew = _q2.multiply(_q);
      eye.parent.getWorldQuaternion(_q3);
      eye.quaternion.copy(_q3.invert().multiply(worldNew));
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
    // Lachgezicht: de lach wint van de mondstanden (anders wordt "haha" een ronde O = gapen).
    const LMk = THREE.MathUtils.smoothstep(this.laughMood * EXPRESSION_LAUGH, 0.12, 0.42);
    for (const name of VIS) {
      let target = (want[name] || 0) * (1 - 0.6 * LMk * (name === 'PP' ? 0 : 1));
      if (name === 'aa' || name === 'E' || name === 'O') target *= vowelGain;
      if (name === 'O' || name === 'U') target *= 1 - 0.5 * LMk;
      const cur = this.vis[name] || 0;
      const rate = target > cur ? 38 : 22;
      this.vis[name] = cur + (target - cur) * (1 - Math.exp(-rate * dt));
      set(name, this.vis[name]);
    }
    const vs = this.vis;
    // Kaak: opening van de klinker × volume; dicht bij p/b/m.
    const openness = (vs.aa || 0) * 0.55 + (vs.O || 0) * 0.38 + (vs.E || 0) * 0.3 + (vs.I || 0) * 0.14 + (vs.U || 0) * 0.16 + (vs.RR || 0) * 0.12 + (vs.kk || 0) * 0.12;
    const jawT = speaking ? openness * (0.6 + 0.45 * Math.min(1, loud)) * (1 + E.shout * 0.2) * (1 - (vs.PP || 0) * 0.9) : 0;
    const breathOpen = this.breath * 0.18 + this.pant * (0.12 + 0.06 * Math.sin(this.time * 7.5)) + (this._sighOut || 0) * 0.16;
    // Lachen opent de kaak op elke lachstoot.
    const LA = this.laugh * EXPRESSION_LAUGH;
    const LM = this.laughMood * EXPRESSION_LAUGH;
    this.jaw += (Math.max(jawT, LA * 0.45) + breathOpen - this.jaw) * (1 - Math.exp(-30 * dt));
    // Bij lachen gaat de kaak niet wijd open (dat is gapen): hooguit 0,35.
    set('jawOpen', Math.min(this.jaw, 1 - 0.65 * LMk) + SUR * 0.3);
    set('mouthClose', (vs.PP || 0) * 0.35);
    set('lipsPart', speaking ? 0.12 + breathOpen : breathOpen * 1.2 + this._lipsRest);

    // ---- Levendigheid: spiertonus in rust, adem, micro-uitdrukkingen ----
    const L = this._life(dt, speaking, A);
    const sm = THREE.MathUtils.lerp(1 - roundnessOf(vs) * 0.7, 1, LMk);

    // ---- Emotie, ook tijdens het praten ----
    const shoutNow = E.shout * (speaking ? 0.6 + 0.4 * Math.min(1, loud) : 0.35) * EXPRESSION;
    const angryEmph = A > 0.25 ? emph : 0;
    const calmEmph = A <= 0.25 ? emph : 0;
    set('browDownL', A * 0.85 + angryEmph * 0.3 + L.browDown);
    set('browDownR', A * 0.85 + angryEmph * 0.3 + L.browDown);
    set('browLower', A * 0.55 + angryEmph * 0.25);
    const SAD = E.sad * EXPRESSION;
    set('browInnerUp', Math.max(0, 0.25 - A) * 0.5 + E.worry * 0.7 + calmEmph * 0.45 + SUR * 0.8 + SAD * 0.9 + LM * 0.15 + L.browIn);
    set('browOuterUpL', calmEmph * 0.5 + E.sarcasm * 0.25 + SUR * 0.7 + L.browL);
    set('browOuterUpR', calmEmph * 0.5 + SUR * 0.7 + L.browR);
    set('sneerL', A * 0.3 + shoutNow * 0.25 + L.nose);
    set('sneerR', A * 0.3 + shoutNow * 0.25 + L.nose);
    // Lachen: ogen samengeknepen en wangen omhoog (de 'Duchenne'-lach), tanden zichtbaar.
    set('squintL', A * 0.32 + angryEmph * 0.2 + LM * 0.55 + L.squint);
    set('squintR', A * 0.32 + angryEmph * 0.2 + LM * 0.55 + L.squint);
    set('cheekSquintL', shoutNow * 0.3 + E.smile * 0.4 + LM * 0.9 + L.cheekL);
    set('cheekSquintR', shoutNow * 0.3 + E.smile * 0.4 + LM * 0.9 + L.cheekR);
    // Tanden ontbloten bij schreeuwen, gespannen lippen als hij zwijgt.
    const vowelOpen = (vs.aa || 0) + (vs.E || 0) + (vs.I || 0);
    set('upperUpL', A * 0.18 * vowelOpen + shoutNow * 0.45 + LM * 0.25);
    set('upperUpR', A * 0.18 * vowelOpen + shoutNow * 0.45 + LM * 0.25);
    set('lipRaiser', shoutNow * 0.25);
    set('stretchL', shoutNow * 0.35 * Math.min(1, vowelOpen + 0.3));
    set('stretchR', shoutNow * 0.35 * Math.min(1, vowelOpen + 0.3));
    set('frownL', A * 0.45 * (speaking ? 0.6 : 1) + SAD * 0.55);
    set('frownR', A * 0.45 * (speaking ? 0.6 : 1) + SAD * 0.55);
    set('pressL', ((A * 0.3 + SAD * 0.3) * (speaking ? 0 : 1) + L.press) * (1 - breathOpen * 3));
    set('pressR', ((A * 0.3 + SAD * 0.3) * (speaking ? 0 : 1) + L.press) * (1 - breathOpen * 3));
    set('smileL', (E.smile + E.sarcasm * 0.35 + L.smileL) * sm + (this.smile || 0) + LM * 0.8);
    set('smileR', (E.smile + L.smileR) * sm + (this.smile || 0) + LM * 0.8);
    set('wideL', angryEmph * 0.35 * (A > 0.7 ? 1 : 0.5) + SUR * 0.9 + L.wide);
    set('wideR', angryEmph * 0.35 * (A > 0.7 ? 1 : 0.5) + SUR * 0.9 + L.wide);

    // ---- Knipperen ----
    // Elke 2 à 6 s, vaker bij praten en spanning; soms twee keer kort na elkaar. Snel dicht,
    // rustiger open. De oogleden hangen in rust iets (minder oogwit boven de iris) en
    // volgen de blik: omlaag kijken laat het bovenooglid zakken.
    this.blinkT -= dt;
    if (this.blinkT < 0) {
      this.blink = BLINK;
      const busy = speaking || A > 0.5;
      this.blinkT = Math.random() < 0.14 ? BLINK + 0.12 : (busy ? 1.4 : 2.2) + Math.random() * (busy ? 2.6 : 3.8);
    }
    if (this.blink > (this._blinkPrev || 0)) {
      this._blinkDur = this.blink;
      this._blinkAt = this.time;
    }
    this.blink = Math.max(0, this.blink - dt);
    this._blinkPrev = this.blink;
    const u = this.blink > 0 ? 1 - this.blink / (this._blinkDur || BLINK) : 1;
    const b = this.blink > 0 ? (u < 0.35 ? THREE.MathUtils.smoothstep(u, 0, 0.35) : 1 - THREE.MathUtils.smoothstep(u, 0.35, 1)) : 0;
    const pitch = this._eyePitch || 0;
    // Rusthouding van de oogleden; weg bij schrik/opengesperde ogen, verder dicht bij omlaag kijken.
    const lid = THREE.MathUtils.clamp(
      (this.lidRest + L.lid) * (1 - Math.min(1, SUR * 2 + angryEmph)) + Math.max(0, -pitch) * 1.1 - Math.max(0, pitch) * 0.3,
      0,
      0.55,
    );
    set('blinkL', lid + (1 - lid) * b);
    set('blinkR', lid + (1 - lid) * Math.min(1, b * 1.04));
  }

  // Extra knipper (bij wegkijken) alleen als hij niet net al knipperde.
  _canBlink() {
    return this.blink <= 0 && this.time - (this._blinkAt ?? -9) > 0.9;
  }

  // Levendigheid in rust: wat een gezicht doet als het "niets" doet.
  //  - spiertonus: mondhoeken net iets omhoog (scheef), lippen licht op elkaar of net open
  //  - adem: neusvleugels en lippen bewegen licht mee
  //  - om de paar seconden een korte micro-uitdrukking (wenkbrauw op, mondhoek, lippen op
  //    elkaar, ogen iets samenknijpen), passend bij de stemming; bij luisteren vaker de wenkbrauwen
  _life(dt, speaking, A) {
    const X = EXPRESSION;
    // Zelfde ademritme als borst en schouders (zie _bodyLife).
    const breath = Math.min(1, this.breathCycle);
    this.microT -= dt;
    if (this.microT < 0 && !this.micro) {
      const E = this.emo;
      const opts = [
        ['brow', speaking ? 1.6 : this.lookTarget ? 1.4 : 0.6],
        ['smirk', 0.6 + E.smile * 2 + E.sarcasm * 2 - A],
        ['press', 0.6 + A + E.worry + E.sad],
        ['squint', 0.6 + E.smile],
        ['frownBrow', 0.3 + A + E.worry],
        ['nose', 0.25],
      ].filter(([, w]) => w > 0);
      let r = Math.random() * opts.reduce((a, [, w]) => a + w, 0);
      let kind = opts[0][0];
      for (const [k, w] of opts) if ((r -= w) <= 0) { kind = k; break; }
      this.micro = { kind, t: 0, dur: 0.7 + Math.random() * 0.9, amp: 0.6 + Math.random() * 0.4, side: Math.random() < 0.5 ? -1 : 1 };
      this.microT = (speaking ? 1.6 : 2.5) + Math.random() * 4;
    }
    let k = 0;
    const m = this.micro;
    if (m) {
      m.t += dt;
      const x = m.t / m.dur;
      k = THREE.MathUtils.smoothstep(x, 0, 0.25) * (1 - THREE.MathUtils.smoothstep(x, 0.55, 1)) * m.amp * X;
      if (x >= 1) this.micro = null;
    }
    const is = (n) => (m && m.kind === n ? k : 0);
    const one = (n, s) => (m && m.kind === n && m.side === s ? k : 0);
    // Rustende mond: niet helemaal slap. Scheef glimlachje, kleiner bij boosheid of verdriet.
    const tone = 0.07 * X * Math.max(0, 1 - A * 1.5 - this.emo.sad * 1.5);
    const s = this.asym;
    this._lipsRest = speaking ? 0 : 0.03 + 0.03 * breath;
    return {
      smileL: tone * (1 + 0.45 * s) + one('smirk', 1) * 0.28 + is('squint') * 0.05,
      smileR: tone * (1 - 0.45 * s) + one('smirk', -1) * 0.28 + is('squint') * 0.05,
      cheekL: one('smirk', 1) * 0.12 + is('squint') * 0.18,
      cheekR: one('smirk', -1) * 0.12 + is('squint') * 0.18,
      press: (speaking ? 0 : 0.05 * X) + is('press') * 0.3,
      browIn: is('brow') * 0.18,
      browL: is('brow') * (0.3 + 0.1 * (m ? m.side : 0)),
      browR: is('brow') * (0.3 - 0.1 * (m ? m.side : 0)),
      browDown: is('frownBrow') * 0.22 + is('press') * 0.06,
      squint: 0.06 * X + is('squint') * 0.2,
      nose: breath * 0.035 * X + is('nose') * 0.12,
      wide: is('brow') * 0.06,
      lid: -is('brow') * 0.06 + is('squint') * 0.05,
    };
  }
}

// Ronding van de lippen (o, oe): dan geen glimlach.
function roundnessOf(vs) {
  return (vs.O || 0) + (vs.U || 0);
}

// Vaste armhoudingen in de ruimte van het lichaam (x = links, y = omhoog, z = vooruit),
// voor de linkerarm; de rechterarm is gespiegeld. [richting bovenarm, richting onderarm]
const ARM_POSES = {
  // Dienblad dragen: ellebogen langs het lijf, onderarmen naar voren.
  tray: { l: [[0.16, -1, 0.22], [-0.2, 0.05, 1]], r: [[0.16, -1, 0.22], [-0.2, 0.05, 1]] },
  // Armen over elkaar: onderarmen gekruist voor de borst (links iets hoger).
  crossed: { l: [[0.3, -1, 0.42], [-1, 0.22, 0.32]], r: [[0.3, -1, 0.38], [-1, 0.08, 0.42]] },
  // Sussen: open handen voor de borst omhoog, handpalmen naar voren ("ho, rustig").
  // Derde element: [richting vingers, richting duimkant] van de hand.
  calm: {
    l: [[0.4, -0.75, 0.5], [-0.1, 0.8, 0.6], [[0, 1, 0.2], [-1, 0, 0.1]]],
    r: [[0.4, -0.75, 0.5], [-0.1, 0.8, 0.6], [[0, 1, 0.2], [-1, 0, 0.1]]],
  },
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
