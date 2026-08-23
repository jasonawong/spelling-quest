import * as THREE from './vendor/three.module.min.js';

const STORAGE_KEY = 'spellingQuestIslandV1';
const SESSION_VERSION = 5;
const TOTAL_COINS = 10;
const PLAYER_RADIUS = .72;
const TURN_INPUT_SCALE = .58;
const PLAYER_TURN_RESPONSE = 7;
const CAMERA_TURN_RESPONSE = 2.8;
const WORLD_SCALE = 1.5;
const ISLAND_LENGTH_SCALE = .75;
const ISLAND_X_SCALE = WORLD_SCALE * ISLAND_LENGTH_SCALE;
const ISLAND_WIDTH_SCALE = 2.65;
const ISLAND_HALF_LENGTH = 43 * ISLAND_X_SCALE;
const STORE_POSITION = { x: 28 * ISLAND_X_SCALE, z: 0 };
const STORE_ENTRY_POSITION = { x: STORE_POSITION.x - 7, z:STORE_POSITION.z };
const START_POSITION = { x: -38 * ISLAND_X_SCALE, z: 0 };
const COIN_LOCATIONS = [
  { x: -35 * ISLAND_X_SCALE, z: 4.1 * WORLD_SCALE, label: 'west beach' },
  { x: -28 * ISLAND_X_SCALE, z: -6.1 * WORLD_SCALE, label: 'sea grass cove' },
  { x: -20 * ISLAND_X_SCALE, z: 7.2 * WORLD_SCALE, label: 'north shore' },
  { x: -13 * ISLAND_X_SCALE, z: -4.8 * WORLD_SCALE, label: 'live oak lane' },
  { x: -5 * ISLAND_X_SCALE, z: 7.7 * WORLD_SCALE, label: 'ocean overlook' },
  { x: 3 * ISLAND_X_SCALE, z: -7.4 * WORLD_SCALE, label: 'marsh trail' },
  { x: 11 * ISLAND_X_SCALE, z: 5.9 * WORLD_SCALE, label: 'station path' },
  { x: 18 * ISLAND_X_SCALE, z: -5.6 * WORLD_SCALE, label: 'palmetto grove' },
  { x: 25 * ISLAND_X_SCALE, z: 6.2 * WORLD_SCALE, label: 'village beach' },
  { x: 36 * ISLAND_X_SCALE, z: 1.8 * WORLD_SCALE, label: 'island point' }
];
const HOUSE_LOCATIONS = [
  { x:-18 * ISLAND_X_SCALE, z:-11 * WORLD_SCALE, color:0xd7d4b7, scale:1.05, rotation:.16 },
  { x:2 * ISLAND_X_SCALE, z:12 * WORLD_SCALE, color:0xb9d4c7, scale:1, rotation:-.18 },
  { x:8 * ISLAND_X_SCALE, z:-14 * WORLD_SCALE, color:0xd7c8bb, scale:1.06, rotation:.11 }
];
const TREE_LOCATIONS = {
  palms:[[-36,-8,.9],[-18,9,.86],[5,-9.5,.94],[24,8.5,.9],[37,-7,.82]],
  liveOaks:[[-22,7.5,1],[-3,8.2,.96],[18,-8,1.02]]
};

let services = null;
let active = false;
let initialized = false;
let renderer = null;
let scene = null;
let camera = null;
let sunlight = null;
let sunlightTarget = null;
let waterSurface = null;
let waterBasePositions = null;
let waterTexture = null;
const shorelineWaves = [];
const backgroundShips = [];
let canvasHost = null;
let player = null;
let playerParts = null;
let coins = [];
let storeBeacon = null;
let rewardCone = null;
let raf = 0;
let previousTime = 0;
let session = null;
let currentCoinIndex = -1;
let exitedCoinIndex = -1;
let challengeCooldownUntil = 0;
let rewardStartedAt = 0;
let lastPositionSave = 0;
let lastStoreHint = 0;
let resizeObserver = null;
let overlayPrimaryHandler = null;
let overlaySecondaryHandler = null;
const colliders = [];
const keys = new Set();
const joystickVector = new THREE.Vector2();
const pointerVector = new THREE.Vector2();
const cameraDesired = new THREE.Vector3();
const cameraLook = new THREE.Vector3();
const cameraLookDesired = new THREE.Vector3();
const cameraForward = new THREE.Vector3();
const moveVector = new THREE.Vector3();
const clockVector = new THREE.Vector3();
let cameraHeading = Math.PI / 2;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const refs = {};

function bindRefs(){
  refs.shell = document.getElementById('islandGameShell');
  refs.canvas = document.getElementById('islandCanvas');
  refs.counter = document.getElementById('islandCounter');
  refs.objective = document.getElementById('islandObjective');
  refs.storeStatus = document.getElementById('islandStoreStatus');
  refs.home = document.getElementById('islandHome');
  refs.joystick = document.getElementById('islandJoystick');
  refs.joystickKnob = document.getElementById('islandJoystickKnob');
  refs.overlay = document.getElementById('islandOverlay');
  refs.overlayEyebrow = document.getElementById('islandOverlayEyebrow');
  refs.overlayTitle = document.getElementById('islandOverlayTitle');
  refs.overlayText = document.getElementById('islandOverlayText');
  refs.overlayResults = document.getElementById('islandOverlayResults');
  refs.resultFirst = document.getElementById('islandResultFirst');
  refs.resultTries = document.getElementById('islandResultTries');
  refs.resultStars = document.getElementById('islandResultStars');
  refs.primary = document.getElementById('islandOverlayPrimary');
  refs.secondary = document.getElementById('islandOverlaySecondary');
  refs.challenge = document.getElementById('islandChallenge');
  refs.challengeStep = document.getElementById('islandChallengeStep');
  refs.challengeExit = document.getElementById('islandChallengeExit');
  refs.picture = document.getElementById('islandPicture');
  refs.hear = document.getElementById('islandHear');
  refs.form = document.getElementById('islandChallengeForm');
  refs.answer = document.getElementById('islandAnswer');
  refs.check = document.getElementById('islandCheck');
  refs.feedback = document.getElementById('islandFeedback');
  refs.rewardCaption = document.getElementById('islandRewardCaption');
}

function normalize(value){
  return (value || '').trim().toLowerCase().replace(/[^a-z'-]/g, '');
}

function shuffled(values){
  const copy = [...values];
  for(let i = copy.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function collectedCount(){
  return session ? session.collected.filter(Boolean).length : 0;
}

function currentPhase(){
  if(!session) return 'intro';
  return session.phase;
}

function createSession(){
  const pool = services.words.map(item => item.word);
  if(pool.length < TOTAL_COINS) return null;
  return {
    version: SESSION_VERSION,
    words: shuffled(pool).slice(0, TOTAL_COINS),
    collected: Array(TOTAL_COINS).fill(false),
    attempts: {},
    firstTry: 0,
    wrongAttempts: 0,
    phase: 'exploring',
    player: { ...START_POSITION, heading:Math.PI / 2 },
    startedAt: Date.now(),
    completedAt: null
  };
}

function isValidSavedSession(value){
  if(!value || ![1, 2, 3, 4, SESSION_VERSION].includes(value.version) || !Array.isArray(value.words) || value.words.length !== TOTAL_COINS) return false;
  if(!Array.isArray(value.collected) || value.collected.length !== TOTAL_COINS) return false;
  const available = new Set(services.words.map(item => item.word));
  return value.words.every(word => available.has(word));
}

function loadSession(){
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if(!isValidSavedSession(saved)) return null;
    if(saved.version !== SESSION_VERSION){
      const sourceScale = ({ 1:1, 2:4, 3:2, 4:WORLD_SCALE })[saved.version] || WORLD_SCALE;
      const positionScale = WORLD_SCALE / sourceScale;
      saved.version = SESSION_VERSION;
      saved.player = {
        x:saved.player?.x == null ? START_POSITION.x : saved.player.x * positionScale * ISLAND_LENGTH_SCALE,
        z:saved.player?.z == null ? START_POSITION.z : saved.player.z * positionScale,
        heading:saved.player?.heading ?? Math.PI / 2
      };
    }
    return saved;
  } catch {
    return null;
  }
}

function persistSession(){
  if(!session) return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(session)); } catch {}
}

const toonBands = new THREE.DataTexture(new Uint8Array([48, 126, 204, 255]), 4, 1, THREE.RedFormat);
toonBands.minFilter = THREE.NearestFilter;
toonBands.magFilter = THREE.NearestFilter;
toonBands.generateMipmaps = false;
toonBands.needsUpdate = true;
const inkMaterial = new THREE.MeshBasicMaterial({ color:0x263737, side:THREE.BackSide, depthWrite:true });

function material(color, roughness = .78, metalness = 0, options = {}){
  return new THREE.MeshToonMaterial({ color, gradientMap:toonBands, ...options });
}

function mesh(geometry, mat, cast = true, receive = true){
  const item = new THREE.Mesh(geometry, mat);
  item.castShadow = cast;
  item.receiveShadow = receive;
  return item;
}

function addInkOutline(group, thickness = .025, minRadius = .12){
  const targets = [];
  group.traverse(item => {
    if(!item.isMesh || item.userData?.isInkOutline) return;
    if(['PlaneGeometry','ShapeGeometry'].includes(item.geometry?.type)) return;
    item.geometry.computeBoundingSphere();
    if((item.geometry.boundingSphere?.radius || 0) < minRadius) return;
    if(item.material?.transparent && item.material.opacity < .9) return;
    targets.push(item);
  });
  targets.forEach(item => {
    const outline = new THREE.Mesh(item.geometry, inkMaterial);
    outline.userData.isInkOutline = true;
    outline.scale.setScalar(1 + thickness);
    outline.castShadow = false;
    outline.receiveShadow = false;
    outline.renderOrder = -1;
    item.add(outline);
  });
}

function baseIslandHalfWidth(x, inset = 0){
  const normalizedX = Math.min(1, Math.abs(x) / (ISLAND_HALF_LENGTH - inset));
  return Math.max(3.5 * ISLAND_WIDTH_SCALE, (5.4 + 6.2 * Math.sqrt(Math.max(0, 1 - normalizedX * normalizedX))) * ISLAND_WIDTH_SCALE - inset * .58);
}

function islandEdge(x, side = 1, inset = 0){
  const base = baseIslandHalfWidth(x, inset);
  const edgeFade = Math.sqrt(Math.max(0, 1 - Math.pow(Math.abs(x) / Math.max(1, ISLAND_HALF_LENGTH - inset), 2)));
  const centerDrift = Math.sin(x * .055) * 1.25 * WORLD_SCALE * edgeFade;
  const phase = side > 0 ? .35 : 2.4;
  const shoreline = (
    Math.sin(x * .13 + phase) * 1.05 +
    Math.sin(x * .31 + phase * 1.7) * .42 +
    Math.sin(x * .047 + phase * .6) * .72
  ) * WORLD_SCALE * edgeFade;
  return centerDrift + side * base + shoreline;
}

function islandHalfWidth(x, inset = 0){
  return (islandEdge(x, 1, inset) - islandEdge(x, -1, inset)) / 2;
}

function buildIslandShape(inset = 0){
  const shape = new THREE.Shape();
  const minX = -ISLAND_HALF_LENGTH + inset;
  const maxX = ISLAND_HALF_LENGTH - inset;
  for(let i = 0; i <= 96; i++){
    const x = minX + (maxX - minX) * (i / 96);
    const z = islandEdge(x, 1, inset);
    if(i === 0) shape.moveTo(x, z); else shape.lineTo(x, z);
  }
  for(let i = 96; i >= 0; i--){
    const x = minX + (maxX - minX) * (i / 96);
    shape.lineTo(x, islandEdge(x, -1, inset));
  }
  shape.closePath();
  return shape;
}

function addCollider(x, z, radius){
  colliders.push({ x, z, radius });
}

function makeCanvasTexture(text, foreground, background){
  const surface = document.createElement('canvas');
  surface.width = 512;
  surface.height = 160;
  const context = surface.getContext('2d');
  context.fillStyle = background;
  context.fillRect(0, 0, surface.width, surface.height);
  context.fillStyle = foreground;
  const lines = String(text).split('\n');
  let fontSize = 62;
  context.font = `900 ${fontSize}px ui-rounded, system-ui, sans-serif`;
  while(Math.max(...lines.map(line => context.measureText(line).width)) > 452 && fontSize > 28){
    fontSize -= 2;
    context.font = `900 ${fontSize}px ui-rounded, system-ui, sans-serif`;
  }
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  const lineHeight = Math.min(70, fontSize * 1.04);
  const startY = surface.height / 2 - ((lines.length - 1) * lineHeight) / 2 + 2;
  lines.forEach((line,index) => context.fillText(line, surface.width / 2, startY + index * lineHeight));
  const texture = new THREE.CanvasTexture(surface);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makePalmettoTexture(){
  const surface = document.createElement('canvas');
  surface.width = 160;
  surface.height = 160;
  const context = surface.getContext('2d');
  context.clearRect(0,0,160,160);
  context.strokeStyle = '#f4dd9a';
  context.fillStyle = '#f4dd9a';
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.lineWidth = 10;
  context.beginPath();
  context.moveTo(80,136);
  context.quadraticCurveTo(72,102,82,66);
  context.stroke();
  const crownX = 82;
  const crownY = 62;
  [-1.4,-1.05,-.7,-.35,0,.35,.7,1.05,1.4].forEach((angle,index) => {
    const length = 48 - Math.abs(index - 4) * 3;
    context.lineWidth = 7;
    context.beginPath();
    context.moveTo(crownX,crownY);
    context.quadraticCurveTo(crownX + Math.sin(angle) * length * .55,crownY - Math.cos(angle) * length * .42,crownX + Math.sin(angle) * length,crownY - Math.cos(angle) * length);
    context.stroke();
  });
  context.lineWidth = 6;
  context.beginPath();
  context.arc(80,139,42,.15,Math.PI - .15);
  context.stroke();
  const texture = new THREE.CanvasTexture(surface);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeGroundTexture(base, flecks){
  const surface = document.createElement('canvas');
  surface.width = 512;
  surface.height = 512;
  const context = surface.getContext('2d');
  context.fillStyle = base;
  context.fillRect(0, 0, 512, 512);
  for(let i = 0; i < 48; i++){
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const radius = 18 + Math.random() * 72;
    const wash = context.createRadialGradient(x,y,0,x,y,radius);
    wash.addColorStop(0,`${flecks[i % flecks.length]}35`);
    wash.addColorStop(1,`${flecks[i % flecks.length]}00`);
    context.fillStyle = wash;
    context.fillRect(x-radius,y-radius,radius*2,radius*2);
  }
  for(let i = 0; i < 74; i++){
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const width = 12 + Math.random() * 46;
    const height = 4 + Math.random() * 15;
    context.globalAlpha = .06 + Math.random() * .12;
    context.fillStyle = flecks[(i + 2) % flecks.length];
    context.beginPath();
    context.moveTo(x - width * .55, y);
    context.quadraticCurveTo(x - width * .2, y - height, x + width * .14, y - height * .25);
    context.quadraticCurveTo(x + width * .62, y + height * .15, x + width * .4, y + height * .7);
    context.quadraticCurveTo(x - width * .1, y + height, x - width * .55, y);
    context.fill();
  }
  for(let i = 0; i < 2600; i++){
    context.globalAlpha = .06 + Math.random() * .2;
    context.fillStyle = flecks[i % flecks.length];
    const size = .45 + Math.random() * 2.8;
    context.beginPath();
    context.arc(Math.random() * 512, Math.random() * 512, size, 0, Math.PI * 2);
    context.fill();
  }
  for(let i = 0; i < 360; i++){
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const length = 3 + Math.random() * 11;
    context.globalAlpha = .08 + Math.random() * .17;
    context.strokeStyle = flecks[(i + 1) % flecks.length];
    context.lineWidth = .6 + Math.random() * 1.4;
    context.beginPath();
    context.moveTo(x,y);
    context.lineTo(x + length,y + (Math.random() - .5) * 4);
    context.stroke();
  }
  context.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(surface);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(24, 11);
  texture.anisotropy = Math.min(8, renderer?.capabilities?.getMaxAnisotropy?.() || 1);
  return texture;
}

function makeWaterTexture(){
  const surface = document.createElement('canvas');
  surface.width = 512;
  surface.height = 256;
  const context = surface.getContext('2d');
  const gradient = context.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, '#5f9fae');
  gradient.addColorStop(.5, '#78bbc1');
  gradient.addColorStop(1, '#9ad0ca');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 512, 256);
  for(let row = 0; row < 44; row++){
    const y = 5 + row * 6 + Math.sin(row * 1.7) * 2;
    context.strokeStyle = row % 3 ? 'rgba(244,246,222,.28)' : 'rgba(38,91,102,.17)';
    context.lineWidth = row % 3 ? 1.4 : 2.4;
    context.beginPath();
    for(let x = -10; x <= 522; x += 12){
      const waveY = y + Math.sin(x * .055 + row * .7) * 2.2;
      if(x === -10) context.moveTo(x, waveY); else context.lineTo(x, waveY);
    }
    context.stroke();
  }
  const texture = new THREE.CanvasTexture(surface);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(7, 5);
  texture.anisotropy = Math.min(8, renderer?.capabilities?.getMaxAnisotropy?.() || 1);
  return texture;
}

function makeMasonryTexture(){
  const surface = document.createElement('canvas');
  surface.width = 256;
  surface.height = 256;
  const context = surface.getContext('2d');
  context.fillStyle = '#8c887f';
  context.fillRect(0, 0, 256, 256);
  context.strokeStyle = 'rgba(55,54,49,.35)';
  context.lineWidth = 3;
  for(let y = 0; y <= 256; y += 32){
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(256, y);
    context.stroke();
    const offset = (y / 32) % 2 ? 32 : 0;
    for(let x = offset; x <= 256; x += 64){
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x, y + 32);
      context.stroke();
    }
  }
  for(let i = 0; i < 180; i++){
    context.fillStyle = `rgba(${70 + i % 35},${67 + i % 28},${59 + i % 22},.16)`;
    context.fillRect(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 5, 2 + Math.random() * 4);
  }
  const texture = new THREE.CanvasTexture(surface);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 2);
  return texture;
}

function makeFabricTexture(base, thread){
  const surface = document.createElement('canvas');
  surface.width = 128;
  surface.height = 128;
  const context = surface.getContext('2d');
  context.fillStyle = base;
  context.fillRect(0, 0, 128, 128);
  context.strokeStyle = thread;
  context.globalAlpha = .22;
  context.lineWidth = .7;
  for(let i = 0; i <= 128; i += 4){
    context.beginPath(); context.moveTo(i,0); context.lineTo(i,128); context.stroke();
    context.beginPath(); context.moveTo(0,i); context.lineTo(128,i); context.stroke();
  }
  for(let i = 0; i < 240; i++){
    context.globalAlpha = .04 + Math.random() * .09;
    context.fillStyle = i % 2 ? '#ffffff' : '#172f3a';
    context.fillRect(Math.random() * 128, Math.random() * 128, 1, 1);
  }
  context.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(surface);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 4);
  return texture;
}

function fabricMaterial(base, thread, roughness = .72){
  const texture = makeFabricTexture(base, thread);
  return new THREE.MeshToonMaterial({
    color:0xffffff,
    map:texture,
    gradientMap:toonBands,
    bumpMap:texture,
    bumpScale:.018
  });
}

function cylinderBetween(start, end, radius, mat, radialSegments = 10){
  const direction = new THREE.Vector3().subVectors(end, start);
  const branch = mesh(new THREE.CylinderGeometry(radius * .72, radius, direction.length(), radialSegments), mat);
  branch.position.copy(start).add(end).multiplyScalar(.5);
  branch.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
  return branch;
}

function addWindow(group, x, y, z, scale = 1){
  const frame = mesh(new THREE.BoxGeometry(.86 * scale, .92 * scale, .12), material(0xf6f0df), false);
  const glass = mesh(new THREE.BoxGeometry(.66 * scale, .72 * scale, .14), material(0x78c7d7, .18, .02, { emissive:0x173a43, emissiveIntensity:.12 }), false);
  const dividerV = mesh(new THREE.BoxGeometry(.06 * scale, .72 * scale, .17), material(0xf6f0df), false);
  const dividerH = mesh(new THREE.BoxGeometry(.66 * scale, .06 * scale, .17), material(0xf6f0df), false);
  [frame, glass, dividerV, dividerH].forEach(item => item.position.set(x, y, z));
  group.add(frame, glass, dividerV, dividerH);
}

function addHouse(x, z, color, scale = 1, rotation = 0){
  const group = new THREE.Group();
  const wall = material(color, .72);
  const timber = material(0x7a543b, .88);
  const trim = material(0xf8f0dd, .76);
  [-1.35, 1.35].forEach(px => [-1.1, 1.1].forEach(pz => {
    const stilt = mesh(new THREE.CylinderGeometry(.13 * scale, .17 * scale, .9 * scale, 10), timber);
    stilt.position.set(px * scale, .45 * scale, pz * scale);
    group.add(stilt);
  }));
  const body = mesh(new THREE.BoxGeometry(4.2 * scale, 2.65 * scale, 3.45 * scale), wall);
  body.position.y = 2.16 * scale;
  const floor = mesh(new THREE.BoxGeometry(4.65 * scale, .18 * scale, 4.1 * scale), timber);
  floor.position.y = .92 * scale;
  const roofLeft = mesh(new THREE.BoxGeometry(2.9 * scale, .18 * scale, 4.25 * scale), material(0x795044, .9));
  const roofRight = roofLeft.clone();
  roofLeft.position.set(-1.08 * scale, 3.72 * scale, 0);
  roofRight.position.set(1.08 * scale, 3.72 * scale, 0);
  roofLeft.rotation.z = -.47;
  roofRight.rotation.z = .47;
  const porch = mesh(new THREE.BoxGeometry(4.5 * scale, .16 * scale, 1.25 * scale), timber);
  porch.position.set(0, 1.05 * scale, 2.18 * scale);
  const door = mesh(new THREE.BoxGeometry(.85 * scale, 1.75 * scale, .16), material(0xa66f45), false);
  door.position.set(0, 1.92 * scale, 1.79 * scale);
  const knob = mesh(new THREE.SphereGeometry(.055 * scale, 8, 6), material(0xc99d45, .35, .5), false);
  knob.position.set(.27 * scale, 1.9 * scale, 1.9 * scale);
  group.add(body, floor, roofLeft, roofRight, porch, door, knob);
  addWindow(group, -1.35 * scale, 2.27 * scale, 1.79 * scale, scale);
  addWindow(group, 1.35 * scale, 2.27 * scale, 1.79 * scale, scale);
  [-1.9, 1.9].forEach(px => {
    const post = mesh(new THREE.CylinderGeometry(.055 * scale, .065 * scale, 1.45 * scale, 8), trim);
    post.position.set(px * scale, 1.75 * scale, 2.65 * scale);
    group.add(post);
  });
  const rail = mesh(new THREE.BoxGeometry(4 * scale, .08 * scale, .08 * scale), trim);
  rail.position.set(0, 1.62 * scale, 2.65 * scale);
  group.add(rail);
  for(let i = 0; i < 3; i++){
    const step = mesh(new THREE.BoxGeometry(1.25 * scale, .14 * scale, .42 * scale), timber);
    step.position.set(0, (.74 - i * .2) * scale, (2.55 + i * .34) * scale);
    group.add(step);
  }
  group.position.set(x, 0, z);
  group.rotation.y = rotation;
  addInkOutline(group, .028, .14);
  scene.add(group);
  addCollider(x, z, 2.8 * scale);
  return group;
}

function addPalm(x, z, scale = 1){
  const group = new THREE.Group();
  const trunkMat = material(0x81725c, .96);
  const scarMat = material(0x5f5547, .98);
  const height = 7.6 * scale;
  const segments = 12;
  for(let i = 0; i < segments; i++){
    const progress = i / (segments - 1);
    const segmentHeight = height / segments + .05;
    const topRadius = (.3 - progress * .055) * scale;
    const bottomRadius = (.38 - progress * .075) * scale;
    const segment = mesh(new THREE.CylinderGeometry(topRadius, bottomRadius, segmentHeight, 12), trunkMat);
    segment.position.set(Math.sin(i * .31) * .055 * scale, (i + .5) * height / segments, Math.cos(i * .27) * .035 * scale);
    segment.rotation.z = -.009 * i;
    group.add(segment);
    const ring = mesh(new THREE.TorusGeometry((.34 - progress * .065) * scale, .026 * scale, 5, 12), scarMat, false);
    ring.rotation.x = Math.PI / 2;
    ring.position.copy(segment.position);
    ring.position.y -= segmentHeight * .48;
    group.add(ring);
  }
  for(let i = 0; i < 18; i++){
    const angle = i / 18 * Math.PI * 2;
    const boot = mesh(new THREE.ConeGeometry(.11 * scale,.42 * scale,5), scarMat,false);
    boot.position.set(Math.cos(angle) * .31 * scale,(height - .7 * scale) + (i % 3) * .19 * scale,Math.sin(angle) * .31 * scale);
    boot.rotation.z = Math.PI / 2;
    boot.rotation.y = -angle;
    group.add(boot);
  }
  const fanShape = new THREE.Shape();
  fanShape.moveTo(0,0);
  fanShape.lineTo(-.72 * scale,1.28 * scale);
  fanShape.bezierCurveTo(-.38 * scale,1.72 * scale,.38 * scale,1.72 * scale,.72 * scale,1.28 * scale);
  fanShape.lineTo(0,0);
  for(let i = 0; i < 16; i++){
    const angle = i / 16 * Math.PI * 2;
    const leaf = mesh(
      new THREE.ShapeGeometry(fanShape, 10),
      material(i % 3 ? 0x3f7851 : 0x5b9062, .88, 0, { side:THREE.DoubleSide }),
      false,
      false
    );
    leaf.position.set(0,height - .08 * scale,0);
    leaf.rotation.x = -Math.PI / 2 + .28 + (i % 3) * .11;
    leaf.rotation.z = angle;
    leaf.scale.y = .95 + (i % 4) * .06;
    group.add(leaf);
    const ribEnd = new THREE.Vector3(Math.cos(angle) * 1.38 * scale,height + (.18 + (i % 3) * .09) * scale,Math.sin(angle) * 1.38 * scale);
    group.add(cylinderBetween(new THREE.Vector3(0,height - .05 * scale,0),ribEnd,.035 * scale,material(0x71815a,.9),7));
  }
  const fruitMat = material(0x393c2b,.95);
  for(let i = 0; i < 9; i++){
    const fruit = mesh(new THREE.SphereGeometry(.055 * scale,7,5),fruitMat,false);
    fruit.position.set((i % 3 - 1) * .1 * scale,height - (.48 + Math.floor(i / 3) * .1) * scale,.13 * scale);
    group.add(fruit);
  }
  group.position.set(x, 0, z);
  addInkOutline(group, .026, .14);
  scene.add(group);
  addCollider(x, z, .62 * scale);
  return group;
}

function addLiveOak(x, z, scale = 1){
  const group = new THREE.Group();
  const trunkMat = material(0x5e5143, .98);
  const trunkLight = material(0x766653,.98);
  const canopyMats = [material(0x355d45, .92), material(0x477555, .9), material(0x5c8561, .88)];
  const trunk = mesh(new THREE.CylinderGeometry(.5 * scale, .82 * scale, 4.25 * scale, 14), trunkMat);
  trunk.position.y = 2.05 * scale;
  group.add(trunk);
  [[0,3.45,0,-3.25,4.05,.3],[0,3.4,0,3.45,4.18,.15],[-.2,3.7,0,-2.1,5.05,-1.2],[.25,3.65,0,2.25,4.95,-1.15],[-2.6,4,.2,-4.1,4.3,1.05],[2.7,4.1,.1,4.25,4.38,.95]].forEach(([sx,sy,sz,ex,ey,ez], index) => {
    group.add(cylinderBetween(
      new THREE.Vector3(sx * scale, sy * scale, sz * scale),
      new THREE.Vector3(ex * scale, ey * scale, ez * scale),
      Math.max(.12,.3 - index * .027) * scale,
      index % 2 ? trunkMat : trunkLight,
      12
    ));
  });
  [[-.45,.05,0],[-.28,.03,.15],[.32,.04,-.12],[.52,.06,.1]].forEach(([rx,ry,rz],index) => {
    const root = cylinderBetween(new THREE.Vector3(rx * scale,.15 * scale,rz * scale),new THREE.Vector3((rx * 3.4) * scale,.035,(rz * 3.4) * scale),(.16 - index * .015) * scale,trunkMat,10);
    group.add(root);
  });
  const canopyPositions = [[0,5.05,0],[-2.2,4.75,.3],[2.2,4.88,.25],[-1.15,5.55,-1.35],[1.25,5.45,-1.3],[-3.65,4.55,1.05],[3.7,4.62,1],[0,5.25,1.65],[-2.9,4.9,-.7],[2.95,5,-.65]];
  canopyPositions.forEach(([px,py,pz], index) => {
    const crown = mesh(new THREE.IcosahedronGeometry((index ? 1.7 : 2.15) * scale, 2), canopyMats[index % canopyMats.length], true);
    crown.scale.set(1.3, .62, 1.02);
    crown.position.set(px * scale, py * scale, pz * scale);
    group.add(crown);
  });
  const mossMat = material(0x8b9676, .96);
  for(let i = 0; i < 16; i++){
    const moss = mesh(new THREE.CylinderGeometry(.015 * scale, .027 * scale, (1.25 + i % 4 * .32) * scale, 5), mossMat, false);
    moss.position.set((-3.5 + i * .47) * scale,(4.25 + (i % 3) * .22) * scale,(.75 - (i % 4) * .5) * scale);
    moss.rotation.z = Math.sin(i * 1.4) * .08;
    group.add(moss);
  }
  group.position.set(x, 0, z);
  addInkOutline(group, .026, .16);
  scene.add(group);
  addCollider(x, z, 1.05 * scale);
  return group;
}

function addLighthouse(){
  const group = new THREE.Group();
  const aluminumWhite = material(0xe8e9e4, .42, .2);
  const aluminumBlack = material(0x222a2d, .5, .18);
  const base = mesh(new THREE.BoxGeometry(5.2, 2.7, 5), material(0xd9dbd5, .58, .08));
  base.position.y = 1.35;
  group.add(base);
  const baseDoor = mesh(new THREE.BoxGeometry(1.1, 1.9, .14), material(0x273b43, .62), false);
  baseDoor.position.set(0, 1.05, 2.56);
  group.add(baseDoor);
  const segmentHeight = 1.08;
  for(let i = 0; i < 15; i++){
    const lowerRadius = 1.72 - i * .035;
    const upperRadius = lowerRadius - .045;
    const segment = mesh(new THREE.CylinderGeometry(upperRadius, lowerRadius, segmentHeight, 3), i < 8 ? aluminumWhite : aluminumBlack);
    segment.position.y = 2.72 + segmentHeight / 2 + i * segmentHeight;
    segment.rotation.y = Math.PI / 6;
    group.add(segment);
    const seam = mesh(new THREE.CylinderGeometry(upperRadius + .02, upperRadius + .02, .035, 3), material(i < 8 ? 0xaeb4b2 : 0x090d0f, .55, .25), false);
    seam.position.y = 3.24 + i * segmentHeight;
    seam.rotation.y = Math.PI / 6;
    group.add(seam);
  }
  for(let i = 0; i < 6; i++){
    const window = mesh(new THREE.BoxGeometry(.34, .42, .07), material(0x8dc9d0, .22, .08, { emissive:0x193f49, emissiveIntensity:.18 }), false);
    window.position.set(0, 4.6 + i * 2.05, 1.61 - i * .06);
    group.add(window);
  }
  const towerTop = 2.72 + segmentHeight * 15;
  const gallery = mesh(new THREE.CylinderGeometry(1.75, 1.75, .24, 3), aluminumBlack);
  gallery.position.y = towerTop + .1;
  gallery.rotation.y = Math.PI / 6;
  const lamp = mesh(new THREE.CylinderGeometry(1.08, 1.18, 1.45, 8), material(0x9fe0e5, .18, .12, { transparent:true, opacity:.8, emissive:0xcafcff, emissiveIntensity:.24 }));
  lamp.position.y = towerTop + .93;
  const roof = mesh(new THREE.ConeGeometry(1.4, .95, 3), aluminumBlack);
  roof.position.y = towerTop + 2.08;
  roof.rotation.y = Math.PI / 6;
  group.add(gallery, lamp, roof);
  group.position.set(-33 * WORLD_SCALE, 0, 7 * WORLD_SCALE);
  scene.add(group);
  addCollider(group.position.x, group.position.z, 3.15);
}

function addFort(){
  const group = new THREE.Group();
  const masonryMap = makeMasonryTexture();
  const stone = material(0xffffff, .92, 0, { map:masonryMap, bumpMap:masonryMap, bumpScale:.08 });
  const earth = material(0x61734b, .98);
  const courtyard = mesh(new THREE.PlaneGeometry(17, 9), material(0x758a5c, .95), false, true);
  courtyard.rotation.x = -Math.PI / 2;
  courtyard.position.y = .03;
  group.add(courtyard);
  const backWall = mesh(new THREE.BoxGeometry(23, 3.4, 2.4), stone);
  backWall.position.set(0, 1.7, -6.5);
  const sideLeft = mesh(new THREE.BoxGeometry(2.4, 3.4, 11), stone);
  const sideRight = sideLeft.clone();
  sideLeft.position.set(-10.3, 1.7, -.4);
  sideRight.position.set(10.3, 1.7, -.4);
  const frontLeft = mesh(new THREE.BoxGeometry(9.2, 3.4, 2.4), stone);
  const frontRight = frontLeft.clone();
  frontLeft.position.set(-6.9, 1.7, 5.3);
  frontRight.position.set(6.9, 1.7, 5.3);
  group.add(backWall, sideLeft, sideRight, frontLeft, frontRight);
  [[-9.4,-5.5,-.35],[9.4,-5.5,.35],[-9.4,4.4,.35],[9.4,4.4,-.35]].forEach(([x,z,rotation]) => {
    const bastion = mesh(new THREE.BoxGeometry(5.8, 3.6, 4.8), stone);
    bastion.position.set(x, 1.8, z);
    bastion.rotation.y = rotation;
    const berm = mesh(new THREE.BoxGeometry(5.9, .42, 4.9), earth);
    berm.position.set(x, 3.72, z);
    berm.rotation.y = rotation;
    group.add(bastion, berm);
  });
  const rampartTop = [
    [0,3.52,-6.5,23,2.5],[-10.3,3.52,-.4,2.5,11],[10.3,3.52,-.4,2.5,11],[-6.9,3.52,5.3,9.2,2.5],[6.9,3.52,5.3,9.2,2.5]
  ];
  rampartTop.forEach(([x,y,z,w,d]) => {
    const grassCap = mesh(new THREE.BoxGeometry(w,.32,d), earth);
    grassCap.position.set(x,y,z);
    group.add(grassCap);
  });
  const entry = mesh(new THREE.BoxGeometry(3.2, 2.25, .35), material(0x242828, .96), false);
  entry.position.set(0, 1.15, 5.38);
  group.add(entry);
  const magazine = mesh(new THREE.BoxGeometry(5.8, 2.2, 3.4), material(0x87634b, .9));
  magazine.position.set(2.5, 1.1, -.8);
  const magazineRoof = mesh(new THREE.ConeGeometry(4.2, 1.45, 4), material(0x4e4942, .94));
  magazineRoof.position.set(2.5, 2.65, -.8);
  magazineRoof.rotation.y = Math.PI / 4;
  group.add(magazine, magazineRoof);
  const cannonMat = material(0x20272a, .5, .58);
  [-6,0,6].forEach((x,index) => {
    const barrel = mesh(new THREE.CylinderGeometry(.18,.28,2.5,12), cannonMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(x,4.05,-6.55);
    barrel.rotation.z = (index - 1) * .08;
    group.add(barrel);
  });
  group.position.set(-21 * WORLD_SCALE, 0, -8.5 * WORLD_SCALE);
  group.rotation.y = -.04;
  scene.add(group);
  addCollider(group.position.x, group.position.z, 12.5);
}

function addIceCreamStore(){
  const group = new THREE.Group();
  const body = mesh(new THREE.BoxGeometry(7.2, 4.2, 5.6), material(0xdbaea2, .72));
  body.position.y = 2.1;
  group.add(body);
  const roof = mesh(new THREE.ConeGeometry(5.35, 2.15, 4), material(0x426f64, .82));
  roof.position.y = 5.72;
  roof.rotation.y = Math.PI / 4;
  group.add(roof);
  const awningGroup = new THREE.Group();
  for(let i = 0; i < 9; i++){
    const stripe = mesh(new THREE.BoxGeometry(.75, .24, 1.3), material(i % 2 ? 0xe95c63 : 0xfff4df), false);
    stripe.position.set(-3 + i * .75, 3.25, 3.2);
    stripe.rotation.x = -.2;
    awningGroup.add(stripe);
  }
  group.add(awningGroup);
  const counter = mesh(new THREE.BoxGeometry(4.8, 1.45, .72), material(0xfff4df));
  counter.position.set(0, 1.45, 2.95);
  group.add(counter);
  const signTexture = makeCanvasTexture("Sullivan's Island\nIce Cream", '#263737', '#fff7e8');
  const signBoard = mesh(new THREE.BoxGeometry(7.35, 1.92, .2), material(0x263737), false);
  signBoard.position.set(0, 7.65, .3);
  const sign = mesh(new THREE.PlaneGeometry(7, 1.68), new THREE.MeshBasicMaterial({ map:signTexture, transparent:false }), false, false);
  sign.position.set(0, 7.65, .415);
  const signPostLeft = mesh(new THREE.BoxGeometry(.14, 1.35, .14), material(0x263737), false);
  const signPostRight = signPostLeft.clone();
  signPostLeft.position.set(-2.22, 6.5, .3);
  signPostRight.position.set(2.22, 6.5, .3);
  group.add(signBoard, sign, signPostLeft, signPostRight);
  const serviceWindow = mesh(new THREE.BoxGeometry(5.05, 1.35, .16), material(0x67bed0, .2, .02, { emissive:0x153a45, emissiveIntensity:.12 }), false);
  serviceWindow.position.set(0, 2.55, 2.84);
  group.add(serviceWindow);
  for(let i = -2; i <= 2; i++){
    const mullion = mesh(new THREE.BoxGeometry(.06, 1.35, .19), material(0xfff4df), false);
    mullion.position.set(i, 2.55, 2.94);
    group.add(mullion);
  }
  const coneSign = createIceCreamCone(.68);
  coneSign.position.set(3.1, 6.32, .4);
  coneSign.rotation.z = -.12;
  group.add(coneSign);
  group.position.set(STORE_POSITION.x, 0, STORE_POSITION.z);
  group.rotation.y = -Math.PI / 2;
  addInkOutline(group, .028, .14);
  scene.add(group);
  addCollider(STORE_POSITION.x, STORE_POSITION.z, 4.25);

  storeBeacon = new THREE.Group();
  const ringMat = new THREE.MeshStandardMaterial({ color:0xffd34e, emissive:0xf7a500, emissiveIntensity:.7, roughness:.4, transparent:true, opacity:.88 });
  for(let i = 0; i < 3; i++){
    const ring = mesh(new THREE.TorusGeometry(1.2 + i * .2, .11, 8, 28), ringMat, false, false);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 4.6 + i * .65;
    storeBeacon.add(ring);
  }
  const beam = mesh(new THREE.CylinderGeometry(.18, .65, 8, 12), new THREE.MeshBasicMaterial({ color:0xffe36a, transparent:true, opacity:.28 }), false, false);
  beam.position.y = 4;
  storeBeacon.add(beam);
  storeBeacon.position.set(STORE_POSITION.x, 0, STORE_POSITION.z);
  storeBeacon.visible = false;
  scene.add(storeBeacon);
}

function createIceCreamCone(scale = 1){
  const group = new THREE.Group();
  const cone = mesh(new THREE.ConeGeometry(.42 * scale, 1.15 * scale, 12), material(0xd49b4c), true);
  cone.position.y = .5 * scale;
  cone.rotation.z = Math.PI;
  group.add(cone);
  const flavors = [0xffb7c8, 0xfff0b6, 0x96d887];
  flavors.forEach((color, index) => {
    const scoop = mesh(new THREE.SphereGeometry(.48 * scale, 14, 10), material(color), true);
    scoop.position.set((index - 1) * .12 * scale, (1.05 + index * .48) * scale, 0);
    group.add(scoop);
  });
  return group;
}

function addDock(){
  const dock = new THREE.Group();
  const wood = material(0x9f724b);
  for(let i = 0; i < 18; i++){
    const plank = mesh(new THREE.BoxGeometry(1.12, .18, 5.4), wood);
    plank.position.set(-ISLAND_HALF_LENGTH - 2.4 - i * 1.04, .05, 0);
    dock.add(plank);
  }
  for(let i = 0; i < 10; i++){
    [-2.35, 2.35].forEach(z => {
      const post = mesh(new THREE.CylinderGeometry(.18, .23, 1.75, 10), material(0x765238));
      post.position.set(-ISLAND_HALF_LENGTH - 2.2 - i * 2, -.18, z);
      dock.add(post);
    });
  }
  scene.add(dock);
}

function addBeachDetails(){
  const shellMat = material(0xf7c2a2);
  [[-40,6.5],[33,-6.8],[7,9.5],[-12,-9.4],[20,9.2],[-29,-8.5]].forEach(([bx,bz], index) => {
    const x = bx * ISLAND_X_SCALE;
    const z = bz * WORLD_SCALE;
    const star = new THREE.Group();
    for(let i = 0; i < 5; i++){
      const arm = mesh(new THREE.ConeGeometry(.18, .9, 5), shellMat, false);
      arm.position.y = .04;
      arm.rotation.z = Math.PI / 2;
      arm.rotation.y = i / 5 * Math.PI * 2;
      star.add(arm);
    }
    star.position.set(x, .04, z);
    star.rotation.y = index;
    scene.add(star);
  });

  const rockMat = material(0x858d83);
  [[-39,-5.4,1.2],[-18,-9,1],[14,8.6,.8],[39,-4.2,1.1],[30,8.1,.85],[-7,-10.2,.9]].forEach(([bx,bz,s]) => {
    const x = bx * ISLAND_X_SCALE;
    const z = bz * WORLD_SCALE;
    const rock = mesh(new THREE.DodecahedronGeometry(s, 0), rockMat);
    rock.scale.y = .6;
    rock.position.set(x, .45 * s, z);
    scene.add(rock);
    addCollider(x, z, s * .85);
  });
}

function addRoads(){
  const roadMat = material(0xc9b285, .98);
  const main = mesh(new THREE.PlaneGeometry(72 * WORLD_SCALE, 4.8), roadMat, false, true);
  main.rotation.x = -Math.PI / 2;
  main.position.set(-2.5 * WORLD_SCALE, .025, 0);
  scene.add(main);
  [-22,-7,9,23].forEach((x, index) => {
    const cross = mesh(new THREE.PlaneGeometry((index === 3 ? 10 : 13) * WORLD_SCALE, 3.4), roadMat, false, true);
    cross.rotation.x = -Math.PI / 2;
    cross.rotation.z = Math.PI / 2;
    cross.position.set(x * WORLD_SCALE, .03, (index % 2 ? -.4 : .5) * WORLD_SCALE);
    scene.add(cross);
  });
}

function addLandscapeDetails(){
  const bladeMats = [material(0x557b42, .94), material(0x789448, .92), material(0x9b9b4f, .92)];
  const usableLength = Math.floor((ISLAND_HALF_LENGTH - 8) * 2);
  for(let i = 0; i < 125; i++){
    const x = -ISLAND_HALF_LENGTH + 8 + ((i * 37) % usableLength);
    const south = islandEdge(x, -1, 5) + 3;
    const north = islandEdge(x, 1, 5) - 3;
    const z = south + ((i * 53) % Math.max(6, Math.floor(north - south)));
    if(Math.abs(z) < 4) continue;
    const tuft = new THREE.Group();
    for(let bladeIndex = 0; bladeIndex < 3; bladeIndex++){
      const blade = mesh(new THREE.ConeGeometry(.11, .72 + bladeIndex * .13, 4), bladeMats[(i + bladeIndex) % bladeMats.length], false, false);
      blade.position.set((bladeIndex - 1) * .16, .38, (bladeIndex % 2) * .1);
      blade.rotation.z = (bladeIndex - 1) * .18;
      tuft.add(blade);
    }
    tuft.position.set(x, 0, z);
    tuft.rotation.y = i * 1.73;
    scene.add(tuft);
  }

  const cloudMat = new THREE.MeshBasicMaterial({ color:0xffffff, transparent:true, opacity:.68, depthWrite:false });
  [[-52,31,-48],[4,37,-56],[58,29,-46]].forEach(([x,y,z], cloudIndex) => {
    const cloud = new THREE.Group();
    for(let i = 0; i < 6; i++){
      const puff = mesh(new THREE.SphereGeometry(3.2 + (i % 3), 16, 10), cloudMat, false, false);
      puff.scale.y = .58;
      puff.position.set((i - 2.5) * 4.2, Math.sin(i * 1.8) * 1.2, (i % 2) * 1.4);
      cloud.add(puff);
    }
    cloud.position.set(x, y, z + cloudIndex * 11);
    scene.add(cloud);
  });
}

function addShorelineWaves(){
  shorelineWaves.length = 0;
  for(const side of [-1, 1]){
    for(let i = 0; i < 38; i++){
      const x = -ISLAND_HALF_LENGTH + 5 + i * ((ISLAND_HALF_LENGTH * 2 - 10) / 37);
      const z = islandEdge(x, side, 0) + side * 1.05;
      const foamMaterial = new THREE.MeshBasicMaterial({ color:0xe9ffff, transparent:true, opacity:.48, depthWrite:false, side:THREE.DoubleSide });
      const foam = mesh(new THREE.PlaneGeometry(3.8 + (i % 4) * .45, .32), foamMaterial, false, false);
      foam.rotation.x = -Math.PI / 2;
      foam.rotation.z = Math.sin(x * .08) * .12;
      foam.position.set(x, -.01, z);
      foam.userData = { baseZ:z, side, phase:i * .67 + (side > 0 ? 0 : 1.4) };
      shorelineWaves.push(foam);
      scene.add(foam);
    }
  }
}

function addCharlestonHarborBackdrop(){
  const skyline = new THREE.Group();
  const buildingMats = [
    new THREE.MeshBasicMaterial({ color:0xe3d6bf, fog:true }),
    new THREE.MeshBasicMaterial({ color:0xd7e0d8, fog:true }),
    new THREE.MeshBasicMaterial({ color:0xc78069, fog:true }),
    new THREE.MeshBasicMaterial({ color:0xd6b87f, fog:true }),
    new THREE.MeshBasicMaterial({ color:0xbfc8bb, fog:true })
  ];
  const roofMats = [
    new THREE.MeshBasicMaterial({ color:0x8f5c4d, fog:true }),
    new THREE.MeshBasicMaterial({ color:0x737d78, fog:true }),
    new THREE.MeshBasicMaterial({ color:0xb06c52, fog:true })
  ];
  const buildings = [
    [-7,2.3,7.5,0],[-1,2.9,5.4,1],[5,2.6,5.2,2],[12,3.2,6.4,0],
    [20,2.7,6.7,3],[27,3.4,5.1,2],[36,2.6,7.2,1],[44,3.1,6.2,4],[52,2.4,7.3,0]
  ];
  buildings.forEach(([z,height,width,materialIndex],index) => {
    const building = mesh(new THREE.BoxGeometry(2.2,height,width),buildingMats[materialIndex],false,false);
    building.position.set(0,height / 2 + .2,z);
    skyline.add(building);
    if(index % 2 === 0){
      const roof = mesh(new THREE.ConeGeometry(width * .48,.82,4),roofMats[index % roofMats.length],false,false);
      roof.position.set(0,height + .56,z);
      roof.rotation.y = Math.PI / 4;
      skyline.add(roof);
    }
  });

  const treeMat = new THREE.MeshBasicMaterial({ color:0x315f4e, fog:true });
  const treeHighlightMat = new THREE.MeshBasicMaterial({ color:0x4e765c, fog:true });
  for(let index = 0; index < 24; index++){
    const crown = mesh(new THREE.IcosahedronGeometry(1.35 + (index % 4) * .12,1),index % 3 === 0 ? treeHighlightMat : treeMat,false,false);
    crown.scale.set(.7,.58,1.25);
    crown.position.set(-.65,1.65,-10 + index * 2.8);
    skyline.add(crown);
  }

  const classical = mesh(new THREE.BoxGeometry(2.6,2.55,8.5),buildingMats[0],false,false);
  classical.position.set(-.28,1.58,-9.5);
  skyline.add(classical);
  for(let z = -12.5; z <= -6.5; z += 1.5){
    const column = mesh(new THREE.CylinderGeometry(.13,.15,2.1,8),buildingMats[1],false,false);
    column.position.set(-1.65,1.42,z);
    skyline.add(column);
  }

  function addWaterfrontSteeple(z, height, wallMaterial, spireMaterial){
    const lowerTower = mesh(new THREE.BoxGeometry(2.25,height * .32,2.65),wallMaterial,false,false);
    lowerTower.position.set(-.25,height * .16 + 2.15,z);
    const upperTower = mesh(new THREE.BoxGeometry(1.38,height * .2,1.75),wallMaterial,false,false);
    upperTower.position.set(-.25,height * .42 + 2.15,z);
    const cap = mesh(new THREE.ConeGeometry(1.05,height * .42,6),spireMaterial,false,false);
    cap.position.set(-.25,height * .73 + 2.15,z);
    const finial = mesh(new THREE.CylinderGeometry(.055,.055,height * .16,5),spireMaterial,false,false);
    finial.position.set(-.25,height + 1.95,z);
    skyline.add(lowerTower,upperTower,cap,finial);
  }
  addWaterfrontSteeple(4.5,9.3,buildingMats[1],roofMats[1]);
  addWaterfrontSteeple(53,8.6,buildingMats[3],roofMats[0]);

  const office = mesh(new THREE.BoxGeometry(2.75,8.5,8.2),buildingMats[3],false,false);
  office.position.set(0,4.48,38.2);
  skyline.add(office);
  const windowMat = new THREE.MeshBasicMaterial({ color:0x607a77, fog:true });
  for(let floor = 0; floor < 6; floor++){
    const windows = mesh(new THREE.BoxGeometry(.08,.25,7.35),windowMat,false,false);
    windows.position.set(-1.41,1.65 + floor * 1.05,38.2);
    skyline.add(windows);
  }
  for(let z = 35.3; z <= 41.1; z += 1.45){
    const divider = mesh(new THREE.BoxGeometry(.09,6.2,.1),buildingMats[0],false,false);
    divider.position.set(-1.46,4.55,z);
    skyline.add(divider);
  }

  const waterfront = mesh(new THREE.BoxGeometry(3,.62,70),new THREE.MeshBasicMaterial({ color:0xa9b5a8, fog:true }),false,false);
  waterfront.position.set(-.1,.08,23);
  skyline.add(waterfront);
  const pierMat = new THREE.MeshBasicMaterial({ color:0xe2e3d5, fog:true });
  for(let z = -11; z <= 57; z += 2.65){
    const piling = mesh(new THREE.CylinderGeometry(.075,.09,1.35,6),pierMat,false,false);
    piling.position.set(-1.85,.62,z);
    skyline.add(piling);
  }
  [-2,18,31,48].forEach((z,index) => {
    const pier = mesh(new THREE.BoxGeometry(4.8,.16,1.15 + index % 2 * .45),pierMat,false,false);
    pier.position.set(-2.5,.5,z);
    skyline.add(pier);
  });
  skyline.position.set(128,0,0);
  scene.add(skyline);

  const bridge = new THREE.Group();
  const concreteMat = new THREE.MeshBasicMaterial({ color:0xe6e2d4, fog:true });
  const concreteShade = new THREE.MeshBasicMaterial({ color:0xa7b2ac, fog:true });
  const roadwayMat = new THREE.MeshBasicMaterial({ color:0x5b6c6b, fog:true });
  const cableMat = new THREE.MeshBasicMaterial({ color:0xd3dcd6, fog:true });
  const deck = mesh(new THREE.BoxGeometry(2.7,.46,54),roadwayMat,false,false);
  deck.position.y = 4.15;
  const deckEdge = mesh(new THREE.BoxGeometry(2.95,.21,54.5),concreteMat,false,false);
  deckEdge.position.y = 4.43;
  bridge.add(deck,deckEdge);
  [-10.5,10.5].forEach(towerZ => {
    const lowerLeft = cylinderBetween(new THREE.Vector3(0,3.05,towerZ - 2.25),new THREE.Vector3(0,10.1,towerZ),.42,concreteMat,10);
    const lowerRight = cylinderBetween(new THREE.Vector3(0,3.05,towerZ + 2.25),new THREE.Vector3(0,10.1,towerZ),.42,concreteMat,10);
    const upperLeft = cylinderBetween(new THREE.Vector3(0,10.1,towerZ),new THREE.Vector3(0,20.2,towerZ - 1.18),.34,concreteMat,10);
    const upperRight = cylinderBetween(new THREE.Vector3(0,10.1,towerZ),new THREE.Vector3(0,20.2,towerZ + 1.18),.34,concreteMat,10);
    const lowerBeam = mesh(new THREE.BoxGeometry(.95,.42,3.8),concreteMat,false,false);
    lowerBeam.position.set(0,6.05,towerZ);
    const crown = mesh(new THREE.BoxGeometry(.95,.5,2.85),concreteMat,false,false);
    crown.position.set(0,20.05,towerZ);
    bridge.add(lowerLeft,lowerRight,upperLeft,upperRight,lowerBeam,crown);

    const cableEnds = towerZ < 0 ? [-26,-22.5,-19,-15.5,-6,-2.5,1] : [-1,2.5,6,15.5,19,22.5,26];
    cableEnds.forEach((endZ,index) => {
      const direction = endZ < towerZ ? -1 : 1;
      const anchorHeight = 18.75 - Math.abs(endZ - towerZ) * .24;
      const cable = cylinderBetween(
        new THREE.Vector3(0,anchorHeight,towerZ + direction * .72),
        new THREE.Vector3(0,4.64,endZ),
        .045,
        cableMat,
        6
      );
      bridge.add(cable);
    });
  });
  [-25,-20,-10.5,0,10.5,20,25].forEach(z => {
    const pier = mesh(new THREE.CylinderGeometry(.22,.32,4,8),concreteShade,false,false);
    pier.position.set(0,1.85,z);
    bridge.add(pier);
  });
  for(let z = -25; z <= 25; z += 3.2){
    const lampPost = mesh(new THREE.CylinderGeometry(.025,.035,1.15,5),concreteMat,false,false);
    lampPost.position.set(-1.28,5.02,z);
    bridge.add(lampPost);
  }
  bridge.traverse(item => { if(item.isMesh){ item.castShadow = false; item.receiveShadow = false; } });
  bridge.position.set(111,0,-42);
  scene.add(bridge);
}

function addContainerShip(x, z, speed, shipScale = 1){
  const ship = new THREE.Group();
  ship.scale.setScalar(shipScale);
  const hullMat = new THREE.MeshBasicMaterial({ color:0x405e66, fog:true });
  const deckMat = new THREE.MeshBasicMaterial({ color:0xd6d6c7, fog:true });
  const wakeMat = new THREE.MeshBasicMaterial({ color:0xe5f0e8, transparent:true, opacity:.42, depthWrite:false, side:THREE.DoubleSide, fog:true });
  const hull = mesh(new THREE.BoxGeometry(2.6,1.05,10.5),hullMat,false,false);
  hull.position.y = .25;
  const bow = mesh(new THREE.ConeGeometry(1.32,2.3,4),hullMat,false,false);
  bow.rotation.x = Math.PI / 2;
  bow.rotation.z = Math.PI / 4;
  bow.position.set(0,.25,5.8);
  const deck = mesh(new THREE.BoxGeometry(2.35,.25,8.7),deckMat,false,false);
  deck.position.y = .9;
  ship.add(hull,bow,deck);
  const containerColors = [0xa94f43,0x3f7776,0xb48745,0x6b7890,0xb86b4a];
  for(let level = 0; level < 3; level++){
    for(let row = -3; row <= 2; row++){
      for(const column of [-.62,.62]){
        const container = mesh(new THREE.BoxGeometry(1,.56,1.18),new THREE.MeshBasicMaterial({ color:containerColors[(level * 5 + row + (column > 0 ? 2 : 0) + 8) % containerColors.length], fog:true }),false,false);
        container.position.set(column,1.28 + level * .59,row * 1.15);
        ship.add(container);
      }
    }
  }
  const bridgeBlock = mesh(new THREE.BoxGeometry(2.1,2.35,1.5),deckMat,false,false);
  bridgeBlock.position.set(0,2.05,-4.25);
  ship.add(bridgeBlock);
  for(const side of [-1,1]){
    const wake = mesh(new THREE.PlaneGeometry(.38,8.5),wakeMat,false,false);
    wake.rotation.x = -Math.PI / 2;
    wake.position.set(side * 1.45,.03,-6.3);
    wake.rotation.z = side * .13;
    ship.add(wake);
  }
  ship.position.set(x,-.12,z);
  ship.rotation.y = speed < 0 ? Math.PI : 0;
  ship.userData = { speed, baseY:-.12, phase:backgroundShips.length * 2.3, minZ:-58, maxZ:58 };
  backgroundShips.push(ship);
  scene.add(ship);
}

function animateHarbor(elapsed, delta){
  backgroundShips.forEach(ship => {
    if(!reducedMotion.matches){
      ship.position.z += ship.userData.speed * delta;
      if(ship.userData.speed > 0 && ship.position.z > ship.userData.maxZ) ship.position.z = ship.userData.minZ;
      if(ship.userData.speed < 0 && ship.position.z < ship.userData.minZ) ship.position.z = ship.userData.maxZ;
      ship.position.y = ship.userData.baseY + Math.sin(elapsed * .72 + ship.userData.phase) * .07;
    }
  });
}

function buildWorld(){
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x91ceca);
  scene.fog = new THREE.Fog(0xc3ded6, 118, 218);
  colliders.length = 0;
  shorelineWaves.length = 0;
  backgroundShips.length = 0;

  const hemisphere = new THREE.HemisphereLight(0xdff4e9, 0x536554, 1.48);
  scene.add(hemisphere);
  sunlight = new THREE.DirectionalLight(0xfff4d4, 3.55);
  sunlight.position.set(START_POSITION.x - 32, 55, 28);
  sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(1536, 1536);
  sunlight.shadow.camera.left = -40;
  sunlight.shadow.camera.right = 40;
  sunlight.shadow.camera.top = 34;
  sunlight.shadow.camera.bottom = -34;
  sunlight.shadow.camera.near = 10;
  sunlight.shadow.camera.far = 110;
  sunlight.shadow.bias = -.0007;
  sunlightTarget = new THREE.Object3D();
  sunlightTarget.position.set(START_POSITION.x, 0, START_POSITION.z);
  sunlight.target = sunlightTarget;
  scene.add(sunlightTarget);
  scene.add(sunlight);

  waterTexture = makeWaterTexture();
  const waterGeometry = new THREE.PlaneGeometry(290, 130, 90, 34);
  waterBasePositions = new Float32Array(waterGeometry.attributes.position.array);
  waterSurface = mesh(waterGeometry, material(0x91c8c6, .28, .08, { map:waterTexture, bumpMap:waterTexture, bumpScale:.08, transparent:true, opacity:.97 }), false, true);
  waterSurface.rotation.x = -Math.PI / 2;
  waterSurface.position.y = -.42;
  scene.add(waterSurface);
  const waterGlow = mesh(new THREE.PlaneGeometry(290, 130), new THREE.MeshBasicMaterial({ color:0xd8eee3, transparent:true, opacity:.11, depthWrite:false }), false, false);
  waterGlow.rotation.x = -Math.PI / 2;
  waterGlow.position.y = -.37;
  scene.add(waterGlow);
  addCharlestonHarborBackdrop();
  addContainerShip(76,-42,2.15,.82);
  addContainerShip(89,34,-1.55,1.02);

  const sandTexture = makeGroundTexture('#e6dfbd', ['#fff7d9','#b9ad85','#efe7c7','#c9bd93']);
  const grassTexture = makeGroundTexture('#70a477', ['#355f4e','#b5c69b','#4e8062','#93aa78']);
  const shoreInk = mesh(new THREE.ShapeGeometry(buildIslandShape(0), 96), new THREE.MeshBasicMaterial({ color:0x334746 }), false, true);
  shoreInk.rotation.x = -Math.PI / 2;
  shoreInk.position.y = -.085;
  shoreInk.scale.set(1.008,1.012,1);
  scene.add(shoreInk);
  const sand = mesh(new THREE.ShapeGeometry(buildIslandShape(0), 96), material(0xffffff, .98, 0, { map:sandTexture, bumpMap:sandTexture, bumpScale:.11 }), false, true);
  sand.rotation.x = -Math.PI / 2;
  sand.position.y = -.05;
  scene.add(sand);
  const grassInk = mesh(new THREE.ShapeGeometry(buildIslandShape(2.05 * WORLD_SCALE), 96), new THREE.MeshBasicMaterial({ color:0x344b42 }), false, true);
  grassInk.rotation.x = -Math.PI / 2;
  grassInk.position.y = -.012;
  grassInk.scale.set(1.012,1.02,1);
  scene.add(grassInk);
  const grass = mesh(new THREE.ShapeGeometry(buildIslandShape(2.05 * WORLD_SCALE), 96), material(0xffffff, .94, 0, { map:grassTexture, bumpMap:grassTexture, bumpScale:.075 }), false, true);
  grass.rotation.x = -Math.PI / 2;
  grass.position.y = 0;
  scene.add(grass);

  addIceCreamStore();
  addBeachDetails();
  addLandscapeDetails();
  addShorelineWaves();

  HOUSE_LOCATIONS.forEach(({x,z,color,scale,rotation}) => addHouse(x, z, color, scale, rotation));

  TREE_LOCATIONS.palms.forEach(([x,z,scale]) => addPalm(x * ISLAND_X_SCALE, z * WORLD_SCALE, scale));
  TREE_LOCATIONS.liveOaks.forEach(([x,z,scale]) => addLiveOak(x * ISLAND_X_SCALE, z * WORLD_SCALE, scale));

  createPlayer();
  rebuildCoins();
}

function createPlayer(){
  player = new THREE.Group();
  const skin = material(0xe3bda4, .72);
  const skinShadow = material(0xc58f79, .78);
  const shirt = fabricMaterial('#b64235', '#ef9a86', .8);
  const pants = fabricMaterial('#765236', '#bd8d5d', .82);
  const white = material(0xf3f0df, .68);
  const whiteShadow = material(0xb8c1ba, .76);
  const sole = material(0x273535, .84);
  const dark = material(0x202c2e, .82);
  const hairMaterial = material(0x2d211d, .88);
  const hairHighlight = material(0x4a3429, .84);
  const backpackMaterial = fabricMaterial('#355c55', '#86a18a', .8);

  const body = mesh(new THREE.CapsuleGeometry(.39, .82, 7, 14), shirt);
  body.scale.set(.92, 1, .72);
  body.position.y = 1.76;
  const waist = mesh(new THREE.BoxGeometry(.7, .28, .56), pants);
  waist.position.y = 1.23;
  const collar = mesh(new THREE.TorusGeometry(.2, .038, 8, 18, Math.PI), white, false);
  collar.position.set(0, 2.18, .24);
  collar.rotation.z = Math.PI;

  const neck = mesh(new THREE.CylinderGeometry(.145, .17, .25, 12), skin);
  neck.position.y = 2.28;
  const head = mesh(new THREE.SphereGeometry(.49, 22, 16), skin);
  head.scale.set(.92, 1.08, .9);
  head.position.y = 2.79;
  const earLeft = mesh(new THREE.SphereGeometry(.09, 10, 8), skinShadow, false);
  const earRight = earLeft.clone();
  earLeft.position.set(-.46, 2.79, 0);
  earRight.position.set(.46, 2.79, 0);

  const hair = mesh(new THREE.SphereGeometry(.515, 18, 12, 0, Math.PI * 2, 0, Math.PI / 1.46), hairMaterial);
  hair.scale.set(.95, 1.04, .94);
  hair.position.y = 2.95;
  const hairSegments = [];
  const bobHair = new THREE.Group();
  [-.36,-.24,-.12,0,.12,.24,.36].forEach((x,index) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, 2.98, -.34 - Math.abs(x) * .12);
    const strand = mesh(new THREE.CapsuleGeometry(.082 + (3 - Math.abs(index - 3)) * .006, .2 + (index % 3) * .045, 6, 10), index % 2 ? hairMaterial : hairHighlight);
    strand.position.y = -.2;
    strand.rotation.z = (index - 3) * .09;
    pivot.add(strand);
    bobHair.add(pivot);
    hairSegments.push({ pivot, chainIndex:index % 2, depth:index });
  });
  const fringeLeft = mesh(new THREE.CapsuleGeometry(.085,.25,6,10), hairMaterial);
  const fringeRight = fringeLeft.clone();
  fringeLeft.position.set(-.25,2.95,.38);
  fringeRight.position.set(.16,2.96,.41);
  fringeLeft.rotation.z = -.55;
  fringeRight.rotation.z = .62;
  const hairTufts = new THREE.Group();
  for(let i = 0; i < 9; i++){
    const angle = i / 9 * Math.PI * 2;
    const tuft = mesh(new THREE.ConeGeometry(.105,.34,5),i % 2 ? hairMaterial : hairHighlight);
    tuft.position.set(Math.cos(angle) * .32,3.35 + (i % 3) * .025,Math.sin(angle) * .28);
    tuft.rotation.z = Math.cos(angle) * .36;
    tuft.rotation.x = -Math.sin(angle) * .32;
    hairTufts.add(tuft);
  }

  const eyeLeft = mesh(new THREE.SphereGeometry(.04, 9, 7), dark, false);
  const eyeRight = eyeLeft.clone();
  eyeLeft.position.set(-.16, 2.82, .45);
  eyeRight.position.set(.16, 2.82, .45);
  const nose = mesh(new THREE.SphereGeometry(.05, 9, 7), skinShadow, false);
  nose.scale.set(.7, 1, 1.15);
  nose.position.set(0, 2.7, .48);
  const mouth = mesh(new THREE.BoxGeometry(.16,.025,.025), material(0x764d48), false);
  mouth.position.set(0,2.59,.47);
  const glassesLeft = mesh(new THREE.TorusGeometry(.145,.025,8,18), dark, false);
  const glassesRight = glassesLeft.clone();
  glassesLeft.position.set(-.18,2.81,.475);
  glassesRight.position.set(.18,2.81,.475);
  const glassesBridge = mesh(new THREE.BoxGeometry(.12,.028,.025),dark,false);
  glassesBridge.position.set(0,2.81,.48);
  const glassesTempleLeft = mesh(new THREE.BoxGeometry(.19,.025,.025),dark,false);
  const glassesTempleRight = glassesTempleLeft.clone();
  glassesTempleLeft.position.set(-.38,2.82,.39);
  glassesTempleRight.position.set(.38,2.82,.39);
  glassesTempleLeft.rotation.y = -.65;
  glassesTempleRight.rotation.y = .65;

  const backpack = mesh(new THREE.CapsuleGeometry(.47, .72, 8, 14), backpackMaterial);
  backpack.scale.set(1,.8,.5);
  backpack.position.set(0,1.93,-.46);
  const backpackPocket = mesh(new THREE.CapsuleGeometry(.31,.3,7,12), fabricMaterial('#294941','#6f8c77',.82));
  backpackPocket.scale.set(1,.86,.28);
  backpackPocket.position.set(0,1.72,-.72);
  const backpackFlap = mesh(new THREE.BoxGeometry(.7,.26,.1), backpackMaterial);
  backpackFlap.position.set(0,2.18,-.72);
  const backpackBuckle = mesh(new THREE.BoxGeometry(.13,.12,.06), dark, false);
  backpackBuckle.position.set(0,1.99,-.8);
  const palmettoSymbol = mesh(
    new THREE.PlaneGeometry(.55,.55),
    new THREE.MeshBasicMaterial({ map:makePalmettoTexture(), transparent:true, side:THREE.DoubleSide, depthWrite:false }),
    false,
    false
  );
  palmettoSymbol.position.set(0,1.76,-.81);
  [-.3,.3].forEach(x => {
    const strap = mesh(new THREE.CapsuleGeometry(.045,.72,5,8), whiteShadow, false);
    strap.position.set(x,1.91,.25);
    player.add(strap);
  });

  const armLeftPivot = new THREE.Group();
  const armRightPivot = new THREE.Group();
  armLeftPivot.position.set(-.45, 2.04, 0);
  armRightPivot.position.set(.45, 2.04, 0);
  [armLeftPivot, armRightPivot].forEach(pivot => {
    const sleeve = mesh(new THREE.CylinderGeometry(.115,.145,.32,11), shirt);
    sleeve.position.y = -.17;
    const upperArm = mesh(new THREE.CylinderGeometry(.09,.115,.35,11), skin);
    upperArm.position.y = -.48;
    const elbow = mesh(new THREE.SphereGeometry(.095,10,8), skin);
    elbow.position.y = -.67;
    const forearm = mesh(new THREE.CylinderGeometry(.075,.095,.34,11), skin);
    forearm.position.y = -.84;
    const hand = mesh(new THREE.SphereGeometry(.105,11,8), skin);
    hand.scale.y = 1.18;
    hand.position.y = -1.04;
    pivot.add(sleeve,upperArm,elbow,forearm,hand);
  });

  const legLeftPivot = new THREE.Group();
  const legRightPivot = new THREE.Group();
  legLeftPivot.position.set(-.2, 1.28, 0);
  legRightPivot.position.set(.2, 1.28, 0);
  [legLeftPivot, legRightPivot].forEach(pivot => {
    const trouser = mesh(new THREE.CylinderGeometry(.16,.2,.56,12), pants);
    trouser.position.y = -.32;
    const cuff = mesh(new THREE.CylinderGeometry(.17,.17,.12,12), pants);
    cuff.position.y = -.62;
    const calf = mesh(new THREE.CylinderGeometry(.105,.135,.36,11), skin);
    calf.position.y = -.84;
    const sock = mesh(new THREE.CylinderGeometry(.12,.13,.22,11), white);
    sock.position.y = -1.05;
    const sneaker = mesh(new THREE.BoxGeometry(.32,.22,.56), white);
    sneaker.geometry.translate(0,0,.07);
    sneaker.position.set(0,-1.2,.12);
    const sneakerSole = mesh(new THREE.BoxGeometry(.34,.065,.59), sole);
    sneakerSole.position.set(0,-1.325,.12);
    pivot.add(trouser,cuff,calf,sock,sneaker,sneakerSole);
  });

  player.add(
    body,waist,collar,neck,head,earLeft,earRight,hair,bobHair,hairTufts,fringeLeft,fringeRight,
    eyeLeft,eyeRight,nose,mouth,glassesLeft,glassesRight,glassesBridge,glassesTempleLeft,glassesTempleRight,
    backpack,backpackPocket,backpackFlap,backpackBuckle,palmettoSymbol,armLeftPivot,armRightPivot,legLeftPivot,legRightPivot
  );
  addInkOutline(player, .035, .1);
  playerParts = { body, head, hairSegments, armLeft:armLeftPivot, armRight:armRightPivot, legLeft:legLeftPivot, legRight:legRightPivot };
  player.position.set(session?.player?.x ?? START_POSITION.x, .08, session?.player?.z ?? START_POSITION.z);
  player.rotation.y = session?.player?.heading ?? Math.PI / 2;
  scene.add(player);

  rewardCone = createIceCreamCone(.86);
  rewardCone.position.set(.75, 1.1, .15);
  rewardCone.scale.setScalar(.01);
  rewardCone.visible = false;
  player.add(rewardCone);
}

function createLegacyPlayer(){
  player = new THREE.Group();
  const skin = new THREE.MeshPhysicalMaterial({ color:0xe7ad80, roughness:.58, clearcoat:.08, clearcoatRoughness:.82 });
  const shirt = fabricMaterial('#4a9ed0', '#d8f2ff', .66);
  const shorts = fabricMaterial('#de4f8c', '#ffbdd9', .7);
  const shoe = new THREE.MeshPhysicalMaterial({ color:0xf4f0e8, roughness:.42, clearcoat:.22, clearcoatRoughness:.65 });
  const sole = material(0x34404a, .82);
  const dark = material(0x2a302f, .84);
  const hairMaterial = new THREE.MeshPhysicalMaterial({ color:0x6e4332, roughness:.72, sheen:.45, sheenColor:new THREE.Color(0xc18a69) });
  const capMaterial = fabricMaterial('#f17cb2', '#ffd9e9', .62);
  const backpackMaterial = fabricMaterial('#2f7db8', '#87c6e5', .68);
  const body = mesh(new THREE.CapsuleGeometry(.43, .72, 8, 14), shirt);
  body.scale.set(1, 1, .76);
  body.position.y = 1.54;
  const chestPanel = mesh(new THREE.CapsuleGeometry(.31,.42,7,12),shirt,false);
  chestPanel.scale.set(1,.92,.16);
  chestPanel.position.set(0,1.62,.35);
  const shirtHem = mesh(new THREE.TorusGeometry(.37,.035,8,20),material(0x27729f,.72),false);
  shirtHem.rotation.x = Math.PI / 2;
  shirtHem.position.y = 1.12;
  const shoulderLeft = mesh(new THREE.SphereGeometry(.2,14,10),shirt);
  const shoulderRight = shoulderLeft.clone();
  shoulderLeft.position.set(-.47,1.86,0);
  shoulderRight.position.set(.47,1.86,0);
  const collar = mesh(new THREE.TorusGeometry(.22, .045, 8, 18, Math.PI), material(0xd8eef8, .7), false);
  collar.position.set(0, 1.99, .25);
  collar.rotation.z = Math.PI;
  const shortsWaist = mesh(new THREE.BoxGeometry(.72, .34, .58), shorts);
  shortsWaist.position.y = 1.02;
  const neck = mesh(new THREE.CylinderGeometry(.16, .18, .24, 12), skin);
  neck.position.y = 2.12;
  const head = mesh(new THREE.SphereGeometry(.51, 24, 18), skin);
  head.scale.set(.94, 1.08, .92);
  head.position.y = 2.61;
  const hair = mesh(new THREE.SphereGeometry(.525, 20, 12, 0, Math.PI * 2, 0, Math.PI / 1.55), hairMaterial);
  hair.scale.set(.96, 1.04, .94);
  hair.position.y = 2.76;
  const longHair = new THREE.Group();
  const hairSegments = [];
  longHair.position.set(0, 2.58, -.84);
  [-.15,.15].forEach((rootX, chainIndex) => {
    const root = new THREE.Group();
    root.position.x = rootX;
    longHair.add(root);
    let parent = root;
    for(let i = 0; i < 4; i++){
      const pivot = new THREE.Group();
      if(i) pivot.position.set(0,-.4,.01);
      const strand = mesh(new THREE.CapsuleGeometry(.105 - i * .008,.3,7,12),hairMaterial);
      strand.scale.set(1,1,.72);
      strand.position.set((chainIndex ? 1 : -1) * i * .012,-.24,0);
      pivot.add(strand);
      parent.add(pivot);
      parent = pivot;
      hairSegments.push({ pivot, chainIndex, depth:i });
    }
  });
  const capCrown = mesh(new THREE.SphereGeometry(.54, 22, 14, 0, Math.PI * 2, 0, Math.PI / 2), capMaterial);
  capCrown.scale.set(1.03,.58,1.03);
  capCrown.position.y = 2.97;
  const capBand = mesh(new THREE.TorusGeometry(.47, .055, 8, 22), material(0xffd9e8, .6), false);
  capBand.rotation.x = Math.PI / 2;
  capBand.position.y = 2.94;
  const capBrim = mesh(new THREE.BoxGeometry(.52, .07, .31), capMaterial);
  capBrim.position.set(0,2.93,.49);
  capBrim.rotation.x = -.08;
  const earLeft = mesh(new THREE.SphereGeometry(.09, 10, 8), skin, false);
  const earRight = earLeft.clone();
  earLeft.position.set(-.49, 2.6, 0);
  earRight.position.set(.49, 2.6, 0);
  const eyeLeft = mesh(new THREE.SphereGeometry(.045, 10, 8), dark, false);
  const eyeRight = eyeLeft.clone();
  eyeLeft.position.set(-.17, 2.66, .47);
  eyeRight.position.set(.17, 2.66, .47);
  const nose = mesh(new THREE.SphereGeometry(.055, 10, 8), material(0xd79870), false);
  nose.scale.set(.75, 1, 1.15);
  nose.position.set(0, 2.54, .5);
  const mouth = mesh(new THREE.BoxGeometry(.19, .025, .025), material(0x8f4e47), false);
  mouth.position.set(0, 2.4, .49);
  const eyebrowLeft = mesh(new THREE.BoxGeometry(.15,.025,.025),hairMaterial,false);
  const eyebrowRight = eyebrowLeft.clone();
  eyebrowLeft.position.set(-.17,2.76,.48);
  eyebrowRight.position.set(.17,2.76,.48);
  eyebrowLeft.rotation.z = -.08;
  eyebrowRight.rotation.z = .08;
  const cheekMaterial = new THREE.MeshPhysicalMaterial({color:0xe89c82,roughness:.7,transparent:true,opacity:.56});
  const cheekLeft = mesh(new THREE.SphereGeometry(.065,10,7),cheekMaterial,false);
  const cheekRight = cheekLeft.clone();
  cheekLeft.scale.set(1.25,.55,.35);
  cheekRight.scale.copy(cheekLeft.scale);
  cheekLeft.position.set(-.27,2.48,.49);
  cheekRight.position.set(.27,2.48,.49);

  const backpack = mesh(new THREE.CapsuleGeometry(.5, .78, 9, 16), backpackMaterial);
  backpack.scale.set(.96,.84,.54);
  backpack.position.set(0,1.66,-.49);
  const backpackPocket = mesh(new THREE.CapsuleGeometry(.34,.3,7,14),fabricMaterial('#58a4cf','#c0eaff',.7));
  backpackPocket.scale.set(1,.9,.3);
  backpackPocket.position.set(0,1.51,-.77);
  const backpackFlap = mesh(new THREE.BoxGeometry(.76,.28,.13),backpackMaterial);
  backpackFlap.position.set(0,1.96,-.78);
  backpackFlap.rotation.x = -.08;
  const backpackTrim = mesh(new THREE.TorusGeometry(.37,.035,7,22,Math.PI), material(0xf1d18e,.65),false);
  backpackTrim.position.set(0,1.82,-.8);
  backpackTrim.rotation.z = Math.PI;
  const backpackBuckle = mesh(new THREE.BoxGeometry(.16,.12,.07),material(0xe7b953,.42,.42),false);
  backpackBuckle.position.set(0,1.79,-.86);
  [-.48,.48].forEach(x => {
    const sidePocket = mesh(new THREE.CapsuleGeometry(.13,.22,5,9),backpackMaterial);
    sidePocket.scale.set(.7,1,.55);
    sidePocket.position.set(x,1.58,-.5);
    player.add(sidePocket);
  });
  [-.34,.34].forEach(x => {
    const strap = mesh(new THREE.CapsuleGeometry(.042,.68,5,8), material(0x276a9b,.72),false);
    strap.position.set(x,1.69,.31);
    player.add(strap);
  });

  const armLeftPivot = new THREE.Group();
  const armRightPivot = new THREE.Group();
  armLeftPivot.position.set(-.53, 1.86, 0);
  armRightPivot.position.set(.53, 1.86, 0);
  [armLeftPivot, armRightPivot].forEach(pivot => {
    const sleeve = mesh(new THREE.CylinderGeometry(.125,.16,.36,12), shirt);
    sleeve.position.y = -.19;
    const elbow = mesh(new THREE.SphereGeometry(.125,12,9),skin);
    elbow.position.y = -.43;
    const forearm = mesh(new THREE.CylinderGeometry(.095,.125,.43,12), skin);
    forearm.position.y = -.64;
    const hand = mesh(new THREE.SphereGeometry(.135, 12, 9), skin);
    hand.scale.y = 1.18;
    hand.position.y = -.88;
    pivot.add(sleeve, elbow, forearm, hand);
  });

  const legLeftPivot = new THREE.Group();
  const legRightPivot = new THREE.Group();
  legLeftPivot.position.set(-.22, 1.08, 0);
  legRightPivot.position.set(.22, 1.08, 0);
  [legLeftPivot, legRightPivot].forEach(pivot => {
    const thigh = mesh(new THREE.CylinderGeometry(.16,.2,.42,12), shorts);
    thigh.position.y = -.23;
    const knee = mesh(new THREE.SphereGeometry(.16,12,9),shorts);
    knee.scale.set(1,.86,.95);
    knee.position.y = -.49;
    const shin = mesh(new THREE.CylinderGeometry(.125,.155,.45,12), shorts);
    shin.position.y = -.7;
    const sneaker = mesh(new THREE.BoxGeometry(.34, .22, .58), shoe);
    sneaker.geometry.translate(0,0,.06);
    sneaker.position.set(0, -.98, .13);
    const sneakerSole = mesh(new THREE.BoxGeometry(.36, .07, .62), sole);
    sneakerSole.position.set(0, -1.105, .13);
    const sneakerAccent = mesh(new THREE.BoxGeometry(.2,.07,.12),capMaterial,false);
    sneakerAccent.position.set(0,-.96,.47);
    pivot.add(thigh, knee, shin, sneaker, sneakerSole, sneakerAccent);
  });
  player.add(body, chestPanel, shirtHem, shoulderLeft, shoulderRight, collar, shortsWaist, neck, head, hair, longHair, capCrown, capBand, capBrim, earLeft, earRight, eyeLeft, eyeRight, eyebrowLeft, eyebrowRight, cheekLeft, cheekRight, nose, mouth, backpack, backpackPocket, backpackFlap, backpackTrim, backpackBuckle, armLeftPivot, armRightPivot, legLeftPivot, legRightPivot);
  playerParts = { body, head, hairSegments, armLeft:armLeftPivot, armRight:armRightPivot, legLeft:legLeftPivot, legRight:legRightPivot };
  player.position.set(session?.player?.x ?? START_POSITION.x, .04, session?.player?.z ?? START_POSITION.z);
  player.rotation.y = session?.player?.heading ?? Math.PI / 2;
  scene.add(player);

  rewardCone = createIceCreamCone(.86);
  rewardCone.position.set(.75, 1.1, .15);
  rewardCone.scale.setScalar(.01);
  rewardCone.visible = false;
  player.add(rewardCone);
}

function makeCoin(index){
  const group = new THREE.Group();
  const gold = new THREE.MeshToonMaterial({ color:0xffcf38, emissive:0x8e5400, emissiveIntensity:.28, gradientMap:toonBands });
  const edge = new THREE.MeshToonMaterial({ color:0xffe979, gradientMap:toonBands });
  const disc = mesh(new THREE.CylinderGeometry(.7, .7, .2, 36), gold);
  disc.rotation.x = Math.PI / 2;
  const ring = mesh(new THREE.TorusGeometry(.46, .075, 9, 28), edge);
  ring.position.z = .11;
  group.add(disc, ring);
  const location = COIN_LOCATIONS[index];
  group.position.set(location.x, 1.35, location.z);
  group.userData = { index, baseY:1.35, collecting:false, collectStartedAt:0 };
  group.visible = !session?.collected?.[index];
  addInkOutline(group, .035, .12);
  scene.add(group);
  return group;
}

function rebuildCoins(){
  coins.forEach(coin => scene?.remove(coin));
  coins = [];
  if(!scene || !session) return;
  for(let i = 0; i < TOTAL_COINS; i++) coins.push(makeCoin(i));
  if(storeBeacon) storeBeacon.visible = session.phase === 'storeUnlocked';
  updateHUD();
}

function setupRenderer(){
  bindRefs();
  canvasHost = refs.canvas;
  renderer = new THREE.WebGLRenderer({ canvas:canvasHost, antialias:true, powerPreference:'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .98;
  camera = new THREE.PerspectiveCamera(50, 1, .1, 420);
  camera.position.set(START_POSITION.x - 8.8, 5.55, START_POSITION.z);
  buildWorld();
  cameraHeading = player?.rotation?.y ?? Math.PI / 2;
  camera.position.set(
    player.position.x - Math.sin(cameraHeading) * 8.8,
    5.55,
    player.position.z - Math.cos(cameraHeading) * 8.8
  );
  cameraLook.set(
    player.position.x + Math.sin(cameraHeading) * 5.2,
    1.8,
    player.position.z + Math.cos(cameraHeading) * 5.2
  );
  resizeRenderer();
  resizeObserver = new ResizeObserver(resizeRenderer);
  resizeObserver.observe(refs.shell);
  bindEvents();
  initialized = true;
}

function resizeRenderer(){
  if(!renderer || !refs.shell) return;
  const width = Math.max(1, refs.shell.clientWidth);
  const height = Math.max(1, refs.shell.clientHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function updateHUD(){
  if(!refs.counter || !session) return;
  const count = collectedCount();
  refs.counter.textContent = `${count} / ${TOTAL_COINS} coins`;
  if(session.phase === 'storeUnlocked') refs.objective.textContent = 'All coins found! Follow the golden beacon to the ice cream shop.';
  else if(session.phase === 'reward') refs.objective.textContent = 'Enjoy your giant victory cone!';
  else if(session.phase === 'complete') refs.objective.textContent = 'Ice Cream Quest complete!';
  else refs.objective.textContent = `Explore the island and find ${TOTAL_COINS - count} more ${TOTAL_COINS - count === 1 ? 'coin' : 'coins'}.`;
}

function showStoreHint(message){
  refs.storeStatus.textContent = message;
  refs.storeStatus.hidden = false;
  clearTimeout(showStoreHint.timer);
  showStoreHint.timer = setTimeout(() => { refs.storeStatus.hidden = true; }, 1900);
}

function isInsideIsland(x, z){
  if(Math.abs(x) > ISLAND_HALF_LENGTH - 1.5) return false;
  return z < islandEdge(x, 1, 1.5) && z > islandEdge(x, -1, 1.5);
}

function collides(x, z){
  return colliders.some(item => Math.hypot(x - item.x, z - item.z) < item.radius + PLAYER_RADIUS);
}

function canStandAt(x, z){
  return isInsideIsland(x, z) && !collides(x, z);
}

function movementInput(){
  let x = 0;
  let z = 0;
  if(keys.has('ArrowLeft') || keys.has('KeyA')) x -= 1;
  if(keys.has('ArrowRight') || keys.has('KeyD')) x += 1;
  if(keys.has('ArrowUp') || keys.has('KeyW')) z -= 1;
  if(keys.has('ArrowDown') || keys.has('KeyS')) z += 1;
  x += joystickVector.x + pointerVector.x;
  z += joystickVector.y + pointerVector.y;
  x *= TURN_INPUT_SCALE;
  const length = Math.hypot(x, z);
  if(length > 1){ x /= length; z /= length; }
  return { x, z, moving:length > .08 };
}

function cameraRelativeMovement(x, z, heading){
  const forward = -z;
  return {
    x:-x * Math.cos(heading) + forward * Math.sin(heading),
    z:x * Math.sin(heading) + forward * Math.cos(heading)
  };
}

function updatePlayer(delta, elapsed){
  if(!player || !session || !refs.overlay.hidden || !refs.challenge.hidden || !['exploring','storeUnlocked'].includes(session.phase)){
    animatePlayer(false, elapsed);
    return;
  }
  const input = movementInput();
  if(input.moving){
    const speed = 11.5;
    const movement = cameraRelativeMovement(input.x, input.z, cameraHeading);
    const worldX = movement.x;
    const worldZ = movement.z;
    const dx = worldX * speed * delta;
    const dz = worldZ * speed * delta;
    const nextX = player.position.x + dx;
    const nextZ = player.position.z + dz;
    if(canStandAt(nextX, player.position.z)) player.position.x = nextX;
    if(canStandAt(player.position.x, nextZ)) player.position.z = nextZ;
    const targetRotation = Math.atan2(worldX, worldZ);
    let difference = targetRotation - player.rotation.y;
    difference = Math.atan2(Math.sin(difference), Math.cos(difference));
    player.rotation.y += difference * Math.min(1, delta * PLAYER_TURN_RESPONSE);
    session.player = {
      x:Number(player.position.x.toFixed(2)),
      z:Number(player.position.z.toFixed(2)),
      heading:Number(player.rotation.y.toFixed(4))
    };
    if(performance.now() - lastPositionSave > 800){ persistSession(); lastPositionSave = performance.now(); }
  }
  animatePlayer(input.moving, elapsed);
  checkTriggers();
}

function animatePlayer(moving, elapsed){
  if(!playerParts) return;
  const stride = moving ? Math.sin(elapsed * 8.6) : 0;
  const legSwing = stride * .62;
  const armSwing = stride * .46;
  playerParts.legLeft.rotation.x = legSwing;
  playerParts.legRight.rotation.x = -legSwing;
  playerParts.armLeft.rotation.x = -armSwing;
  if(session?.phase !== 'reward') playerParts.armRight.rotation.x = armSwing;
  playerParts.armLeft.rotation.z = moving ? .035 : .06;
  playerParts.armRight.rotation.z = moving ? -.035 : -.06;
  playerParts.body.rotation.z = moving ? -stride * .025 : 0;
  playerParts.head.rotation.z = moving ? stride * .018 : 0;
  playerParts.hairSegments?.forEach(({pivot,chainIndex,depth}) => {
    const side = chainIndex ? 1 : -1;
    const sway = moving
      ? Math.sin(elapsed * 8.6 - depth * .52 + chainIndex * .35) * (.035 + depth * .014)
      : Math.sin(elapsed * 1.7 + depth * .4) * .012;
    pivot.rotation.z = side * .018 + sway;
    pivot.rotation.x = moving ? -.018 - Math.abs(stride) * (.02 + depth * .008) : -.012;
  });
  playerParts.body.position.y = 1.76 + (moving ? Math.abs(Math.sin(elapsed * 8.6)) * .055 : Math.sin(elapsed * 2.2) * .018);
  if(session?.phase !== 'reward') player.position.y = .08 + (moving ? Math.abs(Math.sin(elapsed * 8.6)) * .035 : 0);
}

function checkTriggers(){
  if(!session || !player) return;
  for(let i = 0; i < TOTAL_COINS; i++){
    if(session.collected[i] || coins[i]?.userData.collecting) continue;
    if(i === exitedCoinIndex && performance.now() < challengeCooldownUntil) continue;
    const location = COIN_LOCATIONS[i];
    if(Math.hypot(player.position.x - location.x, player.position.z - location.z) < 2.45){
      openChallenge(i);
      return;
    }
  }
  const storeDistance = Math.hypot(player.position.x - STORE_ENTRY_POSITION.x, player.position.z - STORE_ENTRY_POSITION.z);
  if(storeDistance < 3.1){
    if(session.phase === 'storeUnlocked') beginReward();
    else if(session.phase === 'exploring' && performance.now() - lastStoreHint > 2200){
      const remaining = TOTAL_COINS - collectedCount();
      showStoreHint(`The shop opens after you collect ${remaining} more ${remaining === 1 ? 'coin' : 'coins'}.`);
      lastStoreHint = performance.now();
    }
  }
}

function openChallenge(index){
  if(!session || session.phase !== 'exploring') return;
  keys.clear();
  pointerVector.set(0, 0);
  releaseJoystick();
  currentCoinIndex = index;
  session.phase = 'challenge';
  const word = session.words[index];
  refs.challengeStep.textContent = `Coin ${collectedCount() + 1} of ${TOTAL_COINS}`;
  refs.answer.value = '';
  refs.answer.disabled = false;
  refs.check.disabled = false;
  refs.feedback.className = 'island-feedback';
  refs.feedback.textContent = `You found a coin near the ${COIN_LOCATIONS[index].label}!`;
  services.showWordPicture(refs.picture, word);
  refs.challenge.hidden = false;
  setTimeout(() => services.speak(word), 100);
  setTimeout(() => refs.answer.focus(), 140);
}

function exitChallenge(){
  if(!session || session.phase !== 'challenge') return;
  exitedCoinIndex = currentCoinIndex;
  challengeCooldownUntil = performance.now() + 2600;
  currentCoinIndex = -1;
  session.phase = 'exploring';
  refs.challenge.hidden = true;
  keys.clear();
  if('speechSynthesis' in window) speechSynthesis.cancel();
  persistSession();
  showStoreHint('Challenge exited — the gold coin is still waiting for you.');
}

function submitChallenge(){
  if(!session || currentCoinIndex < 0 || session.phase !== 'challenge') return;
  const word = session.words[currentCoinIndex];
  const answer = normalize(refs.answer.value);
  if(!answer){
    refs.feedback.className = 'island-feedback bad';
    refs.feedback.textContent = 'Type the word before collecting the coin.';
    refs.answer.focus();
    return;
  }
  const wordObject = services.words.find(item => item.word === word);
  if(answer !== word){
    session.attempts[word] = (session.attempts[word] || 0) + 1;
    session.wrongAttempts++;
    services.record(wordObject, false, 0);
    persistSession();
    refs.feedback.className = 'island-feedback bad';
    refs.feedback.textContent = 'Not quite. Look at the picture, listen again, and retry.';
    refs.answer.select();
    services.speak(word);
    return;
  }

  if(!(session.attempts[word] > 0)) session.firstTry++;
  services.record(wordObject, true, 15);
  const coinIndex = currentCoinIndex;
  exitedCoinIndex = -1;
  session.collected[coinIndex] = true;
  session.phase = collectedCount() === TOTAL_COINS ? 'storeUnlocked' : 'exploring';
  const coin = coins[coinIndex];
  coin.userData.collecting = true;
  coin.userData.collectStartedAt = performance.now();
  refs.answer.disabled = true;
  refs.check.disabled = true;
  refs.feedback.className = 'island-feedback good';
  refs.feedback.textContent = `Correct — ${word.toUpperCase()}! Gold coin collected!`;
  updateHUD();
  if(session.phase === 'storeUnlocked'){
    storeBeacon.visible = true;
    showStoreHint('The ice cream shop is open! Follow the golden beacon.');
  }
  persistSession();
  setTimeout(() => {
    refs.challenge.hidden = true;
    currentCoinIndex = -1;
  }, 820);
}

function animateCoins(now){
  coins.forEach((coin, index) => {
    if(!coin.visible) return;
    if(coin.userData.collecting){
      const progress = Math.min(1, (now - coin.userData.collectStartedAt) / 760);
      coin.position.y = coin.userData.baseY + progress * 4.2;
      coin.scale.setScalar(Math.max(.01, 1 - progress));
      coin.rotation.y += .22;
      if(progress >= 1) coin.visible = false;
      return;
    }
    coin.rotation.y += .025;
    coin.position.y = coin.userData.baseY + Math.sin(now * .003 + index) * .18;
  });
  if(storeBeacon?.visible){
    storeBeacon.rotation.y += .012;
    storeBeacon.children.forEach((child, index) => {
      if(child.geometry?.type === 'TorusGeometry') child.scale.setScalar(1 + Math.sin(now * .003 + index) * .08);
    });
  }
}

function animateWater(now){
  if(!waterSurface || !waterBasePositions) return;
  const time = reducedMotion.matches ? 0 : now * .001;
  const positions = waterSurface.geometry.attributes.position;
  for(let i = 0; i < positions.array.length; i += 3){
    const x = waterBasePositions[i];
    const y = waterBasePositions[i + 1];
    positions.array[i + 2] = Math.sin(x * .075 + time * 1.35) * .13 + Math.sin(y * .18 - time * 1.05 + x * .025) * .075;
  }
  positions.needsUpdate = !reducedMotion.matches;
  if(waterTexture && !reducedMotion.matches){
    waterTexture.offset.x = (time * .012) % 1;
    waterTexture.offset.y = (time * -.007) % 1;
  }
  shorelineWaves.forEach(foam => {
    const pulse = Math.sin(time * 1.65 + foam.userData.phase);
    foam.position.z = foam.userData.baseZ + foam.userData.side * (.38 + pulse * .32);
    foam.position.y = -.04 + (pulse + 1) * .035;
    foam.scale.x = .82 + (pulse + 1) * .18;
    foam.material.opacity = .3 + (pulse + 1) * .15;
  });
}

function beginReward(){
  if(!session || session.phase !== 'storeUnlocked') return;
  session.phase = 'reward';
  rewardStartedAt = performance.now();
  player.position.set(STORE_ENTRY_POSITION.x, .08, STORE_ENTRY_POSITION.z);
  player.rotation.y = Math.PI / 2;
  session.player = { x:player.position.x, z:player.position.z, heading:player.rotation.y };
  storeBeacon.visible = false;
  rewardCone.visible = true;
  rewardCone.scale.setScalar(.01);
  refs.rewardCaption.hidden = false;
  refs.rewardCaption.textContent = 'The shopkeeper made your giant victory cone!';
  updateHUD();
  persistSession();
}

function updateReward(now){
  if(!session || session.phase !== 'reward' || !rewardCone) return;
  const duration = reducedMotion.matches ? 1550 : 5600;
  const elapsed = now - rewardStartedAt;
  if(reducedMotion.matches){
    rewardCone.visible = true;
    rewardCone.scale.setScalar(Math.min(1, elapsed / 500));
    rewardCone.position.set(.72, 1.7, .25);
    if(elapsed > duration) finishReward();
    return;
  }
  const seconds = elapsed / 1000;
  if(seconds < 1.1){
    const reveal = Math.min(1, seconds / .75);
    rewardCone.scale.setScalar(reveal);
    rewardCone.position.set(.72, 1.1 + reveal * .5, .25);
  } else {
    const biteCycle = Math.max(0, seconds - 1.1);
    rewardCone.position.y = 1.72 + Math.abs(Math.sin(biteCycle * 3.7)) * .65;
    rewardCone.rotation.z = Math.sin(biteCycle * 3.7) * .14;
    playerParts.armRight.rotation.x = -1.05 + Math.sin(biteCycle * 3.7) * .25;
    let scale = 1;
    if(seconds > 2.35) scale = .82;
    if(seconds > 3.25) scale = .61;
    if(seconds > 4.12) scale = .35;
    rewardCone.scale.setScalar(scale);
    if(seconds > 4.55){
      rewardCone.visible = false;
      refs.rewardCaption.textContent = 'Every last bite! Ice Cream Quest complete!';
      player.position.y = .08 + Math.abs(Math.sin(seconds * 7)) * .18;
    }
  }
  if(elapsed > duration) finishReward();
}

function finishReward(){
  if(!session || session.phase !== 'reward') return;
  player.position.y = .08;
  rewardCone.visible = false;
  refs.rewardCaption.hidden = true;
  session.phase = 'complete';
  session.completedAt = Date.now();
  persistSession();
  updateHUD();
  showCompletion();
}

function updateCamera(delta){
  if(!camera || !player) return;
  let headingDifference = player.rotation.y - cameraHeading;
  headingDifference = Math.atan2(Math.sin(headingDifference), Math.cos(headingDifference));
  cameraHeading += headingDifference * (1 - Math.exp(-delta * CAMERA_TURN_RESPONSE));
  cameraForward.set(Math.sin(cameraHeading), 0, Math.cos(cameraHeading));
  const followDistance = session?.phase === 'reward' ? 7.4 : 8.8;
  const followHeight = session?.phase === 'reward' ? 4.9 : 5.5;
  cameraDesired.set(
    player.position.x - cameraForward.x * followDistance,
    player.position.y + followHeight,
    player.position.z - cameraForward.z * followDistance
  );
  cameraLookDesired.set(
    player.position.x + cameraForward.x * (session?.phase === 'reward' ? 2.2 : 5.2),
    player.position.y + 1.78,
    player.position.z + cameraForward.z * (session?.phase === 'reward' ? 2.2 : 5.2)
  );
  const factor = 1 - Math.exp(-delta * 5.2);
  camera.position.lerp(cameraDesired, factor);
  cameraLook.lerp(cameraLookDesired, 1 - Math.exp(-delta * 7.2));
  camera.lookAt(cameraLook);
  if(sunlight && sunlightTarget){
    sunlight.position.set(player.position.x - 32, 55, player.position.z + 28);
    sunlightTarget.position.set(player.position.x, 0, player.position.z);
    sunlightTarget.updateMatrixWorld();
  }
}

function renderFrame(now){
  if(!active) return;
  const delta = Math.min(.05, previousTime ? (now - previousTime) / 1000 : .016);
  previousTime = now;
  const elapsed = now / 1000;
  updatePlayer(delta, elapsed);
  animateCoins(now);
  animateWater(now);
  animateHarbor(elapsed,delta);
  updateReward(now);
  updateCamera(delta);
  renderer.render(scene, camera);
  raf = requestAnimationFrame(renderFrame);
}

function setOverlay({ eyebrow, title, text, primaryText, secondaryText = '', results = false, onPrimary, onSecondary }){
  refs.overlayEyebrow.textContent = eyebrow;
  refs.overlayTitle.textContent = title;
  refs.overlayText.textContent = text;
  refs.overlayResults.hidden = !results;
  refs.primary.textContent = primaryText;
  refs.secondary.textContent = secondaryText;
  refs.secondary.hidden = !secondaryText;
  overlayPrimaryHandler = onPrimary;
  overlaySecondaryHandler = onSecondary;
  refs.overlay.hidden = false;
}

function beginExploring(){
  if(!session) return;
  if(session.phase === 'complete'){
    showCompletion();
    return;
  }
  if(session.phase === 'challenge') session.phase = collectedCount() === TOTAL_COINS ? 'storeUnlocked' : 'exploring';
  refs.overlay.hidden = true;
  refs.challenge.hidden = true;
  refs.rewardCaption.hidden = true;
  updateHUD();
}

function resetQuest(){
  session = createSession();
  if(!session){
    setOverlay({
      eyebrow:'Word list needed',
      title:'Add at least 10 words',
      text:'This activity needs ten unique spelling words before the island can be explored.',
      primaryText:'Back Home',
      onPrimary:() => services.goHome()
    });
    return;
  }
  player.position.set(START_POSITION.x, .08, START_POSITION.z);
  player.rotation.y = Math.PI / 2;
  cameraHeading = player.rotation.y;
  camera.position.set(START_POSITION.x - 8.8, 5.55, START_POSITION.z);
  cameraLook.set(START_POSITION.x + 5.2, 1.8, START_POSITION.z);
  rewardCone.visible = false;
  rebuildCoins();
  persistSession();
  beginExploring();
}

function showIntro(saved){
  const count = collectedCount();
  if(saved && session.phase === 'complete'){
    showCompletion();
    return;
  }
  setOverlay({
    eyebrow:'Sullivan’s Island mission',
    title:'Ice Cream Quest',
    text:saved && count
      ? `Welcome back! You have ${count} of 10 coins. Find the rest, solve each spelling challenge, then visit the ice cream shop.`
      : 'Explore a sunny Lowcountry island, collect 10 gold coins, and spell every word you hear. Find them all to unlock a giant ice cream cone!',
    primaryText:saved && count ? 'Continue Quest →' : 'Start Exploring →',
    secondaryText:saved && count ? 'New Quest' : '',
    onPrimary:beginExploring,
    onSecondary:resetQuest
  });
}

function showCompletion(){
  const attempts = TOTAL_COINS + (session?.wrongAttempts || 0);
  refs.resultFirst.textContent = `${session?.firstTry || 0} / ${TOTAL_COINS}`;
  refs.resultTries.textContent = attempts;
  refs.resultStars.textContent = `${TOTAL_COINS * 15} ⭐`;
  setOverlay({
    eyebrow:'Quest complete',
    title:'Ice Cream Victory! 🍦',
    text:'You found every gold coin, spelled all 10 words, and enjoyed the biggest cone on Sullivan’s Island.',
    primaryText:'Play Again ↻',
    secondaryText:'Home',
    results:true,
    onPrimary:resetQuest,
    onSecondary:() => services.goHome()
  });
}

function setJoystickFromPointer(event){
  const rect = refs.joystick.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  let x = event.clientX - centerX;
  let y = event.clientY - centerY;
  const max = rect.width * .31;
  const length = Math.hypot(x, y);
  if(length > max){ x = x / length * max; y = y / length * max; }
  joystickVector.set(x / max, y / max);
  refs.joystickKnob.style.transform = `translate(calc(-50% + ${x}px),calc(-50% + ${y}px))`;
}

function releaseJoystick(){
  joystickVector.set(0, 0);
  if(refs.joystickKnob) refs.joystickKnob.style.transform = 'translate(-50%,-50%)';
}

function bindEvents(){
  window.addEventListener('keydown', event => {
    if(!active) return;
    if(event.key === 'Escape' && !refs.challenge.hidden){
      event.preventDefault();
      exitChallenge();
      return;
    }
    const textEntry = event.target?.closest?.('input, textarea, select, [contenteditable="true"]');
    if(textEntry || !refs.challenge.hidden || !refs.overlay.hidden) return;
    if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyA','KeyS','KeyD'].includes(event.code)){
      keys.add(event.code);
      event.preventDefault();
    }
  });
  window.addEventListener('keyup', event => keys.delete(event.code));
  window.addEventListener('blur', () => { keys.clear(); releaseJoystick(); pointerVector.set(0,0); });
  document.addEventListener('visibilitychange', () => { if(document.hidden) persistSession(); });

  refs.home.addEventListener('click', () => services.goHome());
  refs.primary.addEventListener('click', () => overlayPrimaryHandler?.());
  refs.secondary.addEventListener('click', () => overlaySecondaryHandler?.());
  refs.challengeExit.addEventListener('click', exitChallenge);
  refs.hear.addEventListener('click', () => currentCoinIndex >= 0 && services.speak(session.words[currentCoinIndex]));
  refs.form.addEventListener('submit', event => { event.preventDefault(); submitChallenge(); });

  refs.joystick.addEventListener('pointerdown', event => {
    refs.joystick.setPointerCapture(event.pointerId);
    setJoystickFromPointer(event);
  });
  refs.joystick.addEventListener('pointermove', event => {
    if(refs.joystick.hasPointerCapture(event.pointerId)) setJoystickFromPointer(event);
  });
  refs.joystick.addEventListener('pointerup', releaseJoystick);
  refs.joystick.addEventListener('pointercancel', releaseJoystick);

  let canvasDrag = null;
  refs.canvas.addEventListener('pointerdown', event => {
    if(event.pointerType === 'touch' || event.button !== 0 || !['exploring','storeUnlocked'].includes(currentPhase())) return;
    canvasDrag = { id:event.pointerId, x:event.clientX, y:event.clientY };
    refs.canvas.setPointerCapture(event.pointerId);
  });
  refs.canvas.addEventListener('pointermove', event => {
    if(!canvasDrag || canvasDrag.id !== event.pointerId) return;
    pointerVector.set(
      THREE.MathUtils.clamp((event.clientX - canvasDrag.x) / 70, -1, 1),
      THREE.MathUtils.clamp((event.clientY - canvasDrag.y) / 70, -1, 1)
    );
  });
  const releaseCanvas = event => {
    if(canvasDrag && (!event || canvasDrag.id === event.pointerId)){
      canvasDrag = null;
      pointerVector.set(0,0);
    }
  };
  refs.canvas.addEventListener('pointerup', releaseCanvas);
  refs.canvas.addEventListener('pointercancel', releaseCanvas);
  refs.canvas.addEventListener('contextmenu', event => event.preventDefault());
  refs.canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    setOverlay({
      eyebrow:'Island paused',
      title:'The 3D view needs a refresh',
      text:'Your coin progress is safe. Reload the page to continue exploring.',
      primaryText:'Back Home',
      onPrimary:() => services.goHome()
    });
  });
}

function start(api){
  services = api;
  if(!services?.words || !document.getElementById('islandGameShell')) return;
  const saved = loadSession();
  session = saved || createSession();
  if(session?.phase === 'challenge') session.phase = collectedCount() === TOTAL_COINS ? 'storeUnlocked' : 'exploring';
  if(session?.phase === 'reward') session.phase = 'storeUnlocked';
  if(!initialized){
    try { setupRenderer(); }
    catch(error){
      console.error('Island Quest could not initialize.', error);
      bindRefs();
      setOverlay({
        eyebrow:'3D unavailable',
        title:'The island could not open',
        text:'This device could not start the 3D island. Your other spelling activities are still available.',
        primaryText:'Back Home',
        onPrimary:() => services.goHome()
      });
      return;
    }
  } else {
    if(!session) session = createSession();
    player.position.set(session?.player?.x ?? START_POSITION.x, .04, session?.player?.z ?? START_POSITION.z);
    player.rotation.y = session?.player?.heading ?? Math.PI / 2;
    cameraHeading = player.rotation.y;
    camera.position.set(
      player.position.x - Math.sin(cameraHeading) * 10.8,
      6.4,
      player.position.z - Math.cos(cameraHeading) * 10.8
    );
    cameraLook.set(
      player.position.x + Math.sin(cameraHeading) * 6.4,
      1.9,
      player.position.z + Math.cos(cameraHeading) * 6.4
    );
    player.position.y = .04;
    if(rewardCone) rewardCone.visible = false;
    rebuildCoins();
    resizeRenderer();
  }
  active = true;
  previousTime = 0;
  keys.clear();
  releaseJoystick();
  pointerVector.set(0,0);
  refs.challenge.hidden = true;
  refs.rewardCaption.hidden = true;
  if(!session){
    setOverlay({
      eyebrow:'Word list needed',
      title:'Add at least 10 words',
      text:'This activity needs ten unique spelling words before the island can be explored.',
      primaryText:'Back Home',
      onPrimary:() => services.goHome()
    });
    return;
  }
  updateHUD();
  showIntro(Boolean(saved));
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(renderFrame);
}

function stop(){
  if(!initialized) return;
  active = false;
  cancelAnimationFrame(raf);
  raf = 0;
  keys.clear();
  releaseJoystick();
  pointerVector.set(0,0);
  if(session?.phase === 'challenge') session.phase = collectedCount() === TOTAL_COINS ? 'storeUnlocked' : 'exploring';
  if(session?.phase === 'reward') session.phase = 'storeUnlocked';
  currentCoinIndex = -1;
  refs.challenge.hidden = true;
  refs.rewardCaption.hidden = true;
  persistSession();
  if('speechSynthesis' in window) speechSynthesis.cancel();
}

window.IslandQuest = { start, stop };

export { TOTAL_COINS, WORLD_SCALE, ISLAND_LENGTH_SCALE, ISLAND_WIDTH_SCALE, ISLAND_HALF_LENGTH, START_POSITION, STORE_POSITION, COIN_LOCATIONS, HOUSE_LOCATIONS, TREE_LOCATIONS, normalize, shuffled, islandEdge, islandHalfWidth, cameraRelativeMovement };
