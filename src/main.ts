import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import "./style.css";

type EnemyType = "grunt" | "rusher" | "heavy";
type Enemy = { type: EnemyType; maxHp: number; mesh: THREE.Group; hp: number; speed: number; attackAt: number; alive: boolean; state: "advance" | "flank" | "engage"; strafeDir: number; marker: THREE.Mesh; leftLeg: THREE.Group; rightLeg: THREE.Group; leftArm: THREE.Group; rightArm: THREE.Group; gait: number; mixer?: THREE.AnimationMixer; }
type Weapon = { id: number; name: string; meta: string; damage: number; interval: number; magazine: number; ammo: number; reserve: number; reloadMs: number; automatic: boolean; pellets?: number; spread?: number };
const weapons: Weapon[] = [
  { id: 1, name: "STRIKER AR", meta: "5.56 × 45 MM  •  AUTO", damage: 34, interval: 105, magazine: 30, ammo: 30, reserve: 180, reloadMs: 1350, automatic: true, spread: .003 },
  { id: 2, name: "VANGUARD DMR", meta: "7.62 × 51 MM  •  SEMI", damage: 82, interval: 420, magazine: 12, ammo: 12, reserve: 72, reloadMs: 1650, automatic: false, spread: .001 },
  { id: 3, name: "SIDEKICK 9", meta: "9 × 19 MM  •  SEMI", damage: 24, interval: 180, magazine: 17, ammo: 17, reserve: 102, reloadMs: 1050, automatic: false, spread: .004 },
  { id: 4, name: "BREACH-12", meta: "12 GAUGE  •  PUMP ACTION", damage: 19, interval: 760, magazine: 8, ammo: 8, reserve: 48, reloadMs: 1900, automatic: false, pellets: 8, spread: .035 },
  { id: 5, name: "VOLT SMG", meta: "4.6 × 30 MM  •  AUTO", damage: 22, interval: 67, magazine: 40, ammo: 40, reserve: 200, reloadMs: 1250, automatic: true, spread: .006 }
];
let activeWeapon = 0;
let audioContext: AudioContext | null = null;
const canvas = document.querySelector<HTMLCanvasElement>("#game-canvas")!;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8a9699);
scene.fog = new THREE.Fog(0x8a9699, 32, 115);

type MapTheme = "urban" | "arctic" | "desert";
let selectedMap: MapTheme = "urban";
const mapSources: Record<MapTheme, { label: string; url: string }> = {
  urban: { label: "HILL TOWN // URBAN", url: "https://cdn.3dassets.dev/assets/27595/v1/model.glb" },
  arctic: { label: "ARCTIC STATION", url: "https://cdn.3dassets.dev/assets/28553/v1/model.glb" },
  desert: { label: "DESERT CANYON", url: "https://cdn.3dassets.dev/assets/21034/v1/model.glb" }
};
const mapLoader = new GLTFLoader();
const mapRoots: Partial<Record<MapTheme, THREE.Group>> = {};
const activeMapMeshes: THREE.Mesh[] = [];
let activeMapBounds: THREE.Box3[] = [];
let collisionBounds: THREE.Box3[] = [];
let activeWorldBounds: THREE.Box3 | null = null;
const mapLoading = new Set<MapTheme>();
function refreshActiveMapCollision(theme: MapTheme) {
  activeMapMeshes.length = 0;
  activeMapBounds = [];
  const root = mapRoots[theme];
  if (!root) {
    activeWorldBounds = null;
    collisionBounds = collisionMeshes.map(mesh => new THREE.Box3().setFromObject(mesh));
    return;
  }
  root.updateMatrixWorld(true);
  activeWorldBounds = new THREE.Box3().setFromObject(root);
  root.traverse(node => {
    if (!(node instanceof THREE.Mesh) || !node.geometry) return;
    activeMapMeshes.push(node);
    const bounds = new THREE.Box3().setFromObject(node);
    const size = bounds.getSize(new THREE.Vector3());
    const overlapsPlayer = bounds.max.y > .45 && bounds.min.y < 1.85;
    const footprint = Math.max(size.x, size.z);
    // Ignore walkable ground, terrain slabs and giant merged walls.
    if (overlapsPlayer && size.y > .7 && size.y < 16 && footprint < 18) activeMapBounds.push(bounds);
  });
  collisionBounds = activeMapBounds;
}
function loadCombatMap(theme: MapTheme) {
  const existing = mapRoots[theme];
  if (existing) {
    Object.entries(mapRoots).forEach(([key, root]) => { if (root) root.visible = key === theme; });
    return;
  }
  if (mapLoading.has(theme)) return;
  mapLoading.add(theme);
  mapLoader.load(mapSources[theme].url, gltf => {
    const root = new THREE.Group();
    root.name = `combat-map-${theme}`;
    const model = gltf.scene;
    model.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3());
    const maxDimension = Math.max(size.x, size.y, size.z);
    if (!Number.isFinite(maxDimension) || maxDimension <= 0) {
      mapLoading.delete(theme);
      console.warn(`Invalid ${theme} map bounds; keeping procedural fallback.`);
      return;
    }
    const horizontalFootprint = Math.max(size.x, size.z);
    // Normalize each authored map to a consistent playable footprint.
    const scale = THREE.MathUtils.clamp(82 / Math.max(horizontalFootprint, 0.001), 0.01, 3.0);
    model.scale.setScalar(scale);
    model.updateMatrixWorld(true);
    const fitted = new THREE.Box3().setFromObject(model);
    const center = fitted.getCenter(new THREE.Vector3());
    model.position.x -= center.x;
    model.position.z -= center.z;
    model.position.y -= fitted.min.y;
    model.traverse(node => {
      if (node instanceof THREE.Mesh) {
        node.castShadow = true;
        node.receiveShadow = true;
        node.frustumCulled = true;
      }
    });
    root.add(model);
    root.visible = theme === selectedMap;
    scene.add(root);
    mapRoots[theme] = root;
    mapLoading.delete(theme);
    if (theme === selectedMap) {
      refreshActiveMapCollision(theme);
      proceduralWorld.visible = false;
      if (started) notify(`${mapSources[theme].label} READY`);
    }
    console.info(`Loaded CC0 ${theme} map`, { size: size.toArray(), scale });
  }, event => {
    if (theme === selectedMap && event.lengthComputable) {
      const percent = Math.round(event.loaded / Math.max(event.total, 1) * 100);
      setText("#objective-detail", `LOADING ${mapSources[theme].label}: ${percent}%`);
    }
  }, error => {
    mapLoading.delete(theme);
    if (theme === selectedMap) {
      proceduralWorld.visible = true;
      refreshActiveMapCollision(theme);
      setText("#objective-detail", `${mapSources[theme].label} FAILED — PROCEDURAL MAP ACTIVE`);
      if (started) notify("MAP DOWNLOAD FAILED — USING BACKUP ARENA");
    }
    console.warn(`${theme} map unavailable; procedural fallback remains active.`, error);
  });
}
function setCombatMap(theme: MapTheme) {
  selectedMap = theme;
  Object.entries(mapRoots).forEach(([key, root]) => { if (root) root.visible = key === theme; });
  refreshActiveMapCollision(theme);
  proceduralWorld.visible = !mapRoots[theme];
  const palette = {
    urban: { bg: 0x343c40, fog: 0x4b514f, ground: 0x454b49, sun: 0xd6b28a },
    arctic: { bg: 0x82939b, fog: 0x9eafb5, ground: 0x9ba5a6, sun: 0xc8e0ed },
    desert: { bg: 0x8a6245, fog: 0x94765d, ground: 0x81745f, sun: 0xffc17d }
  }[theme];
  scene.background = new THREE.Color(palette.bg);
  if (scene.fog instanceof THREE.Fog) {
    scene.fog.color.setHex(palette.fog);
    scene.fog.near = theme === "arctic" ? 45 : 32;
    scene.fog.far = theme === "desert" ? 145 : 115;
  }
  groundMat.color.setHex(palette.ground);
  sun.color.setHex(palette.sun);
  loadCombatMap(theme);
}


const camera = new THREE.PerspectiveCamera(76, innerWidth / innerHeight, 0.1, 180);
camera.position.set(0, 1.7, 12);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.35));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.22;

// HDR-inspired cinematic post-processing. This expands highlight contrast and
// adds restrained bloom; actual HDR10 output still depends on the display/browser.
let pixelCap = 1.35;
let rainFraction = 1;
// 4x MSAA render target: the composer bypasses the canvas antialiasing, so jagged edges need this.
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, {
  type: THREE.UnsignedByteType,
  samples: renderer.capabilities.isWebGL2 ? 4 : 0
}));
composer.setPixelRatio(renderer.getPixelRatio());
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(innerWidth, innerHeight),
  0.52, // strength
  0.72, // radius
  0.82  // threshold: only bright highlights bloom
);
composer.addPass(bloomPass);
// Cinematic lens pass: chromatic aberration (kicks on damage and explosions) plus film grain.
const fxPass = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, aberration: { value: 0 }, grain: { value: .045 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float time; uniform float aberration; uniform float grain; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)) + time) * 43758.5453); }
    void main(){
      vec2 d = vUv - .5; float r = dot(d, d); vec2 off = d * (aberration + r * .0035);
      vec3 c = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      c += (hash(vUv * 1500.) - .5) * grain;
      gl_FragColor = vec4(c, 1.0);
    }`
});
composer.addPass(fxPass);
composer.addPass(new OutputPass());

scene.add(new THREE.HemisphereLight(0xc9e1ed, 0x25201b, 1.9));
const sun = new THREE.DirectionalLight(0xffd4a0, 3.8);
sun.position.set(-18, 32, 15); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -45; sun.shadow.camera.right = 45;
sun.shadow.camera.top = 45; sun.shadow.camera.bottom = -45;
scene.add(sun);

function applyGraphicsQuality(level: "low" | "medium" | "high") {
  const presets = {
    low: { pixelRatio: .9, shadowSize: 512, bloom: .12, shadows: false },
    medium: { pixelRatio: 1.15, shadowSize: 1024, bloom: .24, shadows: true },
    high: { pixelRatio: 1.5, shadowSize: 2048, bloom: .34, shadows: true }
  };
  const preset = presets[level];
  renderer.setPixelRatio(Math.min(devicePixelRatio,preset.pixelRatio));
  pixelCap=preset.pixelRatio; rainFraction = level==="low" ? 0 : level==="medium" ? .5 : 1; composer.setPixelRatio(Math.min(devicePixelRatio,preset.pixelRatio));
  renderer.setSize(innerWidth,innerHeight);
  renderer.shadowMap.enabled=preset.shadows;
  sun.shadow.mapSize.set(preset.shadowSize,preset.shadowSize);
  sun.shadow.needsUpdate=true;
  bloomPass.strength=preset.bloom;
  composer.setSize(innerWidth,innerHeight);
  document.querySelectorAll<HTMLButtonElement>("[data-quality]").forEach(button=>
    button.classList.toggle("selected",button.dataset.quality===level));
}
applyGraphicsQuality("high");

// Procedural PBR surface library: generated locally, no external asset dependency.
function makeNormalMap(src: HTMLCanvasElement, strength: number) {
  const w = src.width, h = src.height;
  const data = src.getContext("2d")!.getImageData(0, 0, w, h).data;
  const out = document.createElement("canvas"); out.width = w; out.height = h;
  const octx = out.getContext("2d")!; const img = octx.createImageData(w, h);
  const lum = (x: number, y: number) => { const i = (((y + h) % h) * w + ((x + w) % w)) * 4; return (data[i] * .3 + data[i+1] * .59 + data[i+2] * .11) / 255; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (lum(x+1, y) - lum(x-1, y)) * strength, dy = (lum(x, y+1) - lum(x, y-1)) * strength;
    const len = Math.hypot(dx, dy, 1), i = (y * w + x) * 4;
    img.data[i] = (-dx / len * .5 + .5) * 255; img.data[i+1] = (dy / len * .5 + .5) * 255;
    img.data[i+2] = (1 / len * .5 + .5) * 255; img.data[i+3] = 255;
  }
  octx.putImageData(img, 0, 0); return out;
}
function makeSurface(base: string, roughness: number, repeatX: number, repeatY: number, grain = 24) {
  const c = document.createElement("canvas"); c.width = 512; c.height = 512;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = base; ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 9500; i++) {
    const v = Math.random() > .5 ? 255 : 0;
    ctx.fillStyle = `rgba(${v},${v},${v},${Math.random() * .055})`;
    const s = Math.random() * 2.4 + .3;
    ctx.fillRect(Math.random() * 512, Math.random() * 512, s, s);
  }
  for (let i = 0; i < grain; i++) {
    ctx.strokeStyle = `rgba(8,12,14,${Math.random() * .12})`;
    ctx.lineWidth = Math.random() * 1.5 + .3;
    ctx.beginPath(); ctx.moveTo(Math.random()*512, Math.random()*512);
    ctx.lineTo(Math.random()*512, Math.random()*512); ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
  const nTex = new THREE.CanvasTexture(makeNormalMap(c, 22));
  nTex.wrapS = nTex.wrapT = THREE.RepeatWrapping; nTex.repeat.set(repeatX, repeatY);
  nTex.anisotropy = tex.anisotropy;
  return new THREE.MeshStandardMaterial({ map: tex, normalMap: nTex, normalScale: new THREE.Vector2(1.2, 1.2), color: 0xffffff, roughness });
}
const mat = (color: number, roughness = 0.88) => new THREE.MeshStandardMaterial({ color, roughness });
const groundMat = makeSurface("#454b49", .6, 18, 28, 65);
const concrete = makeSurface("#777a75", .92, 2, 3, 38);
const dark = makeSurface("#20272a", .8, 2, 2, 18);
const metal = new THREE.MeshStandardMaterial({ color: 0x394448, metalness: .82, roughness: .3 });
const sand = makeSurface("#81745f", .94, 2, 3, 30);
const glass = new THREE.MeshPhysicalMaterial({ color: 0x263b43, metalness: .48, roughness: .18, transparent: true, opacity: .82 });
const emissiveAmber = new THREE.MeshStandardMaterial({ color: 0xffb45c, emissive: 0xff6b24, emissiveIntensity: 1.8 });

const collisionMeshes: THREE.Mesh[] = [];
const ground = new THREE.Mesh(new THREE.PlaneGeometry(150, 150), groundMat);
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

// Cinematic dusk sky and distant atmospheric skyline.
function makeSkyTexture() {
  const c = document.createElement("canvas"); c.width = 4; c.height = 256;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, "#26354a"); g.addColorStop(.34, "#4f6279"); g.addColorStop(.44, "#b98a66");
  g.addColorStop(.485, "#e0a46c"); g.addColorStop(.5, "#8a9699"); g.addColorStop(1, "#8a9699");
  ctx.fillStyle = g; ctx.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const sky = new THREE.Mesh(new THREE.SphereGeometry(125, 32, 18), new THREE.MeshBasicMaterial({
  map: makeSkyTexture(), side: THREE.BackSide, fog: false
}));
scene.add(sky);
const horizonGlow = new THREE.Mesh(new THREE.PlaneGeometry(150, 42), new THREE.MeshBasicMaterial({
  color: 0xd18d5c, transparent: true, opacity: .12, depthWrite: false
}));
horizonGlow.position.set(0, 13, -62); scene.add(horizonGlow);

function box(x:number,y:number,z:number,sx:number,sy:number,sz:number, material:THREE.Material, shadow=true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz), material);
  m.position.set(x,y,z); m.castShadow = shadow; m.receiveShadow = true; scene.add(m); return m;
}

// A compact, readable urban combat arena built from procedural geometry.
for (let i=0;i<22;i++) {
  const side = i % 2 === 0 ? -1 : 1;
  const z = -35 + Math.floor(i/2)*7;
  const h = 5 + (i%5)*1.7;
  const building = box(side*23,h/2,z, 10,h,6, i%3===0 ? sand : concrete);
  collisionMeshes.push(building);
  // Facade windows are built on the inward-facing side wall below.
}
// Architectural facade treatment: window recesses, lintels, ledges and damaged panels.
for (let i=0;i<22;i++) {
  const side = i % 2 === 0 ? -1 : 1;
  const z = -35 + Math.floor(i/2)*7;
  const h = 5 + (i%5)*1.7;
  const facadeX = side * 17.91;
  for (let floor = 0; floor < Math.max(2, Math.floor(h/2.5)); floor++) {
    for (let bay = 0; bay < 3; bay++) {
      const wz = z + (bay-1)*1.72;
      const wy = 1.65 + floor*2.35;
      const recess = new THREE.Mesh(new THREE.BoxGeometry(.13,1.42,1.38),dark);
      recess.position.set(facadeX,wy,wz); scene.add(recess);
      const pane = new THREE.Mesh(new THREE.BoxGeometry(.07,1.16,1.12),glass);
      pane.position.set(side*17.82,wy,wz); pane.castShadow=true; scene.add(pane);
      const sill = new THREE.Mesh(new THREE.BoxGeometry(.2,.12,1.48),metal);
      sill.position.set(side*17.79,wy-.66,wz); scene.add(sill);
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(.2,.12,1.48),metal);
      lintel.position.set(side*17.79,wy+.66,wz); scene.add(lintel);
      const mullion = new THREE.Mesh(new THREE.BoxGeometry(.11,1.2,.055),dark);
      mullion.position.set(side*17.77,wy,wz); scene.add(mullion);
      if ((i+floor+bay)%5===0) {
        const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.0,.88),new THREE.MeshBasicMaterial({
          color:0xffb56d,transparent:true,opacity:.2,depthWrite:false
        }));
        glow.rotation.y=side*Math.PI/2;
        glow.position.set(side*17.75,wy,wz); scene.add(glow);
      }
    }
  }
  const cornice = new THREE.Mesh(new THREE.BoxGeometry(.28,.16,6.25),metal);
  cornice.position.set(side*17.84,h-.12,z); scene.add(cornice);
}

// Street debris, broken concrete, road markings and tactical cover.
for (let i=0;i<90;i++) {
  const x = (Math.random()-.5)*34, z = -38 + Math.random()*62;
  const size = .08 + Math.random()*.34;
  const debris = new THREE.Mesh(new THREE.DodecahedronGeometry(size,0), i%3===0 ? sand : concrete);
  debris.position.set(x,size*.45,z); debris.rotation.set(Math.random(),Math.random(),Math.random());
  debris.castShadow = true; debris.receiveShadow = true; scene.add(debris);
}
const roadLineMat = new THREE.MeshStandardMaterial({color:0xb5a88b, roughness:1, transparent:true, opacity:.36});
for (let i=0;i<14;i++) {
  const stripe = new THREE.Mesh(new THREE.PlaneGeometry(.12,2.2), roadLineMat);
  stripe.rotation.x=-Math.PI/2; stripe.position.set(0,.012,-37+i*4.5); scene.add(stripe);
}
for (const x of [-4.8,4.8]) {
  const curb = new THREE.Mesh(new THREE.BoxGeometry(.22,.18,75), mat(0x77736b));
  curb.position.set(x,.08,-7); curb.receiveShadow=true; scene.add(curb);
}

for (let i=0;i<12;i++) {
  const z = -29 + i*5.2;
  collisionMeshes.push(box(-7,0.75,z,3.4,1.5,1.1, i%2 ? metal : concrete));
  collisionMeshes.push(box(8,0.6,z-2.3,2.6,1.2,1.2, dark));
}
for (let i=0;i<9;i++) {
  const x = -16 + i*4;
  box(x,0.08,-42,3,.16,.8, metal, false);
  box(x,0.08,22,3,.16,.8, metal, false);
}
// Street lights
const streetLamps: { light: THREE.PointLight; base: number; seed: number }[] = [];
for (const x of [-13,13]) for (const z of [-24,-5,14]) {
  box(x,3.8,z,.12,7.6,.12,dark,false);
  const lamp = new THREE.PointLight(0xffd8a1, 18, 13); lamp.position.set(x,7.2,z); scene.add(lamp);
  streetLamps.push({ light: lamp, base: 18, seed: Math.random() * 100 });
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(.2,10,8), emissiveAmber); bulb.position.set(x,7.4,z); scene.add(bulb);
}


// ---- Battlefield dressing: wrecked cars, crates, sandbags, burning barrels, setting sun
function glowTexture(inner: string, outer: string) {
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, inner); g.addColorStop(1, outer);
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
// Warm rim light from the horizon so hostiles are lit from the front and read against the dusk.
const rimLight = new THREE.DirectionalLight(0xff9c5a, 1.3); rimLight.position.set(-20, 14, -40); scene.add(rimLight);
const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
  map: glowTexture("rgba(255,222,170,1)", "rgba(255,150,70,0)"), blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true
}));
sunSprite.position.set(-34, 16, -112); sunSprite.scale.set(52, 52, 1); scene.add(sunSprite);

const woodMat = makeSurface("#6b4f2f", .88, 1, 1, 40);
const rustMat = makeSurface("#4d3b35", .55, 1, 1, 30);
const tyreMat = mat(0x111416, .95);
const barrelMat = makeSurface("#5b3a2a", .5, 1, 1, 34);
function wreck(x: number, z: number) {
  const hit = box(x, .75, z, 1.9, 1.5, 4.2, rustMat, false); hit.visible = false; collisionMeshes.push(hit);
  box(x, .55, z, 1.9, .7, 4.2, rustMat);
  box(x, 1.05, z + .15, 1.7, .55, 2.3, rustMat);
  box(x, 1.07, z + .15, 1.74, .38, 2.0, glass, false);
  for (const sx of [-.95, .95]) for (const sz of [-1.4, 1.4]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(.38, .38, .28, 14), tyreMat);
    wheel.rotation.z = Math.PI / 2; wheel.position.set(x + sx, .38, z + sz); wheel.castShadow = true; scene.add(wheel);
  }
}
function crates(x: number, z: number) {
  collisionMeshes.push(box(x, .6, z, 1.2, 1.2, 1.2, woodMat));
  const top = box(x + .05, 1.55, z, .95, .9, .95, woodMat); top.rotation.y = .4;
}
function sandbags(x: number, z: number) {
  const hit = box(x, .55, z, 3.2, 1.1, .9, sand, false); hit.visible = false; collisionMeshes.push(hit);
  for (let row = 0; row < 3; row++) for (let i = 0; i < 3; i++) {
    const bag = new THREE.Mesh(new THREE.BoxGeometry(1.05, .34, .7), sand);
    bag.position.set(x + (i - 1) * 1.05 + (row % 2 ? .5 : 0), .2 + row * .34, z + (Math.random() - .5) * .08);
    bag.rotation.y = (Math.random() - .5) * .12; bag.castShadow = true; bag.receiveShadow = true; scene.add(bag);
  }
}
const fires: { sprites: THREE.Sprite[]; light: THREE.PointLight; base: number; seed: number }[] = [];
const flameTex = glowTexture("rgba(255,196,96,1)", "rgba(255,70,10,0)");
function burningBarrel(x: number, z: number) {
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(.48, .44, 1.15, 14), barrelMat);
  barrel.position.set(x, .575, z); barrel.castShadow = true; scene.add(barrel); collisionMeshes.push(barrel);
  const sprites: THREE.Sprite[] = [];
  for (let i = 0; i < 3; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: .6 }));
    sp.position.set(x, 1.35 + i * .35, z); scene.add(sp); sprites.push(sp);
  }
  const light = new THREE.PointLight(0xff8a3a, 16, 11); light.position.set(x, 1.7, z); scene.add(light);
  fires.push({ sprites, light, base: 16, seed: Math.random() * 100 });
}
wreck(-12, -12); wreck(12, -24); wreck(-12.5, -32);
crates(-14.5, -6); crates(14.5, -8); crates(-14.5, 14); crates(14.5, 12); crates(14.5, -31);
sandbags(-3.8, -16); sandbags(3.8, -9); sandbags(-3.8, 0);
burningBarrel(-13, -19); burningBarrel(13, -17);

// Keep the procedural arena as a fallback. Authored maps replace it when loaded.
const proceduralWorld = new THREE.Group();
proceduralWorld.name = "procedural-fallback-world";
for (const child of [...scene.children]) {
  if (!(child instanceof THREE.Light)) {
    scene.remove(child);
    proceduralWorld.add(child);
  }
}
scene.add(proceduralWorld);

const player = { speed: 7.5, sprint: 1.55, health: 100, reloading: false, lastShot: 0, verticalVelocity: 0, crouching: false, grounded: true };
const enemies: Enemy[] = [];
const clock = new THREE.Clock();
const keys = new Set<string>();
const raycaster = new THREE.Raycaster();
const center = new THREE.Vector2(0,0);
let locked = false, started = false, paused = false, wave = 0;
let mouseSensitivity = 0.0022;
let baseFov = 76;
let settingsReturnScreen = "start-screen";
let fireHeld = false;
let aiming = false;
let grenades = 3;
let killStreak = 0;
let totalKills = 0;
let score = 0;
let toastTimer = 0;
let recoil = 0;
let damageImmuneUntil = 0;
let missionStartedAt = 0;
let objectiveKills = 0;
let uavUntil = 0;
const MAX_CAMPAIGN_WAVES = 12;
type GameMode = "campaign" | "survival" | "time-attack";
let selectedMode: GameMode = "campaign";
let timeAttackEndsAt = 0;
let extractionActive = false;
let sessionEpoch = 0;
let reloadToken = 0;
const radarCanvas = document.querySelector<HTMLCanvasElement>("#tactical-radar")!;
const radarCtx = radarCanvas.getContext("2d")!;
let extractionMarker: THREE.Group | null = null;
let bestScore = Number(localStorage.getItem("sw_best_score") || 0);
const grenadeObjects: { mesh: THREE.Mesh; velocity: THREE.Vector3; fuse: number }[] = [];
// Static world colliders never move, so cache their bounds instead of rebuilding Box3 objects every frame.
collisionBounds = collisionMeshes.map(mesh => new THREE.Box3().setFromObject(mesh));

// ================= Combat feedback systems =================
// Particles, pickups, audio synthesis, screen shake, atmosphere and the boss health bar.
type Particle = { mesh: THREE.Mesh; vel: THREE.Vector3; life: number; max: number; grav: number; size: number };
const particles: Particle[] = [];
const particleGeo = new THREE.BoxGeometry(1, 1, 1);
const particleMats = new Map<number, THREE.MeshBasicMaterial>();
function particleMat(color: number) {
  let m = particleMats.get(color);
  if (!m) { m = new THREE.MeshBasicMaterial({ color }); particleMats.set(color, m); }
  return m;
}
function burst(pos: THREE.Vector3, color: number, count: number, speed: number, size: number, life = .5, grav = 9, up = 0) {
  for (let i = 0; i < count; i++) {
    if (particles.length >= 280) { const old = particles.shift()!; scene.remove(old.mesh); }
    const mesh = new THREE.Mesh(particleGeo, particleMat(color));
    mesh.position.copy(pos); mesh.scale.setScalar(size); scene.add(mesh);
    const vel = new THREE.Vector3(Math.random() - .5, Math.random() * .8 + .1 + up, Math.random() - .5)
      .normalize().multiplyScalar(speed * (.35 + Math.random() * .65));
    particles.push({ mesh, vel, life: life * (.6 + Math.random() * .6), max: life, grav, size });
  }
}
const fireballs: { mesh: THREE.Mesh; t: number }[] = [];
const dying: { mesh: THREE.Group; t: number }[] = [];
const blastLight = new THREE.PointLight(0xffa34d, 0, 22); scene.add(blastLight);
let blastFlash = 0;
let shake = 0;
function addShake(amount: number) { shake = Math.min(1.2, shake + amount); }

// Pickups dropped by hostiles.
type PickupKind = "health" | "ammo" | "frag";
type Pickup = { mesh: THREE.Mesh; kind: PickupKind; born: number };
const pickups: Pickup[] = [];
const pickupGeo = new THREE.BoxGeometry(.42, .42, .42);
const pickupMats: Record<PickupKind, THREE.MeshStandardMaterial> = {
  health: new THREE.MeshStandardMaterial({ color: 0x3ddc84, emissive: 0x16c460, emissiveIntensity: 2.4 }),
  ammo: new THREE.MeshStandardMaterial({ color: 0xffc14a, emissive: 0xf08a10, emissiveIntensity: 2.2 }),
  frag: new THREE.MeshStandardMaterial({ color: 0xff6a4a, emissive: 0xd93a1f, emissiveIntensity: 2.2 })
};
function dropPickup(pos: THREE.Vector3, kind: PickupKind) {
  const mesh = new THREE.Mesh(pickupGeo, pickupMats[kind]);
  mesh.position.set(pos.x, .6, pos.z); scene.add(mesh);
  pickups.push({ mesh, kind, born: performance.now() });
}
function rollDrop(e: Enemy) {
  const pos = e.mesh.position;
  if (e.type === "heavy") {
    dropPickup(new THREE.Vector3(pos.x - .7, 0, pos.z), "health");
    dropPickup(new THREE.Vector3(pos.x + .7, 0, pos.z), "ammo");
    return;
  }
  const r = Math.random();
  if (r < .22) dropPickup(pos, "health");
  else if (r < .55) dropPickup(pos, "ammo");
  else if (r < .62) dropPickup(pos, "frag");
}
function collectPickup(p: Pickup) {
  if (p.kind === "health") { player.health = Math.min(100, player.health + 30); notify("+30 HEALTH"); }
  else if (p.kind === "frag") { grenades = Math.min(5, grenades + 1); notify("+1 FRAG GRENADE"); }
  else {
    weapons.forEach((w, i) => {
      const reserveCap = w.magazine * (i === activeWeapon ? 8 : 5);
      w.reserve = Math.min(reserveCap, w.reserve + Math.ceil(w.magazine * (i === activeWeapon ? 1.5 : .75)));
    });
    notify("AMMO RESUPPLIED");
  }
  playPickup(); updateHUD();
}

// Boss health bar (created in code so index.html stays untouched).
const bossBar = document.createElement("div");
bossBar.id = "boss-bar";
bossBar.innerHTML = '<small>HEAVY UNIT</small><div class="boss-track"><div id="boss-fill"></div></div>';
document.querySelector("#hud")!.appendChild(bossBar);
const bossFill = bossBar.querySelector<HTMLElement>("#boss-fill")!;

// Damage direction arc and combo/kill readout.
const dmgDir = document.createElement("div"); dmgDir.id = "dmg-dir"; dmgDir.innerHTML = "<i></i>";
document.querySelector("#hud")!.appendChild(dmgDir);
let dmgDirTimer = 0;
function showDamageDir(from?: THREE.Vector3) {
  fxPass.uniforms.aberration.value = Math.max(fxPass.uniforms.aberration.value, .012);
  if (!from) return;
  const phi = Math.atan2(from.x - camera.position.x, -(from.z - camera.position.z));
  dmgDir.style.transform = `rotate(${phi + camera.rotation.y}rad)`;
  dmgDir.classList.add("show"); window.clearTimeout(dmgDirTimer);
  dmgDirTimer = window.setTimeout(() => dmgDir.classList.remove("show"), 600);
}
let combo = 0, comboUntil = 0, comboTimer = 0;
const comboEl = document.createElement("div"); comboEl.id = "combo";
document.querySelector("#hud")!.appendChild(comboEl);
let reloadBlend = 0, swayX = 0, swayY = 0;

// Rain: line-segment streaks that follow the player.
const RAIN_COUNT = 1500;
const rainPos = new Float32Array(RAIN_COUNT * 6);
const rainSpeed = new Float32Array(RAIN_COUNT);
function respawnDrop(i: number, anywhere: boolean) {
  const x = camera.position.x + (Math.random() - .5) * 46, z = camera.position.z + (Math.random() - .5) * 46;
  const y = anywhere ? Math.random() * 22 : 20 + Math.random() * 6, b = i * 6;
  rainPos[b] = x; rainPos[b+1] = y + .9; rainPos[b+2] = z; rainPos[b+3] = x - .2; rainPos[b+4] = y; rainPos[b+5] = z;
  rainSpeed[i] = 20 + Math.random() * 8;
}
for (let i = 0; i < RAIN_COUNT; i++) respawnDrop(i, true);
const rainGeo = new THREE.BufferGeometry();
rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPos, 3));
const rainLines = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0xaec4d0, transparent: true, opacity: .3, depthWrite: false }));
rainLines.frustumCulled = false; scene.add(rainLines);

// Drifting dust motes for atmosphere.
const DUST_COUNT = 520;
const dustPositions = new Float32Array(DUST_COUNT * 3);
for (let i = 0; i < DUST_COUNT; i++) {
  dustPositions[i*3] = (Math.random() - .5) * 44;
  dustPositions[i*3+1] = .3 + Math.random() * 8.5;
  dustPositions[i*3+2] = -40 + Math.random() * 68;
}
const dustGeo = new THREE.BufferGeometry();
dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xf0dcc0, size: .07, transparent: true, opacity: .5, depthWrite: false }));
dust.frustumCulled = false; scene.add(dust);

// ---- Synthesised audio (no asset files needed)
function audio(): AudioContext | null {
  try {
    audioContext ??= new AudioContext();
    if (audioContext.state === "suspended") void audioContext.resume();
    return audioContext;
  } catch { return null; }
}
let noiseBuffer: AudioBuffer | null = null;
function noiseSource(ctx: AudioContext) {
  if (!noiseBuffer) {
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuffer.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = ctx.createBufferSource(); src.buffer = noiseBuffer; src.loop = true; return src;
}
function noiseBurst(duration: number, gainValue: number, freq: number, type: BiquadFilterType = "lowpass", sweepTo = freq * .3, delay = 0) {
  const ctx = audio(); if (!ctx) return;
  const now = ctx.currentTime + delay;
  const src = noiseSource(ctx), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
  filter.type = type;
  filter.frequency.setValueAtTime(freq, now);
  filter.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), now + duration);
  gain.gain.setValueAtTime(gainValue, now);
  gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
  src.connect(filter).connect(gain).connect(ctx.destination);
  src.start(now); src.stop(now + duration + .02);
}
function tone(freq: number, endFreq: number, duration: number, gainValue: number, type: OscillatorType = "sine", delay = 0) {
  const ctx = audio(); if (!ctx) return;
  const now = ctx.currentTime + delay;
  const osc = ctx.createOscillator(), gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
  gain.gain.setValueAtTime(.0001, now);
  gain.gain.exponentialRampToValueAtTime(gainValue, now + .004);
  gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now); osc.stop(now + duration + .02);
}
function playExplosion(dist: number) {
  const v = THREE.MathUtils.clamp(1.2 - dist / 30, .15, 1);
  noiseBurst(1.1, .7 * v, 1500, "lowpass", 60);
  tone(72, 22, .9, .8 * v, "sine");
  tone(130, 30, .5, .4 * v, "triangle");
}
function playEnemyShot(dist: number) {
  const v = THREE.MathUtils.clamp(1 - dist / 34, .08, .5);
  noiseBurst(.09, .35 * v, 3800, "bandpass", 900);
  tone(220, 70, .08, .15 * v, "sawtooth");
}
function playHit(headshot: boolean) { tone(headshot ? 1900 : 1300, headshot ? 1400 : 900, .05, .1, "square"); }
function playPickup() { tone(660, 990, .12, .12, "sine"); tone(990, 1320, .14, .1, "sine", .08); }
let ambience: { gain: GainNode; drone: GainNode; rain: GainNode } | null = null;
function startAmbience() {
  const ctx = audio(); if (!ctx || ambience) return;
  const wind = noiseSource(ctx);
  const filter = ctx.createBiquadFilter(); filter.type = "bandpass"; filter.frequency.value = 380; filter.Q.value = .6;
  const lfo = ctx.createOscillator(), lfoGain = ctx.createGain();
  lfo.frequency.value = .11; lfoGain.gain.value = 180;
  lfo.connect(lfoGain); lfoGain.connect(filter.frequency);
  const gain = ctx.createGain(); gain.gain.value = 0;
  wind.connect(filter).connect(gain).connect(ctx.destination);
  const drone = ctx.createGain(); drone.gain.value = 0;
  for (const f of [55, 55.4, 82.5]) {
    const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = f;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 160;
    o.connect(lp).connect(drone); o.start();
  }
  drone.connect(ctx.destination);
  wind.start(); lfo.start();
  const rainSrc = noiseSource(ctx), rainHp = ctx.createBiquadFilter(); rainHp.type = "highpass"; rainHp.frequency.value = 2800;
  const rainGain = ctx.createGain(); rainGain.gain.value = 0;
  rainSrc.connect(rainHp).connect(rainGain).connect(ctx.destination); rainSrc.start();
  ambience = { gain, drone, rain: rainGain };
}
let ambienceTimer = 0;
function tickAmbience(dt: number) {
  ambienceTimer -= dt; if (ambienceTimer > 0 || !ambience || !audioContext) return;
  ambienceTimer = .3;
  const active = started && !paused;
  const alive = enemies.filter(e => e.alive).length;
  const tension = Math.min(1, alive / 12) + (enemies.some(e => e.alive && e.type === "heavy") ? .5 : 0);
  const t = audioContext.currentTime;
  ambience.gain.gain.setTargetAtTime(active ? .07 : 0, t, .4);
  ambience.drone.gain.setTargetAtTime(active ? .012 + tension * .026 : 0, t, .8);
  ambience.rain.gain.setTargetAtTime(active && rainFraction > 0 ? .03 * rainFraction : 0, t, .5);
}

function clearEffects() {
  particles.forEach(p => scene.remove(p.mesh)); particles.length = 0;
  pickups.forEach(p => scene.remove(p.mesh)); pickups.length = 0;
  dying.forEach(d => scene.remove(d.mesh)); dying.length = 0;
  fireballs.forEach(f => { scene.remove(f.mesh); f.mesh.geometry.dispose(); (f.mesh.material as THREE.Material).dispose(); }); fireballs.length = 0;
  blastLight.intensity = 0; blastFlash = 0; shake = 0; camera.rotation.z = 0;
  bossBar.classList.remove("show"); comboEl.classList.remove("show"); combo = 0; dmgDir.classList.remove("show");
}

// Per-frame update for every effect above.
function updateEffects(dt: number) {
  const nowMs = performance.now();
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]; p.life -= dt;
    if (p.life <= 0) { scene.remove(p.mesh); particles.splice(i, 1); continue; }
    p.vel.y -= p.grav * dt; p.mesh.position.addScaledVector(p.vel, dt);
    if (p.mesh.position.y < .03) { p.mesh.position.y = .03; p.vel.y *= -.3; p.vel.x *= .6; p.vel.z *= .6; }
    p.mesh.scale.setScalar(p.size * Math.min(1, Math.max(.05, p.life / p.max)));
    p.mesh.rotation.x += dt * 6;
  }
  for (let i = dying.length - 1; i >= 0; i--) {
    const d = dying[i]; d.t += dt;
    const k = Math.min(1, d.t / .45);
    d.mesh.rotation.x = k * Math.PI / 2;
    d.mesh.position.y = .3 * k;
    if (d.t > 3.5) { scene.remove(d.mesh); dying.splice(i, 1); }
  }
  for (let i = fireballs.length - 1; i >= 0; i--) {
    const f = fireballs[i]; f.t += dt;
    f.mesh.scale.setScalar(1 + f.t * 9);
    (f.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, .7 - f.t * 2.2);
    if (f.t > .33) { scene.remove(f.mesh); f.mesh.geometry.dispose(); (f.mesh.material as THREE.Material).dispose(); fireballs.splice(i, 1); }
  }
  if (blastFlash > 0) { blastFlash = Math.max(0, blastFlash - dt * 5); blastLight.intensity = 60 * blastFlash * blastFlash; }
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    p.mesh.rotation.y += dt * 2.2; p.mesh.position.y = .6 + Math.sin(nowMs * .004 + i) * .08;
    const dx = camera.position.x - p.mesh.position.x, dz = camera.position.z - p.mesh.position.z;
    if (dx * dx + dz * dz < 2.4) { collectPickup(p); scene.remove(p.mesh); pickups.splice(i, 1); continue; }
    if (nowMs - p.born > 30000) { scene.remove(p.mesh); pickups.splice(i, 1); }
  }
  shake = Math.max(0, shake - dt * 2.2);
  fxPass.uniforms.aberration.value *= Math.exp(-6 * dt);
  camera.rotation.z = shake > 0 ? (Math.random() - .5) * shake * .06 : 0;
  for (let i = 0; i < dustPositions.length; i += 3) {
    dustPositions[i] += dt * .35;
    dustPositions[i+1] += Math.sin(nowMs * .0006 + i) * dt * .05 - dt * .02;
    if (dustPositions[i] > 22) dustPositions[i] = -22;
    if (dustPositions[i+1] < .2) dustPositions[i+1] = 9;
  }
  dustGeo.attributes.position.needsUpdate = true;
  rainLines.visible = rainFraction > 0;
  if (rainFraction > 0) {
    rainGeo.setDrawRange(0, Math.floor(RAIN_COUNT * rainFraction) * 2);
    for (let i = 0; i < RAIN_COUNT; i++) {
      const b = i * 6, d = rainSpeed[i] * dt;
      rainPos[b+1] -= d; rainPos[b+4] -= d; rainPos[b] -= 3 * dt; rainPos[b+3] -= 3 * dt;
      if (rainPos[b+4] < 0) respawnDrop(i, false);
    }
    rainGeo.attributes.position.needsUpdate = true;
  }
  for (const f of fires) {
    f.sprites.forEach((sp, i) => {
      const k = .8 + Math.sin(nowMs * .014 + f.seed + i * 2) * .18 + Math.random() * .1;
      sp.scale.set(1.0 * k * (1 + i * .3), 1.5 * k * (1 + i * .25), 1);
      sp.position.y = 1.35 + i * .35 + Math.sin(nowMs * .01 + i) * .05;
      (sp.material as THREE.SpriteMaterial).opacity = .55 + Math.random() * .25 - i * .1;
    });
    f.light.intensity = f.base * (.85 + Math.random() * .3);
  }
  for (const l of streetLamps) l.light.intensity = l.base * (.93 + Math.sin(nowMs * .011 + l.seed) * .04 - (Math.random() < .012 ? .4 : 0));
  const boss = enemies.find(e => e.type === "heavy" && e.alive);
  bossBar.classList.toggle("show", !!boss);
  if (boss) bossFill.style.width = `${Math.max(0, boss.hp / boss.maxHp * 100)}%`;
}

const weaponGroup = new THREE.Group();
camera.add(weaponGroup); scene.add(camera);
let gunBody: THREE.Mesh;
let muzzle: THREE.PointLight;
function buildWeaponVisual(index: number) {
  weaponGroup.clear();
  const profile = weapons[index];
  const primary = new THREE.MeshStandardMaterial({ color: index === 1 ? 0x343b3e : 0x20272a, metalness: .78, roughness: .3 });
  const polymer = new THREE.MeshStandardMaterial({ color: 0x202725, roughness: .78 });
  const accent = new THREE.MeshStandardMaterial({ color: 0x65706d, metalness: .88, roughness: .24 });
  const addBox = (w:number,h:number,d:number,x:number,y:number,z:number,m:THREE.Material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m); mesh.position.set(x,y,z); mesh.castShadow=true; weaponGroup.add(mesh); return mesh;
  };
  const scale = index === 1 ? 1.22 : index === 2 ? .78 : index === 3 ? 1.08 : index === 4 ? .9 : 1;
  gunBody = addBox(.19*scale,.22*scale,.78*scale,.29,-.25,-.57,primary);
  addBox(.205*scale,.13*scale,.42*scale,.29,-.17,-.51,accent);
  addBox(.17*scale,.17*scale,.42*scale,.29,-.24,-.94,polymer);
  addBox(.15,.17,.34,.29,-.27,-.12,polymer);
  const grip = addBox(.105,.25,.15,.29,-.43,-.42,polymer); grip.rotation.x=-.18;
  addBox(.13,index===1?.38:.32,.18,.29,-.46,-.62,polymer);
  addBox(.07,.055,.62,.29,-.075,-.64,accent);
  if(index!==2) {
    addBox(.105,.13,.17,.29,.015,-.55,polymer);
    addBox(.075,.07,.012,.29,.025,-.64,new THREE.MeshBasicMaterial({color:0x79a9a5}));
  } else {
    const sight = new THREE.Mesh(new THREE.CylinderGeometry(.045,.045,.12,12),accent); sight.rotation.x=Math.PI/2; sight.position.set(.29,-.08,-.58); weaponGroup.add(sight);
  }
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(.032,.04,index===1?.82:.58,16),accent);
  barrel.rotation.x=Math.PI/2; barrel.position.set(.29,-.23,index===1?-1.38:-1.23); weaponGroup.add(barrel);
  const muzzleBrake = new THREE.Mesh(new THREE.CylinderGeometry(.052,.052,.13,12),polymer);
  muzzleBrake.rotation.x=Math.PI/2; muzzleBrake.position.set(.29,-.23,index===1?-1.82:-1.57); weaponGroup.add(muzzleBrake);
  // Receiver controls, Picatinny rail, magazine ribs and a compact tactical foregrip.
  const addCylinder = (radius:number,length:number,x:number,y:number,z:number,m:THREE.Material) => {
    const part = new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,length,10),m);
    part.rotation.x=Math.PI/2; part.position.set(x,y,z); weaponGroup.add(part); return part;
  };
  addBox(.035,.075,.13,.405,-.12,-.48,accent);
  addBox(.035,.055,.11,.17,-.18,-.36,metal);
  addBox(.12,.035,.30,.29,-.055,-.70,polymer);
  for(let rail=0;rail<7;rail++) addBox(.14,.018,.035,.29,-.028,-.59-rail*.055,accent);
  const magazine = addBox(.135,index===3?.29:.36,.19,.29,-.49,-.53,polymer);
  magazine.rotation.x=-.12;
  for(let rib=0;rib<4;rib++) addBox(.14,.018,.025,.29,-.40-rib*.055,-.53,accent);
  if(index!==2) {
    const foregrip=addBox(.105,.22,.12,.29,-.36,-.92,polymer); foregrip.rotation.x=-.16;
  }
  for(const side of [-1,1]) {
    const screw=addCylinder(.018,.012,.29+side*.082,-.25,-.45,accent);
    screw.rotation.z=Math.PI/2;
  }
  muzzle = new THREE.PointLight(0xffa34d,0,7); muzzle.position.set(.29,-.23,-1.62); weaponGroup.add(muzzle);
  const flash = new THREE.Mesh(new THREE.ConeGeometry(.105,.34,10),new THREE.MeshBasicMaterial({color:0xffc16b,transparent:true,opacity:.0}));
  flash.rotation.x=-Math.PI/2; flash.position.set(.29,-.23,-1.82); flash.name="muzzle-flash"; weaponGroup.add(flash);
  setText("#weapon-name",profile.name); setText("#weapon-meta",profile.meta); updateHUD();
}
buildWeaponVisual(activeWeapon);
function playShot() {
  // [noise duration, noise gain, noise freq, tone start, tone end, tone length, tone gain, tone type]
  const profiles: [number, number, number, number, number, number, number, OscillatorType][] = [
    [.07, .5, 5200, 150, 45, .10, .35, "sawtooth"],
    [.16, .7, 3600, 110, 35, .18, .5, "sawtooth"],
    [.05, .4, 6200, 190, 60, .07, .3, "square"],
    [.22, .85, 3000, 90, 28, .22, .6, "sawtooth"],
    [.05, .4, 5800, 170, 55, .07, .28, "sawtooth"]
  ];
  const [nd, ng, nf, t0, t1, tl, tg, tt] = profiles[activeWeapon];
  noiseBurst(nd, ng, nf, activeWeapon === 3 ? "lowpass" : "bandpass", nf * .22);
  tone(t0, t1, tl, tg, tt);
  tone(62, 28, tl * 1.4, tg * 1.1, "triangle");
}
function switchWeapon(index:number) {
  if(index<0 || index>=weapons.length || index===activeWeapon) return;
  activeWeapon=index; reloadToken++; player.reloading=false; buildWeaponVisual(index); notify(`WEAPON SELECTED — ${weapons[index].name}`);
}

const operatorLoader = new GLTFLoader();
const OPERATOR_MODEL_URL = "https://cdn.3dassets.dev/assets/27593/v1/model.glb";
let operatorTemplate: THREE.Group | null = null;
let operatorAnimations: THREE.AnimationClip[] = [];
let operatorLoading = false;
function attachOperatorModel(enemy: Enemy) {
  if (!operatorTemplate || !enemy.alive || enemy.type !== "grunt" || enemy.mesh.userData.hasImportedOperator) return;
  const imported = cloneSkinned(operatorTemplate);
  imported.name = "cc0-static-operator";
  imported.position.set(0, 0, 0);
  imported.scale.setScalar(1);
  imported.traverse(node => {
    node.userData.enemy = enemy;
    if (node instanceof THREE.Mesh) { node.castShadow = true; node.receiveShadow = true; }
  });
  enemy.mesh.children.forEach(child => { if (child !== enemy.marker) child.visible = false; });
  const initialBounds = new THREE.Box3().setFromObject(imported);
  const initialSize = initialBounds.getSize(new THREE.Vector3());
  if (initialSize.y > .01) imported.scale.setScalar(1.85 / initialSize.y);
  imported.updateMatrixWorld(true);
  const fittedBounds = new THREE.Box3().setFromObject(imported);
  const fittedCenter = fittedBounds.getCenter(new THREE.Vector3());
  imported.position.set(-fittedCenter.x, -fittedBounds.min.y, -fittedCenter.z);
  enemy.mesh.add(imported);
  if (operatorAnimations.length) {
    enemy.mixer = new THREE.AnimationMixer(imported);
    enemy.mixer.clipAction(operatorAnimations[0]).play();
  }
  enemy.mesh.userData.hasImportedOperator = true;
}
function ensureOperatorModel() {
  if (operatorTemplate || operatorLoading) return;
  operatorLoading = true;
  operatorLoader.load(OPERATOR_MODEL_URL, gltf => {
    operatorTemplate = gltf.scene;
    operatorAnimations = gltf.animations ?? [];
    operatorLoading = false;
    enemies.forEach(attachOperatorModel);
    console.info("Loaded CC0 Veteran Running Pose operator model.");
  }, undefined, error => {
    operatorLoading = false;
    console.warn("Operator model unavailable; procedural soldier fallback remains active.", error);
  });
}

function makeEnemy(x:number,z:number,type:EnemyType="grunt"): Enemy {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(.42,.72,5,8), mat(0x343d3b));
  body.position.y = 1.05; body.castShadow = true; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.25,12,10), mat(0x927d68));
  head.position.y = 1.72; head.castShadow = true; g.add(head);
  const vest = new THREE.Mesh(new THREE.BoxGeometry(.72,.56,.32), mat(0x555744));
  vest.position.set(0,1.12,-.02); g.add(vest);
  const shoulderMat = mat(0x414b43);
  const leftArm = new THREE.Group(), rightArm = new THREE.Group();
  for (const [arm,sx] of [[leftArm,-.43],[rightArm,.43]] as [THREE.Group,number][]) {
    arm.position.set(sx,1.43,-.02);
    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(.2,12,10), shoulderMat);
    shoulder.scale.set(1,.88,1); shoulder.position.set(0,0,0); arm.add(shoulder);
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(.105,.34,5,8), mat(0x303a35));
    upper.position.set(0,-.22,-.015); arm.add(upper);
    const elbow = new THREE.Mesh(new THREE.SphereGeometry(.105,10,8), mat(0x343d38));
    elbow.position.set(0,-.42,-.025); arm.add(elbow);
    const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(.085,.31,5,8), mat(0x303a35));
    forearm.position.set(0,-.59,-.07); forearm.rotation.x=-.18; arm.add(forearm);
    g.add(arm);
  }
  // Plate carrier, radio, utility pouches and shoulder straps.
  const plate = new THREE.Mesh(new THREE.BoxGeometry(.48,.42,.12),mat(0x68705a));
  plate.position.set(0,1.18,-.205); g.add(plate);
  for(let pouch=0;pouch<3;pouch++) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(.115,.13,.11),mat(0x343d32));
    p.position.set((pouch-1)*.15,.91,-.22); g.add(p);
  }
  const radio = new THREE.Mesh(new THREE.BoxGeometry(.12,.24,.11),dark);
  radio.position.set(-.31,1.35,.02); g.add(radio);
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(.012,.012,.24,6),metal);
  antenna.position.set(-.31,1.57,.02); g.add(antenna);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(.27,16,12,0,Math.PI*2,0,Math.PI*.62), mat(0x303b36));
  helmet.position.set(0,1.88,0); g.add(helmet);
  const helmetBand = new THREE.Mesh(new THREE.BoxGeometry(.48,.055,.34),metal);
  helmetBand.position.set(0,1.84,-.015); g.add(helmetBand);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(.34,.065,.12), dark);
  visor.position.set(0,1.78,-.22); g.add(visor);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(.12,.12,.72), metal);
  gun.position.set(.35,1.12,-.38); g.add(gun);
  const gunStock = new THREE.Mesh(new THREE.BoxGeometry(.15,.16,.24),dark);
  gunStock.position.set(.35,1.12,-.02); g.add(gunStock);
  const optic = new THREE.Mesh(new THREE.BoxGeometry(.12,.12,.16),mat(0x111b1d));
  optic.position.set(.35,1.25,-.34); g.add(optic);
  const barrelTip = new THREE.Mesh(new THREE.CylinderGeometry(.025,.025,.18,8), dark);
  barrelTip.rotation.x=Math.PI/2; barrelTip.position.set(.35,1.12,-.82); g.add(barrelTip);
  const leftLeg = new THREE.Group(), rightLeg = new THREE.Group();
  for(const [leg,sx] of [[leftLeg,-.19],[rightLeg,.19]] as [THREE.Group,number][]) {
    leg.position.set(sx,.73,0);
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(.145,.42,5,8),mat(0x343d35));
    thigh.position.y=-.16; leg.add(thigh);
    const knee = new THREE.Mesh(new THREE.BoxGeometry(.22,.19,.18),mat(0x59604b));
    knee.position.set(0,-.38,-.015); leg.add(knee);
    const boot = new THREE.Mesh(new THREE.BoxGeometry(.2,.14,.34),dark);
    boot.position.set(0,-.66,-.075); leg.add(boot);
    g.add(leg);
  }
  const marker = new THREE.Mesh(new THREE.RingGeometry(.32,.42,20), new THREE.MeshBasicMaterial({color:0xff5544,side:THREE.DoubleSide}));
  marker.position.set(0,2.45,0); marker.rotation.x=Math.PI/2; marker.visible=false; g.add(marker);
  g.rotation.order = "YXZ";
  g.position.set(x,0,z); scene.add(g);
  const stats = type==="heavy" ? { hp:750, speed:.85, scale:1.5 }
    : type==="rusher" ? { hp:60, speed:3.4+Math.random()*.6, scale:.94 }
    : { hp:100, speed:1.15+Math.random()*.65, scale:1 };
  g.scale.setScalar(stats.scale);
  if(type!=="grunt") {
    const tint = new THREE.Color(type==="heavy" ? 0x1c1d26 : 0x7a2c24);
    g.traverse((o: THREE.Object3D) => {
      if(o instanceof THREE.Mesh && o!==marker && o.material instanceof THREE.MeshStandardMaterial && o.material!==dark && o.material!==metal)
        o.material.color.lerp(tint, type==="heavy" ? .55 : .4);
    });
  }
  if(type==="heavy") {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(.3,.05,.05), new THREE.MeshBasicMaterial({color:0xff3b2f}));
    eye.position.set(0,1.78,-.26); g.add(eye);
  }
  const enemy: Enemy = { type, maxHp:stats.hp, mesh:g, hp:stats.hp, speed:stats.speed, attackAt:0, alive:true, state:"advance", strafeDir:Math.random()>.5?1:-1, marker, leftLeg, rightLeg, leftArm, rightArm, gait:Math.random()*Math.PI*2 };
  ensureOperatorModel();
  attachOperatorModel(enemy);
  head.userData.hitZone = "head";
  marker.raycast = () => {};
  // Tag every nested mesh so arm/leg/gear hits register (previously only direct children counted).
  g.traverse((part: THREE.Object3D) => { part.userData.enemy = enemy; });
  return enemy;
}

function createExtraction() {
  if (extractionMarker) scene.remove(extractionMarker);
  extractionMarker = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.15, .075, 10, 64), new THREE.MeshBasicMaterial({ color: 0x67d9c0 }));
  ring.rotation.x = Math.PI / 2; ring.position.y = .12; extractionMarker.add(ring);
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(.12, .18, 3.8, 12), new THREE.MeshStandardMaterial({ color: 0x9de8d8, emissive: 0x27a88c, emissiveIntensity: 2.2, metalness: .35, roughness: .25 }));
  beacon.position.y = 1.9; extractionMarker.add(beacon);
  const light = new THREE.PointLight(0x43e0bd, 18, 16); light.position.y = 2.2; extractionMarker.add(light);
  extractionMarker.position.set(0, 0, 20); scene.add(extractionMarker);
  extractionActive = true;
  setText("#objective-title", "REACH EXTRACTION ZONE");
  setText("#objective-detail", "MOVE TO THE GREEN BEACON");
  notify("ALL HOSTILES DOWN — EXTRACTION AVAILABLE");
}

function pickSpawn(zone: "far" | "rear") {
  for (let tries = 0; tries < 30; tries++) {
    const x = (Math.random()-.5)*28;
    const z = zone === "far" ? -38 + Math.random()*9 : 19 + Math.random()*5;
    if (!collidesAt(x, z, 1.1)) return new THREE.Vector3(x, 0, z);
  }
  return new THREE.Vector3(0, 0, -34);
}
function resupply() {
  player.health = Math.min(100, player.health + 25);
  grenades = Math.min(5, grenades + 1);
  weapons.forEach(w => { w.reserve = Math.min(w.magazine * 8, w.reserve + Math.ceil(w.magazine * 1.5)); });
  playPickup(); updateHUD();
}
function spawnWave() {
  for (let i = enemies.length - 1; i >= 0; i--) if (!enemies[i].alive) enemies.splice(i, 1);
  if (wave > 0) resupply();
  if (selectedMode === "campaign" && wave >= MAX_CAMPAIGN_WAVES) { createExtraction(); return; }
  if (selectedMode === "time-attack" && performance.now() >= timeAttackEndsAt) { showEnd(true); return; }
  wave++;
  const grunts = selectedMode === "campaign" ? Math.min(20, 4 + wave*2) : Math.min(18, 4 + wave*2);
  const rushers = selectedMode === "campaign" ? Math.min(10, Math.max(0, wave - 1)) : Math.min(8, Math.floor(wave/2));
  const heavies = selectedMode === "campaign"
    ? ([3, 6, 9].includes(wave) ? 1 : wave === 12 ? 3 : 0)
    : (wave % 5 === 0 ? Math.min(3, Math.floor(wave/5)) : 0);
  const rearChance = wave >= 2 ? Math.min(.42, .16 + wave * .02) : 0;
  const chapterTitles = [
    "CHAPTER 01 // THE SILENT DISTRICT", "CHAPTER 02 // BROKEN CONVOY",
    "CHAPTER 03 // THE ARMOURED HUNTER", "CHAPTER 04 // EVACUATION ROUTE",
    "CHAPTER 05 // FROSTLINE", "CHAPTER 06 // THE ICEBREAKER",
    "CHAPTER 07 // WHITEOUT AMBUSH", "CHAPTER 08 // THE LOST OUTPOST",
    "CHAPTER 09 // DUST DEVIL", "CHAPTER 10 // BURIED SIGNAL",
    "CHAPTER 11 // NIGHTFALL", "CHAPTER 12 // OPERATION BLACKOUT"
  ];
  if (selectedMode === "campaign") {
    const chapterMap: MapTheme = wave <= 4 ? "urban" : wave <= 8 ? "arctic" : "desert";
    setCombatMap(chapterMap);
  }
  const spawn = (type: EnemyType, pos?: THREE.Vector3) => {
    const at = pos ?? pickSpawn(Math.random() < rearChance ? "rear" : "far");
    enemies.push(makeEnemy(at.x, at.z, type));
  };
  for (let i = 0; i < grunts; i++) spawn("grunt");
  for (let i = 0; i < rushers; i++) spawn("rusher");
  for (let i = 0; i < heavies; i++) spawn("heavy", new THREE.Vector3((i-(heavies-1)/2)*7, 0, -36));
  const count = grunts + rushers + heavies;
  setText("#wave", String(wave).padStart(2,"0"));
  setText("#enemies-left", `HOSTILES: ${count}`);
  const campaignObjectives = [
    "SECURE THE DISTRICT","REPEL THE COUNTERATTACK","ELIMINATE THE HEAVY UNIT",
    "ESCORT THE CONVOY","REACH THE FROSTLINE","DESTROY THE ICEBREAKER",
    "CLEAR THE WHITEOUT","RECOVER THE BLACK BOX","HUNT THE WARLORD",
    "DISABLE THE RELAY","HOLD THE EXTRACTION CORRIDOR","STOP THE BLACKOUT"
  ];
  setText("#objective-title", selectedMode === "campaign" ? campaignObjectives[wave-1] : selectedMode === "survival" ? "SURVIVE THE ASSAULT" : "ELIMINATE HOSTILES");
  setText("#objective-detail", `HOSTILES REMAINING: ${count}`);
  notify(selectedMode === "campaign"
    ? `${chapterTitles[wave - 1]} — ${wave}/${MAX_CAMPAIGN_WAVES}`
    : selectedMode === "survival" ? `ENDLESS SURVIVAL — WAVE ${wave}` : `TIME ATTACK — WAVE ${wave}`);
  if (heavies > 0) addShake(.5);
}
function setText(selector:string, value:string) { const el=document.querySelector<HTMLElement>(selector); if(el) el.textContent=value; }
function notify(message:string) {
  const el=document.querySelector<HTMLElement>("#toast")!; el.textContent=message; el.classList.add("show"); toastTimer=2.2;
}
function updateHUD() {
  setText("#health", String(Math.max(0,Math.ceil(player.health))));
  document.querySelector<HTMLElement>("#health-fill")!.style.width = `${Math.max(0,player.health)}%`;
  const weapon=weapons[activeWeapon];
  setText("#ammo", String(weapon.ammo).padStart(2,"0"));
  setText("#reserve", String(weapon.reserve).padStart(3,"0"));
  const alive = enemies.filter(e=>e.alive).length;
  setText("#enemies-left", `HOSTILES: ${alive}`);
  if (!extractionActive) setText("#objective-detail", `HOSTILES REMAINING: ${alive}`);
  setText("#score", String(score).padStart(6,"0"));
  setText("#grenades", String(grenades));
  document.querySelector("#vignette")!.classList.toggle("lowhp", player.health > 0 && player.health < 30);
}
function showEnd(win:boolean) {
  paused=true;
  if (score > bestScore) { bestScore = score; localStorage.setItem("sw_best_score", String(bestScore)); } document.exitPointerLock?.();
  document.querySelector("#end-title")!.innerHTML = win ? "MISSION<br><strong>COMPLETE</strong>" : "MISSION<br><strong>FAILED</strong>";
  setText("#end-copy", `HOSTILES ELIMINATED: ${totalKills}  •  FINAL SCORE: ${score}  •  BEST: ${bestScore}`);
  document.querySelector("#end-screen")!.classList.remove("hidden");
}
function reload() {
  const weapon=weapons[activeWeapon];
  if (player.reloading || weapon.ammo===weapon.magazine || weapon.reserve<=0) return;
  player.reloading=true; notify("RELOADING..."); tone(260,110,.05,.18,"square");
  const reloadEpoch = sessionEpoch;
  const currentReloadToken = ++reloadToken;
  window.setTimeout(()=>{
    if (reloadEpoch !== sessionEpoch || currentReloadToken !== reloadToken || !player.reloading) return;
    const needed=weapon.magazine-weapon.ammo, amount=Math.min(needed,weapon.reserve);
    weapon.ammo+=amount; weapon.reserve-=amount; player.reloading=false; tone(420,200,.06,.2,"square"); updateHUD();
  },weapon.reloadMs);
}
function shoot() {
  const now=performance.now();
  const weapon=weapons[activeWeapon];
  if (now-player.lastShot<weapon.interval || player.reloading) return;
  if (weapon.ammo<=0) { notify("MAGAZINE EMPTY — PRESS R"); return; }
  player.lastShot=now; weapon.ammo--; updateHUD(); playShot(); if(!weapon.automatic) fireHeld=false;
  muzzle.intensity=aiming ? 2.8 : 5.5; recoil=Math.min(recoil+.035, .16);
  camera.rotation.x=Math.min(1.45,camera.rotation.x+(aiming?.0018:.0035)*(weapon.pellets?3:1));
  gunBody.position.z=-.48;
  window.setTimeout(()=>{ muzzle.intensity=0; gunBody.position.z=-.57; },55);
  { // eject a brass casing
    const right=new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion);
    const fwd=new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion);
    const cpos=camera.position.clone().addScaledVector(right,.3).addScaledVector(fwd,.5); cpos.y-=.18;
    burst(cpos,0xd9a441,1,2.2,.03,.8,12,.6);
  }
  const pellets=weapon.pellets ?? 1;
  for(let i=0;i<pellets;i++) {
    const spread=(weapon.spread ?? .003)*(aiming ? .35 : 1);
    raycaster.near=0; raycaster.far=Infinity;
    raycaster.setFromCamera(new THREE.Vector2((Math.random()-.5)*spread,(Math.random()-.5)*spread),camera);
    const targets=enemies.filter(e=>e.alive).map(e=>e.mesh);
    const hit=raycaster.intersectObjects(targets,true)[0];
    const worldCollisionMeshes = mapRoots[selectedMap] ? activeMapMeshes : collisionMeshes;
    const wallHits = raycaster.intersectObjects(worldCollisionMeshes,false);
    wallHits.sort((a,b)=>a.distance-b.distance);
    const wall=wallHits[0];
    // Buildings and cover now block bullets instead of letting them pass through.
    if(wall && (!hit || wall.distance<hit.distance)) { burst(wall.point,0xb7b2a6,4,3,.05,.35,8); continue; }
    if(!hit) {
      const gh=raycaster.intersectObject(ground,false)[0];
      if(gh) burst(gh.point,0x8b8a80,3,2.5,.05,.3,8);
      continue;
    }
    const enemy=hit.object.userData.enemy as Enemy | undefined;
    if(!enemy?.alive) continue;
    const headshot=hit.object.userData.hitZone==="head";
    const falloff=pellets>1 ? THREE.MathUtils.clamp(1.25-hit.distance/28,.25,1) : 1;
    enemy.hp-=weapon.damage*falloff*(headshot?2.25:1);
    const hitFlash = enemy.mesh.children.find(part => part instanceof THREE.Mesh && part.geometry instanceof THREE.CapsuleGeometry) as THREE.Mesh | undefined;
    if(hitFlash) {
      const original = hitFlash.material as THREE.MeshStandardMaterial;
      original.emissive.setHex(0x5b2116); original.emissiveIntensity=.8;
      window.setTimeout(()=>{ original.emissive.setHex(0x000000); original.emissiveIntensity=0; },85);
    }
    burst(hit.point,0x8a1c14,headshot?6:4,3.5,.05,.4,9);
    burst(hit.point,headshot?0xffe3a0:0xffa45a,2,5,.035,.15,4);
    playHit(headshot);
    const marker=document.querySelector<HTMLElement>("#hit-marker")!;
    marker.classList.toggle("headshot",headshot); marker.classList.add("show");
    window.setTimeout(()=>marker.classList.remove("show"),115);
    if(enemy.hp<=0) killEnemy(enemy,headshot);
  }
}
function checkWaveClear(delay:number) {
  if(!enemies.every(e=>!e.alive)) return;
  const epoch=sessionEpoch;
  window.setTimeout(()=>{ if(epoch===sessionEpoch && started) spawnWave(); },delay);
}
function killEnemy(enemy:Enemy, headshot:boolean, viaGrenade=false) {
  if(!enemy.alive) return;
  enemy.alive=false; enemy.marker.visible=false; enemy.mixer?.stopAllAction();
  const base=enemy.type==="heavy" ? 1000 : enemy.type==="rusher" ? 120 : 100;
  const nowK=performance.now(); combo = nowK<comboUntil ? combo+1 : 1; comboUntil=nowK+4000;
  const mult=1+Math.min(combo-1,9)*.1;
  const pts=Math.round(base*(headshot?1.5:1)*mult); score+=pts;
  comboEl.textContent=`${headshot?"HEADSHOT":"KILL"} +${pts}${combo>1?`  ×${mult.toFixed(1)}`:""}`;
  comboEl.classList.add("show"); window.clearTimeout(comboTimer); comboTimer=window.setTimeout(()=>comboEl.classList.remove("show"),1500);
  tone(900,520,.1,.14,"triangle");
  objectiveKills++; totalKills++; killStreak++;
  dying.push({mesh:enemy.mesh,t:0});
  burst(new THREE.Vector3(enemy.mesh.position.x,1.1,enemy.mesh.position.z),0x8a1c14,enemy.type==="heavy"?26:12,4.5,.07,.7,10);
  rollDrop(enemy);
  if(enemy.type==="heavy") { notify("HEAVY UNIT DOWN"); addShake(.4); }
  if(killStreak===5) { uavUntil=performance.now()+12000; notify("UAV ACTIVE — HOSTILES REVEALED"); }
  else if(killStreak===10) { grenades=Math.min(grenades+1,5); killStreak=0; notify("COMBAT BONUS — FRAG RESTOCKED"); }
  updateHUD();
  checkWaveClear(viaGrenade ? 1200 : 1800);
}
function throwGrenade() {
  if(!started || paused || grenades<=0 || !locked) return;
  grenades--; updateHUD();
  const geometry=new THREE.SphereGeometry(.13,12,10);
  const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:0x39443a,metalness:.45,roughness:.55}));
  const dir=new THREE.Vector3(); camera.getWorldDirection(dir);
  mesh.position.copy(camera.position).add(dir.clone().multiplyScalar(.8)); mesh.position.y-=.15; scene.add(mesh);
  grenadeObjects.push({mesh,velocity:dir.multiplyScalar(15).add(new THREE.Vector3(0,5,0)),fuse:2.1});
  notify("FRAG OUT!");
}
function detonateGrenade(item:{mesh:THREE.Mesh;velocity:THREE.Vector3;fuse:number}) {
  const pos=item.mesh.position.clone(); scene.remove(item.mesh); item.mesh.geometry.dispose();
  (item.mesh.material as THREE.Material).dispose();
  blastLight.position.set(pos.x,Math.max(pos.y,1),pos.z); blastFlash=1; blastLight.intensity=60;
  const fireball=new THREE.Mesh(new THREE.SphereGeometry(.5,16,12),new THREE.MeshBasicMaterial({color:0xffa34d,transparent:true,opacity:.7}));
  fireball.position.copy(pos); scene.add(fireball); fireballs.push({mesh:fireball,t:0});
  burst(pos,0xffa34d,26,12,.12,.6,6,.8); burst(pos,0x55524c,14,6,.2,1.1,2,.4); burst(pos,0xffe3a0,10,16,.06,.4,8);
  const pd=pos.distanceTo(camera.position);
  playExplosion(pd); addShake(THREE.MathUtils.clamp(1.1-pd/22,.1,1)); fxPass.uniforms.aberration.value=Math.max(fxPass.uniforms.aberration.value,.014);
  if(pd<6) damage(Math.max(8,Math.round(50-pd*7)),pos);
  for(const enemy of enemies) if(enemy.alive) {
    const d=enemy.mesh.position.distanceTo(pos);
    if(d<8) { enemy.hp-=Math.max(0,180-d*18); if(enemy.hp<=0) killEnemy(enemy,false,true); }
  }
  updateHUD();
}
function resetGame() {
  sessionEpoch++;
  reloadToken++;
  fireHeld=false; aiming=false; keys.clear();
  enemies.forEach(e=>scene.remove(e.mesh)); enemies.length=0;
  if (extractionMarker) scene.remove(extractionMarker); extractionMarker=null; extractionActive=false;
  player.health=100; damageImmuneUntil=0; player.reloading=false; player.verticalVelocity=0; player.crouching=false; player.grounded=true;
  weapons.forEach(w=>{w.ammo=w.magazine;}); weapons[0].reserve=180; weapons[1].reserve=72; weapons[2].reserve=102; weapons[3].reserve=48; weapons[4].reserve=200;
  grenadeObjects.forEach(g=>scene.remove(g.mesh)); grenadeObjects.length=0; clearEffects(); grenades=3; killStreak=0; totalKills=0; objectiveKills=0; activeWeapon=0; buildWeaponVisual(0);
  camera.position.set(0,1.7,12); camera.rotation.set(0,0,0); wave=0; score=0; missionStartedAt=performance.now(); timeAttackEndsAt=missionStartedAt+5*60*1000;
  document.querySelector("#end-screen")!.classList.add("hidden");
  document.querySelector("#pause-screen")!.classList.add("hidden");
  updateHUD(); setText("#best-score", String(bestScore).padStart(6,"0")); spawnWave(); paused=false; started=true;
  canvas.requestPointerLock(); startAmbience();
}
function damage(amount:number, from?:THREE.Vector3) {
  const now = performance.now();
  if (now < damageImmuneUntil || paused || !started) return;
  damageImmuneUntil = now + 520; showDamageDir(from);
  player.health-=amount; document.querySelector("#vignette")!.classList.add("damage"); window.setTimeout(()=>document.querySelector("#vignette")!.classList.remove("damage"),180); updateHUD();
  if(player.health<=0) showEnd(false);
}
function drawRadar() {
  const ctx = radarCtx, w = radarCanvas.width, h = radarCanvas.height;
  ctx.clearRect(0,0,w,h);
  ctx.fillStyle = "rgba(8,16,18,.88)"; ctx.fillRect(0,0,w,h);
  ctx.strokeStyle = "rgba(215,163,74,.22)"; ctx.lineWidth = 1;
  for(let i=1;i<4;i++){ const p=i*w/4; ctx.beginPath();ctx.moveTo(p,0);ctx.lineTo(p,h);ctx.moveTo(0,p);ctx.lineTo(w,p);ctx.stroke(); }
  ctx.strokeStyle="rgba(215,163,74,.38)";ctx.beginPath();ctx.arc(w/2,h/2,w*.43,0,Math.PI*2);ctx.stroke();
  const mapX=(x:number)=>THREE.MathUtils.clamp((x+24)/48,0,1)*w;
  const mapY=(z:number)=>THREE.MathUtils.clamp((z+43)/72,0,1)*h;
  for(const e of enemies){ if(!e.alive) continue; if(camera.position.distanceTo(e.mesh.position)>18 && performance.now()>=uavUntil) continue; const x=mapX(e.mesh.position.x), y=mapY(e.mesh.position.z); ctx.fillStyle="#ff6252";ctx.beginPath();ctx.arc(x,y,3.2,0,Math.PI*2);ctx.fill(); }
  if(extractionActive && extractionMarker){ctx.strokeStyle="#55e0c1";ctx.lineWidth=2;ctx.beginPath();ctx.arc(mapX(extractionMarker.position.x),mapY(extractionMarker.position.z),6,0,Math.PI*2);ctx.stroke();}
  const px=mapX(camera.position.x), py=mapY(camera.position.z);
  ctx.save();ctx.translate(px,py);ctx.rotate(-camera.rotation.y);ctx.fillStyle="#e5b45e";ctx.beginPath();ctx.moveTo(0,-7);ctx.lineTo(5,5);ctx.lineTo(0,3);ctx.lineTo(-5,5);ctx.closePath();ctx.fill();ctx.restore();
}
function collidesAt(x:number,z:number,radius=.48) {
  for (const b of collisionBounds) {
    const closestX = THREE.MathUtils.clamp(x,b.min.x,b.max.x);
    const closestZ = THREE.MathUtils.clamp(z,b.min.z,b.max.z);
    const dx=x-closestX, dz=z-closestZ;
    if (dx*dx+dz*dz < radius*radius) return true;
  }
  return false;
}
function hasLineOfSight(from:THREE.Vector3,to:THREE.Vector3) {
  const direction=to.clone().sub(from);
  const distance=direction.length();
  direction.normalize();
  raycaster.set(from,direction);
  raycaster.near=0;
  raycaster.far=Math.max(0,distance-.45);
  const worldCollisionMeshes = mapRoots[selectedMap] ? activeMapMeshes : collisionMeshes;
  const blocked=raycaster.intersectObjects(worldCollisionMeshes,false).length>0;
  raycaster.far=Infinity;
  return !blocked;
}

function animate() {
  requestAnimationFrame(animate);
  const dt=Math.min(clock.getDelta(),.04);
  if(started && !paused) {
    if (selectedMode === "time-attack") {
      const remaining = Math.max(0, Math.ceil((timeAttackEndsAt - performance.now()) / 1000));
      setText("#objective-detail", `TIME REMAINING: ${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,"0")}`);
      if (remaining <= 0) { showEnd(true); }
    }
    const forward=new THREE.Vector3(); camera.getWorldDirection(forward); forward.y=0; forward.normalize();
    // Camera forward is -Z at yaw 0; forward × up is world +X.
    // Keep this vector positive so D moves right and A moves left.
    const right=new THREE.Vector3().crossVectors(forward,new THREE.Vector3(0,1,0)).normalize();
    const move=new THREE.Vector3();
    if(keys.has("w")) move.add(forward);
    if(keys.has("s")) move.sub(forward);
    if(keys.has("d")) move.add(right);
    if(keys.has("a")) move.sub(right);
    if(move.lengthSq()>0) {
      move.normalize().multiplyScalar(player.speed*(keys.has("shift")?player.sprint:1)*dt);
      const nextX=camera.position.x+move.x;
      const nextZ=camera.position.z+move.z;
      const radius=.34;
      const playerAlreadyOverlapping=collidesAt(camera.position.x,camera.position.z,radius);
      // Axis-separated movement allows wall sliding. If an imported map collider
      // overlaps the spawn point, allow one step out instead of trapping the player.
      if(!collidesAt(nextX,camera.position.z,radius) || playerAlreadyOverlapping) camera.position.x=nextX;
      if(!collidesAt(camera.position.x,nextZ,radius) || playerAlreadyOverlapping) camera.position.z=nextZ;
    }
    const moving = move.lengthSq() > 0;
    const t = performance.now() * .006;
    const sprinting=moving&&keys.has("shift")&&!aiming; const targetFov=aiming?Math.max(48,baseFov-19):baseFov+(sprinting?7:0); camera.fov=THREE.MathUtils.lerp(camera.fov,targetFov,1-Math.exp(-12*dt)); camera.updateProjectionMatrix();
    recoil=THREE.MathUtils.lerp(recoil,0,1-Math.exp(-10*dt));
    weaponGroup.position.z=THREE.MathUtils.lerp(weaponGroup.position.z,aiming ? .16 : 0,1-Math.exp(-12*dt));
    weaponGroup.rotation.x=THREE.MathUtils.lerp(weaponGroup.rotation.x,-recoil,1-Math.exp(-18*dt));
    swayX*=Math.exp(-8*dt); swayY*=Math.exp(-8*dt);
    reloadBlend=THREE.MathUtils.lerp(reloadBlend,player.reloading?1:0,1-Math.exp(-10*dt));
    weaponGroup.position.y = (moving ? Math.sin(t*1.8)*.012 : Math.sin(t*.55)*.004) + swayY - reloadBlend*.22;
    weaponGroup.position.x = (moving ? Math.cos(t*.9)*.009 : 0) + swayX;
    weaponGroup.rotation.z = (moving ? Math.sin(t*.9)*.012 : 0) + reloadBlend*.5;
    if(activeWorldBounds && Number.isFinite(activeWorldBounds.min.x) && Number.isFinite(activeWorldBounds.max.x)) {
      const size=activeWorldBounds.getSize(new THREE.Vector3());
      const pad=Math.min(2,Math.max(.75,Math.min(size.x,size.z)*.035));
      camera.position.x=THREE.MathUtils.clamp(camera.position.x,activeWorldBounds.min.x+pad,activeWorldBounds.max.x-pad);
      camera.position.z=THREE.MathUtils.clamp(camera.position.z,activeWorldBounds.min.z+pad,activeWorldBounds.max.z-pad);
    } else {
      camera.position.x=THREE.MathUtils.clamp(camera.position.x,-19,19);
      camera.position.z=THREE.MathUtils.clamp(camera.position.z,-39,25);
    }
    if(!player.grounded) {
      player.verticalVelocity-=22*dt; camera.position.y+=player.verticalVelocity*dt;
      if(camera.position.y<= (player.crouching?1.12:1.7)) { camera.position.y=player.crouching?1.12:1.7; player.verticalVelocity=0; player.grounded=true; }
    } else camera.position.y=(player.crouching?1.12:1.7)+(moving?Math.sin(t*(keys.has("shift")?2.6:2))*.028:0);
    if(fireHeld && locked) shoot();
    updateEffects(dt);
    for(const e of enemies) if(e.alive) {
      e.mixer?.update(dt);
      const dx=camera.position.x-e.mesh.position.x, dz=camera.position.z-e.mesh.position.z;
      const dist=Math.hypot(dx,dz);
      e.mesh.rotation.y=Math.atan2(dx,dz)+Math.PI; // models face -Z, so add PI to look at the player
      const safeDist=Math.max(dist,.001);
      let vx=0, vz=0;
      if(e.type==="rusher") {
        e.state="advance";
        if(dist>1.7) { vx=(dx/safeDist)*e.speed; vz=(dz/safeDist)*e.speed; }
      } else if(dist>15) {
        e.state="advance"; vx=(dx/safeDist)*e.speed; vz=(dz/safeDist)*e.speed;
      } else if(dist>7) {
        e.state="flank"; vx=(-dz/safeDist)*e.strafeDir*e.speed*.38+(dx/safeDist)*e.speed*.22;
        vz=(dx/safeDist)*e.strafeDir*e.speed*.38+(dz/safeDist)*e.speed*.22;
        if(Math.random()<.006) e.strafeDir*=-1;
      } else {
        e.state="engage"; vx=(-dz/safeDist)*e.speed*.28*e.strafeDir; vz=(dx/safeDist)*e.speed*.28*e.strafeDir;
      }
      // Simple local steering keeps infantry from walking through cover and building corners.
      const er=e.type==="heavy"?.7:.42;
      const nextX=e.mesh.position.x+vx*dt, nextZ=e.mesh.position.z+vz*dt;
      if(!collidesAt(nextX,e.mesh.position.z,er)) e.mesh.position.x=nextX;
      else { e.strafeDir*=-1; vx=0; }
      if(!collidesAt(e.mesh.position.x,nextZ,er)) e.mesh.position.z=nextZ;
      else { e.strafeDir*=-1; vz=0; }
      e.gait += dt*(e.type==="rusher"?13:e.state==="advance"?8:e.state==="flank"?5:2);
      const stride=(e.state==="engage"?.08:.42)*Math.sin(e.gait);
      e.leftLeg.rotation.x=stride; e.rightLeg.rotation.x=-stride;
      e.leftArm.rotation.x=-stride*.45-.22; e.rightArm.rotation.x=stride*.45-.22;
      e.mesh.position.y=Math.abs(Math.sin(e.gait*2))*(e.state==="engage"?.008:.025);
      const nowMs=performance.now();
      if(e.type==="rusher") {
        // Rushers sprint in and strike in melee.
        if(dist<2.3 && nowMs>e.attackAt) { e.attackAt=nowMs+850; damage(10+Math.floor(Math.random()*5),e.mesh.position); addShake(.35); }
      } else if(dist<29 && nowMs>e.attackAt && hasLineOfSight(new THREE.Vector3(e.mesh.position.x,1.15,e.mesh.position.z),new THREE.Vector3(camera.position.x,camera.position.y-.2,camera.position.z))) {
        const heavy=e.type==="heavy";
        e.attackAt=nowMs+(heavy ? 520+Math.random()*320 : 1050+Math.random()*850);
        const from=new THREE.Vector3(e.mesh.position.x,heavy?1.45:.98,e.mesh.position.z);
        const to=new THREE.Vector3(camera.position.x,camera.position.y-.25,camera.position.z);
        const tracerGeometry=new THREE.BufferGeometry().setFromPoints([from,to]);
        const tracer=new THREE.Line(tracerGeometry,new THREE.LineBasicMaterial({color:heavy?0xff5a3c:0xffb66b,transparent:true,opacity:.78}));
        scene.add(tracer); window.setTimeout(()=>{scene.remove(tracer);tracerGeometry.dispose();},75);
        playEnemyShot(dist);
        const hitChance=THREE.MathUtils.clamp(.72-(dist/48)-(player.crouching?.12:0)+(heavy?.12:0),.18,.72);
        if(Math.random()<hitChance) { damage(heavy ? 7+Math.floor(Math.random()*6) : 4+Math.floor(Math.random()*5),e.mesh.position); addShake(.22); }
      }
      e.marker.visible=performance.now()<uavUntil;
    }
    if (extractionActive && extractionMarker && camera.position.distanceTo(extractionMarker.position) < 2.8) {
      score += 500; showEnd(true);
    }
    if (extractionMarker) {
      const pulse = 1 + Math.sin(performance.now() * .004) * .08;
      extractionMarker.children[0].scale.setScalar(pulse);
      extractionMarker.children[1].rotation.y += dt * 1.3;
    }
    for(let i=grenadeObjects.length-1;i>=0;i--) { const g=grenadeObjects[i]; g.fuse-=dt; g.velocity.y-=18*dt; g.mesh.position.addScaledVector(g.velocity,dt); if(g.mesh.position.y<.15) {g.mesh.position.y=.15;g.velocity.y=Math.abs(g.velocity.y)*.42;g.velocity.x*=.72;g.velocity.z*=.72;} if(g.fuse<=0){detonateGrenade(g);grenadeObjects.splice(i,1);} }
    if(toastTimer>0) { toastTimer-=dt; if(toastTimer<=0) document.querySelector("#toast")!.classList.remove("show"); }
  }
  fxPass.uniforms.time.value=(performance.now()%100000)*.001;
  tickAmbience(dt);
  drawRadar();
  composer.render();
}
animate();

function openSettings(returnTo:string) {
  settingsReturnScreen=returnTo;
  document.querySelectorAll<HTMLElement>(".screen").forEach(screen=>screen.classList.add("hidden"));
  document.querySelector("#settings-screen")!.classList.remove("hidden");
  document.exitPointerLock?.();
}
function closeSettings() {
  document.querySelector("#settings-screen")!.classList.add("hidden");
  document.querySelector<HTMLElement>("#"+settingsReturnScreen)!.classList.remove("hidden");
  if(settingsReturnScreen==="pause-screen") paused=true;
}
function showMainMenu() {
  document.exitPointerLock?.(); locked=false; fireHeld=false; aiming=false; keys.clear();
  paused=true; started=false;
  document.querySelectorAll<HTMLElement>(".screen").forEach(screen=>screen.classList.add("hidden"));
  document.querySelector("#start-screen")!.classList.remove("hidden");
}
document.querySelector("#settings-start")!.addEventListener("click",()=>openSettings("start-screen"));
document.querySelector("#settings-pause")!.addEventListener("click",()=>openSettings("pause-screen"));
document.querySelector("#settings-back")!.addEventListener("click",closeSettings);
document.querySelector("#controls-start")!.addEventListener("click",()=>{
  document.querySelector("#start-screen")!.classList.add("hidden");
  document.querySelector("#controls-screen")!.classList.remove("hidden");
});
document.querySelector("#controls-back")!.addEventListener("click",()=>{
  document.querySelector("#controls-screen")!.classList.add("hidden");
  document.querySelector("#start-screen")!.classList.remove("hidden");
});
document.querySelector("#main-menu-button")!.addEventListener("click",showMainMenu);
document.querySelectorAll<HTMLButtonElement>("[data-quality]").forEach(button=>
  button.addEventListener("click",()=>applyGraphicsQuality(button.dataset.quality as "low"|"medium"|"high")));
document.querySelector<HTMLInputElement>("#sensitivity-slider")!.addEventListener("input",event=>{
  mouseSensitivity=Number((event.currentTarget as HTMLInputElement).value);
  setText("#sensitivity-value",mouseSensitivity.toFixed(4));
});
document.querySelector<HTMLInputElement>("#fov-slider")!.addEventListener("input",event=>{
  baseFov=Number((event.currentTarget as HTMLInputElement).value); setText("#fov-value",String(baseFov));
});
document.addEventListener("keydown",e=>{
  const key=e.key.toLowerCase();
  if(started && !paused && ["w","a","s","d"," ","arrowup","arrowdown","arrowleft","arrowright"].includes(key)) e.preventDefault();
  keys.add(key);
  if(e.key.toLowerCase()==="r") reload();
  if(e.key==="1") switchWeapon(0);
  if(e.key==="2") switchWeapon(1);
  if(e.key==="3") switchWeapon(2);
  if(e.key==="4") switchWeapon(3);
  if(e.key==="5") switchWeapon(4);
  if(e.key.toLowerCase()==="g") throwGrenade();
  if(e.key.toLowerCase()==="c") { player.crouching=true; }
  if(e.code==="Space" && started && !paused && player.grounded) { player.grounded=false; player.verticalVelocity=7.2; }
  if(e.key==="Escape" && started && !document.querySelector("#end-screen")!.classList.contains("hidden")) return;
  if(e.key==="Escape" && started) {
    paused=!paused;
    document.querySelector("#pause-screen")!.classList.toggle("hidden",!paused);
    if(paused) { fireHeld=false; aiming=false; document.exitPointerLock(); }
    else canvas.requestPointerLock();
  }
});
document.addEventListener("keyup",e=>{ keys.delete(e.key.toLowerCase()); if(e.key.toLowerCase()==="c") player.crouching=false; });
document.addEventListener("mousemove",e=>{
  if(!locked || paused) return;
  camera.rotation.order="YXZ";
  camera.rotation.y-=e.movementX*mouseSensitivity;
  camera.rotation.x-=e.movementY*mouseSensitivity;
  camera.rotation.x=THREE.MathUtils.clamp(camera.rotation.x,-1.45,1.45);
  swayX=THREE.MathUtils.clamp(swayX-e.movementX*.0004,-.05,.05); swayY=THREE.MathUtils.clamp(swayY+e.movementY*.0004,-.04,.04);
});
document.addEventListener("pointerlockchange",()=>{locked=document.pointerLockElement===canvas;});
canvas.addEventListener("mousedown",e=>{if(e.button===0 && locked) fireHeld=true;});
document.addEventListener("mouseup",e=>{if(e.button===0) fireHeld=false; if(e.button===2) aiming=false;});
document.addEventListener("mousedown",e=>{if(e.button===2 && locked) aiming=true;});
document.addEventListener("contextmenu",e=>e.preventDefault());
document.querySelector<HTMLSelectElement>("#mode-select")!.addEventListener("change", event => {
  selectedMode = (event.currentTarget as HTMLSelectElement).value as GameMode;
});
const mapSelect = document.querySelector<HTMLSelectElement>("#map-select");
mapSelect?.addEventListener("change", () => {
  const map = mapSelect.value as MapTheme;
  if (map in mapSources) setCombatMap(map);
});
// Load only the selected environment. Large GLB scenes are fetched on demand and
// cached after success; downloading every map at startup wastes memory and can stall
// lower-end devices before the player even deploys.
loadCombatMap(selectedMap);

document.querySelector("#start-button")!.addEventListener("click",()=>{
  document.querySelector("#start-screen")!.classList.add("hidden"); resetGame();
});
document.querySelector("#resume-button")!.addEventListener("click",()=>{
  paused=false; document.querySelector("#pause-screen")!.classList.add("hidden"); canvas.requestPointerLock();
});
document.querySelector("#restart-button")!.addEventListener("click",resetGame);
window.addEventListener("resize",()=>{
  camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight); renderer.setPixelRatio(Math.min(devicePixelRatio,pixelCap));
  composer.setPixelRatio(Math.min(devicePixelRatio,pixelCap)); composer.setSize(innerWidth,innerHeight);
});
