import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import "./style.css";

type Enemy = { mesh: THREE.Group; hp: number; speed: number; attackAt: number; alive: boolean; state: "advance" | "flank" | "engage"; strafeDir: number; marker: THREE.Mesh; leftLeg: THREE.Group; rightLeg: THREE.Group; leftArm: THREE.Group; rightArm: THREE.Group; gait: number; }
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
scene.background = new THREE.Color(0x343c40);
scene.fog = new THREE.FogExp2(0x4b514f, 0.0105);

const camera = new THREE.PerspectiveCamera(76, innerWidth / innerHeight, 0.1, 180);
camera.position.set(0, 1.7, 12);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.35));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.92;
renderer.shadowMap.autoUpdate = true;

// HDR-inspired cinematic post-processing. This expands highlight contrast and
// adds restrained bloom; actual HDR10 output still depends on the display/browser.
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(innerWidth, innerHeight),
  0.52, // strength
  0.72, // radius
  0.82  // threshold: only bright highlights bloom
);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

scene.add(new THREE.HemisphereLight(0xa9b8bd, 0x171916, 0.78));
const sun = new THREE.DirectionalLight(0xd6b28a, 2.35);
sun.position.set(-18, 32, 15); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -45; sun.shadow.camera.right = 45;
sun.shadow.camera.top = 45; sun.shadow.camera.bottom = -45;
scene.add(sun);

function applyGraphicsQuality(level: "low" | "medium" | "high") {
  const presets = {
    low: { pixelRatio: 1, shadowSize: 512, bloom: .08, shadows: false },
    medium: { pixelRatio: 1.25, shadowSize: 1024, bloom: .12, shadows: true },
    high: { pixelRatio: 1.65, shadowSize: 2048, bloom: .16, shadows: true }
  };
  const preset = presets[level];
  renderer.setPixelRatio(Math.min(devicePixelRatio,preset.pixelRatio));
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
  return new THREE.MeshStandardMaterial({ map: tex, color: 0xffffff, roughness });
}
const mat = (color: number, roughness = 0.88) => new THREE.MeshStandardMaterial({ color, roughness });
const groundMat = makeSurface("#454b49", .96, 18, 28, 65);
const concrete = makeSurface("#777a75", .92, 2, 3, 38);
const dark = makeSurface("#20272a", .8, 2, 2, 18);
const metal = new THREE.MeshStandardMaterial({ color: 0x394448, metalness: .82, roughness: .3 });
const sand = makeSurface("#81745f", .94, 2, 3, 30);
const glass = new THREE.MeshPhysicalMaterial({ color: 0x263b43, metalness: .48, roughness: .18, transparent: true, opacity: .82 });
const emissiveAmber = new THREE.MeshStandardMaterial({ color: 0xffb45c, emissive: 0xff6b24, emissiveIntensity: 1.8 });

const collisionMeshes: THREE.Mesh[] = [];
const ground = new THREE.Mesh(new THREE.PlaneGeometry(150, 150), groundMat);
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

// Procedural dusty-warzone sky: layered dusk gradient and broken cloud banks.
const skyCanvas = document.createElement("canvas");
skyCanvas.width = 1024; skyCanvas.height = 512;
const skyCtx = skyCanvas.getContext("2d")!;
const skyGradient = skyCtx.createLinearGradient(0, 0, 0, 512);
skyGradient.addColorStop(0, "#18242b");
skyGradient.addColorStop(.42, "#465052");
skyGradient.addColorStop(.72, "#77736a");
skyGradient.addColorStop(1, "#b07b58");
skyCtx.fillStyle = skyGradient; skyCtx.fillRect(0, 0, 1024, 512);
skyCtx.filter = "blur(24px)";
for (let i=0;i<95;i++) {
  const x=Math.random()*1024, y=100+Math.random()*280;
  const w=35+Math.random()*150, h=8+Math.random()*34;
  skyCtx.fillStyle=i%3===0?"rgba(20,29,32,.20)":"rgba(210,177,145,.075)";
  skyCtx.beginPath(); skyCtx.ellipse(x,y,w,h,0,0,Math.PI*2); skyCtx.fill();
}
skyCtx.filter = "none";
const skyTexture = new THREE.CanvasTexture(skyCanvas);
const sky = new THREE.Mesh(new THREE.SphereGeometry(125, 48, 28), new THREE.MeshBasicMaterial({
  map: skyTexture, side: THREE.BackSide, fog: false
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
  // Wall-mounted AC compressors, cable trays and drain pipes break up the repeated facade.
  for (let bay=0;bay<2;bay++) {
    const unitZ=z+(bay===0?-.95:.95), unitY=Math.max(2.0,h*.58);
    const ac=box(side*17.72,unitY,unitZ,.42,.48,.72,dark,false);
    ac.rotation.y=side*.035;
    box(side*17.48,unitY,unitZ,.055,.34,.5,metal,false);
    for(let vent=0;vent<4;vent++) box(side*17.44,unitY-.12+vent*.08,unitZ,.035,.025,.42,metal,false);
  }
  if(i%3===0) {
    const pipe=box(side*17.68,h*.48,z+2.72,.09,h*.94,.09,metal,false);
    pipe.position.y=h*.48;
    for(let clamp=0;clamp<4;clamp++) box(side*17.61,.22,z+2.72,.18,.045,.16,dark,false).position.y=.7+clamp*h*.22;
  }
}

// A disabled, burned-out utility vehicle provides believable street-scale cover.
const wreckBody=box(2.05,.68,-10,2.25,.72,4.15,dark);
wreckBody.rotation.y=.08; collisionMeshes.push(wreckBody);
const wreckCab=box(2.05,1.25,-10.42,1.92,.62,1.72,metal);
wreckCab.rotation.y=.08;
const sootGlass=new THREE.MeshPhysicalMaterial({color:0x11191c,metalness:.35,roughness:.42});
box(2.05,1.29,-10.42,1.72,.48,1.55,sootGlass,false);
for(const wx of [-1.08,3.18]) for(const wz of [-11.35,-8.72]) {
  const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.38,.38,.22,18),dark);
  wheel.rotation.z=Math.PI/2; wheel.position.set(wx,.38,wz); wheel.castShadow=true; scene.add(wheel);
  const hub=new THREE.Mesh(new THREE.CylinderGeometry(.14,.14,.235,12),metal);
  hub.rotation.z=Math.PI/2; hub.position.copy(wheel.position); scene.add(hub);
}
for(let i=0;i<7;i++) {
  const shard=box(1.1+(Math.random()-.5)*1.7,.12,-10+(Math.random()-.5)*2.8,.18,.12,.65,metal,false);
  shard.rotation.set(Math.random()*.3,Math.random()*Math.PI,Math.random()*.4);
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
for (const x of [-13,13]) for (const z of [-24,-5,14]) {
  box(x,3.8,z,.12,7.6,.12,dark,false);
  const lamp = new THREE.PointLight(0xffd8a1, 18, 13); lamp.position.set(x,7.2,z); scene.add(lamp);
}

// Suspended dust, drifting ash and distant smoke soften the hard procedural geometry.
const smokePositions=new Float32Array(420*3);
for(let i=0;i<420;i++) {
  const plume=i%3, baseX=plume===0?-23:plume===1?23:0, baseZ=plume===2?-31:-20;
  smokePositions[i*3]=baseX+(Math.random()-.5)*3.5;
  smokePositions[i*3+1]=Math.random()*18;
  smokePositions[i*3+2]=baseZ+(Math.random()-.5)*3.5;
}
const smokeGeometry=new THREE.BufferGeometry();
smokeGeometry.setAttribute("position",new THREE.BufferAttribute(smokePositions,3));
const smokeMaterial=new THREE.PointsMaterial({color:0x303735,size:1.65,transparent:true,opacity:.115,depthWrite:false,sizeAttenuation:true});
const smokeCloud=new THREE.Points(smokeGeometry,smokeMaterial); scene.add(smokeCloud);
const ashPositions=new Float32Array(260*3);
for(let i=0;i<260;i++) {
  ashPositions[i*3]=(Math.random()-.5)*42;
  ashPositions[i*3+1]=Math.random()*10;
  ashPositions[i*3+2]=-38+Math.random()*65;
}
const ashGeometry=new THREE.BufferGeometry();
ashGeometry.setAttribute("position",new THREE.BufferAttribute(ashPositions,3));
const ashField=new THREE.Points(ashGeometry,new THREE.PointsMaterial({color:0xb7a58b,size:.045,transparent:true,opacity:.34,depthWrite:false}));
scene.add(ashField);

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
const MAX_CAMPAIGN_WAVES = 3;
let extractionActive = false;
let sessionEpoch = 0;
let reloadToken = 0;
const radarCanvas = document.querySelector<HTMLCanvasElement>("#tactical-radar")!;
const radarCtx = radarCanvas.getContext("2d")!;
let extractionMarker: THREE.Group | null = null;
let bestScore = Number(localStorage.getItem("sw_best_score") || 0);
const grenadeObjects: { mesh: THREE.Mesh; velocity: THREE.Vector3; fuse: number }[] = [];
// Static world colliders never move, so cache their bounds instead of rebuilding Box3 objects every frame.
const collisionBounds = collisionMeshes.map(mesh => new THREE.Box3().setFromObject(mesh));

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
  try {
    audioContext ??= new AudioContext();
    if(audioContext.state === "suspended") void audioContext.resume();
    const now=audioContext.currentTime;
    const osc=audioContext.createOscillator(), gain=audioContext.createGain();
    const low=audioContext.createOscillator(), lowGain=audioContext.createGain();
    osc.type="sawtooth"; osc.frequency.setValueAtTime(activeWeapon===1?115:activeWeapon===2?185:145,now);
    osc.frequency.exponentialRampToValueAtTime(42,now+.095);
    gain.gain.setValueAtTime(.0001,now); gain.gain.exponentialRampToValueAtTime(.22,now+.004); gain.gain.exponentialRampToValueAtTime(.0001,now+.12);
    low.type="triangle"; low.frequency.setValueAtTime(62,now); low.frequency.exponentialRampToValueAtTime(28,now+.15);
    lowGain.gain.setValueAtTime(.0001,now); lowGain.gain.exponentialRampToValueAtTime(.3,now+.008); lowGain.gain.exponentialRampToValueAtTime(.0001,now+.16);
    osc.connect(gain).connect(audioContext.destination); low.connect(lowGain).connect(audioContext.destination);
    osc.start(now); osc.stop(now+.13); low.start(now); low.stop(now+.17);
  } catch { /* audio is optional; gameplay must continue */ }
}
function switchWeapon(index:number) {
  if(index<0 || index>=weapons.length || index===activeWeapon) return;
  activeWeapon=index; reloadToken++; player.reloading=false; buildWeaponVisual(index); notify(`WEAPON SELECTED — ${weapons[index].name}`);
}

function makeEnemy(x:number,z:number): Enemy {
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
  g.position.set(x,0,z); scene.add(g);
  const enemy: Enemy = { mesh:g, hp:100, speed:1.15+Math.random()*.65, attackAt:0, alive:true, state:"advance", strafeDir:Math.random()>.5?1:-1, marker, leftLeg, rightLeg, leftArm, rightArm, gait:Math.random()*Math.PI*2 };
  head.userData.hitZone = "head";
  g.children.forEach((part: THREE.Object3D) => { part.userData.enemy = enemy; });
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

function spawnWave() {
  if (wave >= MAX_CAMPAIGN_WAVES) { createExtraction(); return; }
  wave++;
  const count = Math.min(3 + wave*2, 18);
  for (let i=0;i<count;i++) {
    const a = (i/count)*Math.PI*2 + Math.random()*.3;
    const r = 23 + Math.random()*10;
    enemies.push(makeEnemy(Math.cos(a)*r, -7 + Math.sin(a)*r));
  }
  setText("#wave", String(wave).padStart(2,"0"));
  setText("#enemies-left", `HOSTILES: ${count}`);
  setText("#objective-title", wave === 1 ? "SECURE THE DISTRICT" : wave === 2 ? "REPEL THE COUNTERATTACK" : "ELIMINATE THE HEAVY UNIT");
  setText("#objective-detail", `HOSTILES REMAINING: ${count}`);
  notify(`OPERATION BLACKOUT — WAVE ${wave}/${MAX_CAMPAIGN_WAVES}`);
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
  player.reloading=true; notify("RELOADING...");
  const reloadEpoch = sessionEpoch;
  const currentReloadToken = ++reloadToken;
  window.setTimeout(()=>{
    if (reloadEpoch !== sessionEpoch || currentReloadToken !== reloadToken || !player.reloading) return;
    const needed=weapon.magazine-weapon.ammo, amount=Math.min(needed,weapon.reserve);
    weapon.ammo+=amount; weapon.reserve-=amount; player.reloading=false; updateHUD();
  },weapon.reloadMs);
}
function shoot() {
  const now=performance.now();
  const weapon=weapons[activeWeapon];
  if (now-player.lastShot<weapon.interval || player.reloading) return;
  if (weapon.ammo<=0) { notify("MAGAZINE EMPTY — PRESS R"); return; }
  player.lastShot=now; weapon.ammo--; updateHUD(); playShot(); if(!weapon.automatic) fireHeld=false;
  muzzle.intensity=aiming ? 2.8 : 5.5; recoil=Math.min(recoil+.035, .16);
  gunBody.position.z=-.48;
  window.setTimeout(()=>{ muzzle.intensity=0; gunBody.position.z=-.57; },55);
  const pellets=weapon.pellets ?? 1;
  for(let i=0;i<pellets;i++) {
    const spread=(weapon.spread ?? .003)*(aiming ? .35 : 1);
    raycaster.near=0; raycaster.far=Infinity;
    raycaster.setFromCamera(new THREE.Vector2((Math.random()-.5)*spread,(Math.random()-.5)*spread),camera);
    const targets=enemies.filter(e=>e.alive).map(e=>e.mesh);
    const hit=raycaster.intersectObjects(targets,true)[0];
    const enemy=hit?.object.userData.enemy as Enemy | undefined;
    if(enemy?.alive && hit) {
      const headshot=hit.object.userData.hitZone==="head";
      enemy.hp-=weapon.damage*(headshot?2.25:1);
      const hitFlash = enemy.mesh.children.find(part => part instanceof THREE.Mesh && part.geometry instanceof THREE.CapsuleGeometry) as THREE.Mesh | undefined;
      if(hitFlash) {
        const original = hitFlash.material as THREE.MeshStandardMaterial;
        original.emissive.setHex(0x5b2116); original.emissiveIntensity=.8;
        window.setTimeout(()=>{ original.emissive.setHex(0x000000); original.emissiveIntensity=0; },85);
      }
      if(hit.point) {
        const spark = new THREE.Mesh(new THREE.SphereGeometry(.035,6,5),new THREE.MeshBasicMaterial({color:headshot?0xffe3a0:0xffa45a}));
        spark.position.copy(hit.point); scene.add(spark);
        window.setTimeout(()=>{scene.remove(spark);spark.geometry.dispose();(spark.material as THREE.Material).dispose();},110);
      }
      const marker=document.querySelector<HTMLElement>("#hit-marker")!;
      marker.classList.toggle("headshot",headshot); marker.classList.add("show");
      window.setTimeout(()=>marker.classList.remove("show"),115);
      if(enemy.hp<=0) {
        enemy.alive=false; scene.remove(enemy.mesh); score+=headshot?150:100; objectiveKills++; totalKills++; killStreak++;
        if(killStreak===5) { uavUntil=performance.now()+12000; notify("UAV ACTIVE — HOSTILES REVEALED"); }
        else if(killStreak===10) { grenades=Math.min( grenades+1,5); killStreak=0; notify("COMBAT BONUS — FRAG RESTOCKED"); }
        updateHUD();
        if(enemies.every(e=>!e.alive)) { const epoch=sessionEpoch; window.setTimeout(()=>{if(epoch===sessionEpoch && started) spawnWave();},1800); }
      }
    }
  }
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
  const flash=new THREE.PointLight(0xffa34d,35,15); flash.position.copy(pos); scene.add(flash);
  const ring=new THREE.Mesh(new THREE.SphereGeometry(.5,16,12),new THREE.MeshBasicMaterial({color:0xffa34d,transparent:true,opacity:.48,wireframe:true})); ring.position.copy(pos); scene.add(ring);
  window.setTimeout(()=>{scene.remove(flash);scene.remove(ring);ring.geometry.dispose();},260);
  for(const enemy of enemies) if(enemy.alive) { const d=enemy.mesh.position.distanceTo(pos); if(d<8) { enemy.hp-=Math.max(0,180-d*18); if(enemy.hp<=0) { enemy.alive=false;scene.remove(enemy.mesh);score+=100;objectiveKills++;totalKills++; } } }
  updateHUD(); if(enemies.every(e=>!e.alive)) { const epoch=sessionEpoch; window.setTimeout(()=>{if(epoch===sessionEpoch && started) spawnWave();},1200); }
}
function resetGame() {
  sessionEpoch++;
  reloadToken++;
  fireHeld=false; aiming=false; keys.clear();
  enemies.forEach(e=>scene.remove(e.mesh)); enemies.length=0;
  if (extractionMarker) scene.remove(extractionMarker); extractionMarker=null; extractionActive=false;
  player.health=100; damageImmuneUntil=0; player.reloading=false; player.verticalVelocity=0; player.crouching=false; player.grounded=true;
  weapons.forEach(w=>{w.ammo=w.magazine;}); weapons[0].reserve=180; weapons[1].reserve=72; weapons[2].reserve=102; weapons[3].reserve=48; weapons[4].reserve=200;
  grenadeObjects.forEach(g=>scene.remove(g.mesh)); grenadeObjects.length=0; grenades=3; killStreak=0; totalKills=0; objectiveKills=0; activeWeapon=0; buildWeaponVisual(0);
  camera.position.set(0,1.7,12); camera.rotation.set(0,0,0); wave=0; score=0; missionStartedAt=performance.now();
  document.querySelector("#end-screen")!.classList.add("hidden");
  document.querySelector("#pause-screen")!.classList.add("hidden");
  updateHUD(); setText("#best-score", String(bestScore).padStart(6,"0")); spawnWave(); paused=false; started=true;
  canvas.requestPointerLock();
}
function damage(amount:number) {
  const now = performance.now();
  if (now < damageImmuneUntil || paused || !started) return;
  damageImmuneUntil = now + 520;
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
  const blocked=raycaster.intersectObjects(collisionMeshes,false).length>0;
  raycaster.far=Infinity;
  return !blocked;
}

function animate() {
  requestAnimationFrame(animate);
  const dt=Math.min(clock.getDelta(),.04);
  if(started && !paused) {
    const forward=new THREE.Vector3(); camera.getWorldDirection(forward); forward.y=0; forward.normalize();
    const right=new THREE.Vector3().crossVectors(forward,new THREE.Vector3(0,1,0)).normalize().negate();
    const move=new THREE.Vector3();
    if(keys.has("w")) move.add(forward);
    if(keys.has("s")) move.sub(forward);
    if(keys.has("d")) move.add(right);
    if(keys.has("a")) move.sub(right);
    if(move.lengthSq()>0) {
      move.normalize().multiplyScalar(player.speed*(keys.has("shift")?player.sprint:1)*dt);
      const nextX=camera.position.x+move.x;
      const nextZ=camera.position.z+move.z;
      if(!collidesAt(nextX,camera.position.z)) camera.position.x=nextX;
      if(!collidesAt(camera.position.x,nextZ)) camera.position.z=nextZ;
    }
    const moving = move.lengthSq() > 0;
    const t = performance.now() * .006;
    const targetFov=aiming?Math.max(48,baseFov-19):baseFov; camera.fov=THREE.MathUtils.lerp(camera.fov,targetFov,1-Math.exp(-12*dt)); camera.updateProjectionMatrix();
    recoil=THREE.MathUtils.lerp(recoil,0,1-Math.exp(-10*dt));
    weaponGroup.position.z=THREE.MathUtils.lerp(weaponGroup.position.z,aiming ? .16 : 0,1-Math.exp(-12*dt));
    weaponGroup.rotation.x=THREE.MathUtils.lerp(weaponGroup.rotation.x,-recoil,1-Math.exp(-18*dt));
    weaponGroup.position.y = moving ? Math.sin(t*1.8)*.012 : Math.sin(t*.55)*.004;
    weaponGroup.position.x = moving ? Math.cos(t*.9)*.009 : 0;
    weaponGroup.rotation.z = moving ? Math.sin(t*.9)*.012 : 0;
    camera.position.x=THREE.MathUtils.clamp(camera.position.x,-19,19);
    camera.position.z=THREE.MathUtils.clamp(camera.position.z,-39,25);
    if(!player.grounded) {
      player.verticalVelocity-=22*dt; camera.position.y+=player.verticalVelocity*dt;
      if(camera.position.y<= (player.crouching?1.12:1.7)) { camera.position.y=player.crouching?1.12:1.7; player.verticalVelocity=0; player.grounded=true; }
    } else camera.position.y=player.crouching?1.12:1.7;
    if(fireHeld && locked) shoot();
    for(const e of enemies) if(e.alive) {
      const dx=camera.position.x-e.mesh.position.x, dz=camera.position.z-e.mesh.position.z;
      const dist=Math.hypot(dx,dz);
      e.mesh.rotation.y=Math.atan2(dx,dz);
      const safeDist=Math.max(dist,.001);
      let vx=0, vz=0;
      if(dist>15) {
        e.state="advance"; vx=(dx/safeDist)*e.speed; vz=(dz/safeDist)*e.speed;
      } else if(dist>7) {
        e.state="flank"; vx=(-dz/safeDist)*e.strafeDir*e.speed*.38+(dx/safeDist)*e.speed*.22;
        vz=(dx/safeDist)*e.strafeDir*e.speed*.38+(dz/safeDist)*e.speed*.22;
        if(Math.random()<.006) e.strafeDir*=-1;
      } else {
        e.state="engage"; vx=(-dz/safeDist)*e.speed*.28*e.strafeDir; vz=(dx/safeDist)*e.speed*.28*e.strafeDir;
      }
      // Simple local steering keeps infantry from walking through cover and building corners.
      const nextX=e.mesh.position.x+vx*dt, nextZ=e.mesh.position.z+vz*dt;
      if(!collidesAt(nextX,e.mesh.position.z,.42)) e.mesh.position.x=nextX;
      else { e.strafeDir*=-1; vx=0; }
      if(!collidesAt(e.mesh.position.x,nextZ,.42)) e.mesh.position.z=nextZ;
      else { e.strafeDir*=-1; vz=0; }
      e.gait += dt*(e.state==="advance"?8:e.state==="flank"?5:2);
      const stride=(e.state==="engage"?.08:.42)*Math.sin(e.gait);
      e.leftLeg.rotation.x=stride; e.rightLeg.rotation.x=-stride;
      e.leftArm.rotation.x=-stride*.45-.22; e.rightArm.rotation.x=stride*.45-.22;
      e.mesh.position.y=Math.abs(Math.sin(e.gait*2))*(e.state==="engage"?.008:.025);
      if(dist<29 && performance.now()>e.attackAt && hasLineOfSight(new THREE.Vector3(e.mesh.position.x,1.15,e.mesh.position.z),new THREE.Vector3(camera.position.x,camera.position.y-.2,camera.position.z))) {
        e.attackAt=performance.now()+(1050+Math.random()*850);
        const from=new THREE.Vector3(e.mesh.position.x,.98,e.mesh.position.z);
        const to=new THREE.Vector3(camera.position.x,camera.position.y-.25,camera.position.z);
        const tracerGeometry=new THREE.BufferGeometry().setFromPoints([from,to]);
        const tracer=new THREE.Line(tracerGeometry,new THREE.LineBasicMaterial({color:0xffb66b,transparent:true,opacity:.78}));
        scene.add(tracer); window.setTimeout(()=>{scene.remove(tracer);tracerGeometry.dispose();},75);
        const hitChance=THREE.MathUtils.clamp(.72-(dist/48)-(player.crouching?.12:0),.18,.68);
        if(Math.random()<hitChance) damage(4+Math.floor(Math.random()*5));
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
  // Slow vertical drift gives the district a persistent dusty atmosphere without heavy effects.
  const smokeAttr=smokeGeometry.getAttribute("position") as THREE.BufferAttribute;
  for(let i=0;i<420;i++) {
    const y=smokeAttr.getY(i)+dt*(.22+(i%5)*.035);
    smokeAttr.setY(i,y>19?0:y);
    smokeAttr.setX(i,smokeAttr.getX(i)+Math.sin(performance.now()*.00018+i)*dt*.025);
  }
  smokeAttr.needsUpdate=true;
  const ashAttr=ashGeometry.getAttribute("position") as THREE.BufferAttribute;
  for(let i=0;i<260;i++) {
    ashAttr.setY(i,ashAttr.getY(i)-dt*.18);
    ashAttr.setX(i,ashAttr.getX(i)+Math.sin(performance.now()*.0004+i)*dt*.12);
    if(ashAttr.getY(i)<.1) { ashAttr.setY(i,9+Math.random()*2); ashAttr.setX(i,(Math.random()-.5)*42); }
  }
  ashAttr.needsUpdate=true;
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
  keys.add(e.key.toLowerCase());
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
});
document.addEventListener("pointerlockchange",()=>{locked=document.pointerLockElement===canvas;});
canvas.addEventListener("mousedown",e=>{if(e.button===0 && locked) fireHeld=true;});
document.addEventListener("mouseup",e=>{if(e.button===0) fireHeld=false; if(e.button===2) aiming=false;});
document.addEventListener("mousedown",e=>{if(e.button===2 && locked) aiming=true;});
document.addEventListener("contextmenu",e=>e.preventDefault());
document.querySelector("#start-button")!.addEventListener("click",()=>{
  document.querySelector("#start-screen")!.classList.add("hidden"); resetGame();
});
document.querySelector("#resume-button")!.addEventListener("click",()=>{
  paused=false; document.querySelector("#pause-screen")!.classList.add("hidden"); canvas.requestPointerLock();
});
document.querySelector("#restart-button")!.addEventListener("click",resetGame);
window.addEventListener("resize",()=>{
  camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight); renderer.setPixelRatio(Math.min(devicePixelRatio,1.35));
  composer.setSize(innerWidth,innerHeight);
});
