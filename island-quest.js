import * as THREE from './vendor/three.module.min.js';

const STORAGE_KEY = 'spellingQuestIslandV1';
const SESSION_VERSION = 1;
const TOTAL_COINS = 10;
const PLAYER_RADIUS = .72;
const STORE_POSITION = { x: 28, z: -1.4 };
const START_POSITION = { x: -38, z: 0 };
const COIN_LOCATIONS = [
  { x: -35, z: 4.1, label: 'lighthouse dunes' },
  { x: -28, z: -6.1, label: 'fort path' },
  { x: -20, z: 7.2, label: 'beach walk' },
  { x: -13, z: -4.8, label: 'live oak lane' },
  { x: -5, z: 7.7, label: 'ocean overlook' },
  { x: 3, z: -7.4, label: 'marsh trail' },
  { x: 11, z: 5.9, label: 'station path' },
  { x: 18, z: -5.6, label: 'palmetto grove' },
  { x: 25, z: 6.2, label: 'village beach' },
  { x: 36, z: 1.8, label: 'island point' }
];

let services = null;
let active = false;
let initialized = false;
let renderer = null;
let scene = null;
let camera = null;
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
const moveVector = new THREE.Vector3();
const clockVector = new THREE.Vector3();
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
    player: { ...START_POSITION },
    startedAt: Date.now(),
    completedAt: null
  };
}

function isValidSavedSession(value){
  if(!value || value.version !== SESSION_VERSION || !Array.isArray(value.words) || value.words.length !== TOTAL_COINS) return false;
  if(!Array.isArray(value.collected) || value.collected.length !== TOTAL_COINS) return false;
  const available = new Set(services.words.map(item => item.word));
  return value.words.every(word => available.has(word));
}

function loadSession(){
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return isValidSavedSession(saved) ? saved : null;
  } catch {
    return null;
  }
}

function persistSession(){
  if(!session) return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(session)); } catch {}
}

function material(color, roughness = .86, metalness = 0){
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading:true });
}

function mesh(geometry, mat, cast = true, receive = true){
  const item = new THREE.Mesh(geometry, mat);
  item.castShadow = cast;
  item.receiveShadow = receive;
  return item;
}

function islandHalfWidth(x, inset = 0){
  const normalizedX = Math.min(1, Math.abs(x) / (43 - inset));
  return Math.max(3.5, 5.4 + 6.2 * Math.sqrt(Math.max(0, 1 - normalizedX * normalizedX)) - inset * .58);
}

function buildIslandShape(inset = 0){
  const shape = new THREE.Shape();
  const minX = -43 + inset;
  const maxX = 43 - inset;
  for(let i = 0; i <= 48; i++){
    const x = minX + (maxX - minX) * (i / 48);
    const z = islandHalfWidth(x, inset);
    if(i === 0) shape.moveTo(x, z); else shape.lineTo(x, z);
  }
  for(let i = 48; i >= 0; i--){
    const x = minX + (maxX - minX) * (i / 48);
    shape.lineTo(x, -islandHalfWidth(x, inset));
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
  context.font = '900 62px ui-rounded, system-ui, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, surface.width / 2, surface.height / 2 + 3);
  const texture = new THREE.CanvasTexture(surface);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function addHouse(x, z, color, scale = 1, rotation = 0){
  const group = new THREE.Group();
  const body = mesh(new THREE.BoxGeometry(3.5 * scale, 2.35 * scale, 3 * scale), material(color));
  body.position.y = 1.25 * scale;
  const roof = mesh(new THREE.ConeGeometry(2.8 * scale, 1.35 * scale, 4), material(0x71514a));
  roof.position.y = 3.05 * scale;
  roof.rotation.y = Math.PI / 4;
  const door = mesh(new THREE.BoxGeometry(.7 * scale, 1.35 * scale, .16), material(0xf0d399), false);
  door.position.set(0, .78 * scale, 1.56 * scale);
  const windowMat = material(0x7fd6e7, .35, .05);
  [-1, 1].forEach(side => {
    const window = mesh(new THREE.BoxGeometry(.62 * scale, .62 * scale, .18), windowMat, false);
    window.position.set(side * .95 * scale, 1.55 * scale, 1.57 * scale);
    group.add(window);
  });
  group.add(body, roof, door);
  group.position.set(x, 0, z);
  group.rotation.y = rotation;
  scene.add(group);
  addCollider(x, z, 2.25 * scale);
  return group;
}

function addPalm(x, z, scale = 1){
  const group = new THREE.Group();
  const trunk = mesh(new THREE.CylinderGeometry(.2 * scale, .31 * scale, 3.4 * scale, 7), material(0x9d714a));
  trunk.position.y = 1.7 * scale;
  trunk.rotation.z = (Math.random() - .5) * .08;
  group.add(trunk);
  for(let i = 0; i < 7; i++){
    const leaf = mesh(new THREE.ConeGeometry(.48 * scale, 2.2 * scale, 5), material(i % 2 ? 0x2e8453 : 0x43a55c), false);
    leaf.position.y = 3.55 * scale;
    leaf.rotation.z = Math.PI / 2.35;
    leaf.rotation.y = i / 7 * Math.PI * 2;
    leaf.position.x = Math.sin(i / 7 * Math.PI * 2) * .65 * scale;
    leaf.position.z = Math.cos(i / 7 * Math.PI * 2) * .65 * scale;
    group.add(leaf);
  }
  const coconuts = material(0x8b5a2b);
  for(let i = 0; i < 3; i++){
    const coconut = mesh(new THREE.SphereGeometry(.2 * scale, 8, 6), coconuts, false);
    coconut.position.set((i - 1) * .23 * scale, 3.32 * scale, (i % 2) * .2 * scale);
    group.add(coconut);
  }
  group.position.set(x, 0, z);
  scene.add(group);
  addCollider(x, z, .48 * scale);
  return group;
}

function addLiveOak(x, z, scale = 1){
  const group = new THREE.Group();
  const trunkMat = material(0x6f553e);
  const canopyMat = material(0x386f48);
  const trunk = mesh(new THREE.CylinderGeometry(.36 * scale, .58 * scale, 3 * scale, 7), trunkMat);
  trunk.position.y = 1.45 * scale;
  group.add(trunk);
  const canopyPositions = [[0,3.2,0],[-1.1,3,.1],[1.05,3.15,.15],[-.5,3.5,-.55],[.65,3.45,-.45]];
  canopyPositions.forEach(([px,py,pz], index) => {
    const crown = mesh(new THREE.IcosahedronGeometry((index ? 1.25 : 1.5) * scale, 1), canopyMat, true);
    crown.scale.y = .72;
    crown.position.set(px * scale, py * scale, pz * scale);
    group.add(crown);
  });
  group.position.set(x, 0, z);
  scene.add(group);
  addCollider(x, z, .75 * scale);
  return group;
}

function addLighthouse(){
  const group = new THREE.Group();
  const colors = [0xf7f1df, 0xea625d, 0xf7f1df, 0xea625d, 0xf7f1df];
  for(let i = 0; i < 5; i++){
    const segment = mesh(new THREE.CylinderGeometry(.6 - i * .055, .69 - i * .055, 1.35, 16), material(colors[i]));
    segment.position.y = .68 + i * 1.33;
    group.add(segment);
  }
  const gallery = mesh(new THREE.CylinderGeometry(.82, .82, .2, 16), material(0x263e43));
  gallery.position.y = 6.78;
  const lamp = mesh(new THREE.CylinderGeometry(.48, .53, .8, 12), material(0x89dcdf, .25));
  lamp.position.y = 7.25;
  const roof = mesh(new THREE.ConeGeometry(.66, .62, 12), material(0x263e43));
  roof.position.y = 7.92;
  group.add(gallery, lamp, roof);
  group.position.set(-34, 0, -2.1);
  scene.add(group);
  addCollider(-34, -2.1, 1.15);
}

function addFort(){
  const group = new THREE.Group();
  const stone = material(0x8b8173);
  const wall = mesh(new THREE.BoxGeometry(8, 1.55, 3.4), stone);
  wall.position.y = .78;
  group.add(wall);
  for(let i = -3; i <= 3; i += 1.5){
    const top = mesh(new THREE.BoxGeometry(.85, .65, .75), stone);
    top.position.set(i, 1.85, 0);
    group.add(top);
  }
  const arch = mesh(new THREE.BoxGeometry(1.35, 1.3, .35), material(0x423f3a), false);
  arch.position.set(0, .72, 1.75);
  group.add(arch);
  group.position.set(-25, 0, 1.2);
  group.rotation.y = -.08;
  scene.add(group);
  addCollider(-25, 1.2, 4.15);
}

function addIceCreamStore(){
  const group = new THREE.Group();
  const body = mesh(new THREE.BoxGeometry(5.4, 3.1, 4.2), material(0xffb7b1));
  body.position.y = 1.55;
  group.add(body);
  const roof = mesh(new THREE.ConeGeometry(4.1, 1.7, 4), material(0x5d8f79));
  roof.position.y = 3.95;
  roof.rotation.y = Math.PI / 4;
  group.add(roof);
  const awningGroup = new THREE.Group();
  for(let i = 0; i < 7; i++){
    const stripe = mesh(new THREE.BoxGeometry(.78, .24, 1.05), material(i % 2 ? 0xff5f64 : 0xfff4df), false);
    stripe.position.set(-2.35 + i * .78, 2.48, 2.45);
    stripe.rotation.x = -.2;
    awningGroup.add(stripe);
  }
  group.add(awningGroup);
  const counter = mesh(new THREE.BoxGeometry(3.7, 1.3, .65), material(0xfff4df));
  counter.position.set(0, 1.2, 2.2);
  group.add(counter);
  const signTexture = makeCanvasTexture('ICE CREAM', '#3f5b57', '#fff4df');
  const sign = mesh(new THREE.PlaneGeometry(3.7, 1.15), new THREE.MeshBasicMaterial({ map:signTexture, transparent:false }), false, false);
  sign.position.set(0, 3.05, 2.115);
  group.add(sign);
  const coneSign = createIceCreamCone(.68);
  coneSign.position.set(2.35, 4.35, .4);
  coneSign.rotation.z = -.12;
  group.add(coneSign);
  group.position.set(STORE_POSITION.x, 0, STORE_POSITION.z);
  scene.add(group);
  addCollider(STORE_POSITION.x, STORE_POSITION.z, 3.2);

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
  for(let i = 0; i < 8; i++){
    const plank = mesh(new THREE.BoxGeometry(1.05, .18, 3.4), wood);
    plank.position.set(-46.5 - i * .95, .05, 0);
    dock.add(plank);
  }
  for(let i = 0; i < 5; i++){
    [-1.45, 1.45].forEach(z => {
      const post = mesh(new THREE.CylinderGeometry(.16, .2, 1.5, 8), material(0x765238));
      post.position.set(-46.2 - i * 1.8, -.2, z);
      dock.add(post);
    });
  }
  scene.add(dock);
}

function addBeachDetails(){
  const shellMat = material(0xf7c2a2);
  [[-40,6.5],[33,-6.8],[7,9.5],[-12,-9.4]].forEach(([x,z], index) => {
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
  [[-39,-5.4,1.2],[-18,-9,1],[14,8.6,.8],[39,-4.2,1.1]].forEach(([x,z,s]) => {
    const rock = mesh(new THREE.DodecahedronGeometry(s, 0), rockMat);
    rock.scale.y = .6;
    rock.position.set(x, .45 * s, z);
    scene.add(rock);
    addCollider(x, z, s * .85);
  });
}

function addRoads(){
  const roadMat = material(0xd9be86);
  const main = mesh(new THREE.PlaneGeometry(63, 2.7), roadMat, false, true);
  main.rotation.x = -Math.PI / 2;
  main.position.set(1, .025, 0);
  scene.add(main);
  [-22,-7,9,23].forEach((x, index) => {
    const cross = mesh(new THREE.PlaneGeometry(index === 3 ? 10 : 13, 1.75), roadMat, false, true);
    cross.rotation.x = -Math.PI / 2;
    cross.rotation.z = Math.PI / 2;
    cross.position.set(x, .03, index % 2 ? -.4 : .5);
    scene.add(cross);
  });
}

function buildWorld(){
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x92dff0);
  scene.fog = new THREE.Fog(0xa7e1ec, 55, 105);
  colliders.length = 0;

  const hemisphere = new THREE.HemisphereLight(0xdaf8ff, 0x6e8251, 2.25);
  scene.add(hemisphere);
  const sunlight = new THREE.DirectionalLight(0xfff1cf, 3.1);
  sunlight.position.set(-18, 30, 24);
  sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(1024, 1024);
  sunlight.shadow.camera.left = -52;
  sunlight.shadow.camera.right = 52;
  sunlight.shadow.camera.top = 30;
  sunlight.shadow.camera.bottom = -30;
  sunlight.shadow.bias = -.0007;
  scene.add(sunlight);

  const water = mesh(new THREE.PlaneGeometry(150, 90, 1, 1), material(0x58bed0, .28, .04), false, true);
  water.rotation.x = -Math.PI / 2;
  water.position.y = -.42;
  scene.add(water);

  const sand = mesh(new THREE.ShapeGeometry(buildIslandShape(0), 48), material(0xf2d28b), false, true);
  sand.rotation.x = -Math.PI / 2;
  sand.position.y = -.05;
  scene.add(sand);
  const grass = mesh(new THREE.ShapeGeometry(buildIslandShape(2.05), 48), material(0x72b65d), false, true);
  grass.rotation.x = -Math.PI / 2;
  grass.position.y = 0;
  scene.add(grass);

  addRoads();
  addDock();
  addLighthouse();
  addFort();
  addIceCreamStore();
  addBeachDetails();

  addHouse(-17, -1.8, 0xf4c889, .9, .06);
  addHouse(-9.5, 2.8, 0xc1d9e8, .82, -.08);
  addHouse(2, 2.7, 0xf4ad87, .88, .05);
  addHouse(9.5, -2.6, 0xd8c3ef, .82, -.05);
  addHouse(17, 2.2, 0xf1df9b, .9, .06);

  [[-39,2.4,.9],[-31,7.1,.82],[-19,-6.6,.78],[-14,5.4,.9],[-2,-5.8,.82],[5,5.7,.92],[14,-7.2,.84],[21,5.7,.78],[33,-5.2,.95],[38,4.4,.78]].forEach(args => addPalm(...args));
  [[-12,-.2,.92],[-4,2.4,1],[6,-2.2,.82],[19,-1.8,.92],[34,5.2,.75]].forEach(args => addLiveOak(...args));

  createPlayer();
  rebuildCoins();
}

function createPlayer(){
  player = new THREE.Group();
  const skin = material(0xf0b98c);
  const shirt = material(0x4c91e5);
  const shorts = material(0x315b9c);
  const shoe = material(0xffffff);
  const dark = material(0x26343b);
  const body = mesh(new THREE.CapsuleGeometry(.48, .7, 5, 9), shirt);
  body.position.y = 1.45;
  const head = mesh(new THREE.SphereGeometry(.55, 16, 12), skin);
  head.position.y = 2.5;
  const hair = mesh(new THREE.SphereGeometry(.57, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2.2), dark);
  hair.position.y = 2.63;
  const eyeLeft = mesh(new THREE.SphereGeometry(.055, 7, 6), dark, false);
  const eyeRight = eyeLeft.clone();
  eyeLeft.position.set(-.19, 2.55, .5);
  eyeRight.position.set(.19, 2.55, .5);
  const armLeft = mesh(new THREE.CapsuleGeometry(.12, .64, 4, 7), skin);
  const armRight = armLeft.clone();
  armLeft.position.set(-.62, 1.48, 0);
  armRight.position.set(.62, 1.48, 0);
  const legLeft = mesh(new THREE.CapsuleGeometry(.15, .58, 4, 7), shorts);
  const legRight = legLeft.clone();
  legLeft.position.set(-.24, .55, 0);
  legRight.position.set(.24, .55, 0);
  const shoeLeft = mesh(new THREE.BoxGeometry(.32, .2, .52), shoe);
  const shoeRight = shoeLeft.clone();
  shoeLeft.position.set(-.24, .16, .13);
  shoeRight.position.set(.24, .16, .13);
  player.add(body, head, hair, eyeLeft, eyeRight, armLeft, armRight, legLeft, legRight, shoeLeft, shoeRight);
  playerParts = { body, head, armLeft, armRight, legLeft, legRight };
  player.position.set(session?.player?.x ?? START_POSITION.x, .04, session?.player?.z ?? START_POSITION.z);
  scene.add(player);

  rewardCone = createIceCreamCone(.86);
  rewardCone.position.set(.75, 1.1, .15);
  rewardCone.scale.setScalar(.01);
  rewardCone.visible = false;
  player.add(rewardCone);
}

function makeCoin(index){
  const group = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color:0xffcf38, emissive:0xb36a00, emissiveIntensity:.34, roughness:.32, metalness:.62, flatShading:true });
  const edge = new THREE.MeshStandardMaterial({ color:0xffe979, roughness:.25, metalness:.72 });
  const disc = mesh(new THREE.CylinderGeometry(.56, .56, .18, 28), gold);
  disc.rotation.x = Math.PI / 2;
  const ring = mesh(new THREE.TorusGeometry(.37, .07, 7, 22), edge);
  ring.position.z = .1;
  group.add(disc, ring);
  const location = COIN_LOCATIONS[index];
  group.position.set(location.x, 1.15, location.z);
  group.userData = { index, baseY:1.15, collecting:false, collectStartedAt:0 };
  group.visible = !session?.collected?.[index];
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
  renderer.toneMappingExposure = 1.05;
  camera = new THREE.PerspectiveCamera(52, 1, .1, 180);
  camera.position.set(START_POSITION.x + 11, 12, START_POSITION.z + 16);
  buildWorld();
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
  else if(session.phase === 'complete') refs.objective.textContent = 'Island quest complete!';
  else refs.objective.textContent = `Explore the island and find ${TOTAL_COINS - count} more ${TOTAL_COINS - count === 1 ? 'coin' : 'coins'}.`;
}

function showStoreHint(message){
  refs.storeStatus.textContent = message;
  refs.storeStatus.hidden = false;
  clearTimeout(showStoreHint.timer);
  showStoreHint.timer = setTimeout(() => { refs.storeStatus.hidden = true; }, 1900);
}

function isInsideIsland(x, z){
  if(Math.abs(x) > 42.1) return false;
  return Math.abs(z) < islandHalfWidth(x, .65);
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
  const length = Math.hypot(x, z);
  if(length > 1){ x /= length; z /= length; }
  return { x, z, moving:length > .08 };
}

function updatePlayer(delta, elapsed){
  if(!player || !session || !refs.overlay.hidden || !refs.challenge.hidden || !['exploring','storeUnlocked'].includes(session.phase)){
    animatePlayer(false, elapsed);
    return;
  }
  const input = movementInput();
  if(input.moving){
    const speed = 7.2;
    const dx = input.x * speed * delta;
    const dz = input.z * speed * delta;
    const nextX = player.position.x + dx;
    const nextZ = player.position.z + dz;
    if(canStandAt(nextX, player.position.z)) player.position.x = nextX;
    if(canStandAt(player.position.x, nextZ)) player.position.z = nextZ;
    const targetRotation = Math.atan2(input.x, input.z);
    let difference = targetRotation - player.rotation.y;
    difference = Math.atan2(Math.sin(difference), Math.cos(difference));
    player.rotation.y += difference * Math.min(1, delta * 12);
    session.player = { x:Number(player.position.x.toFixed(2)), z:Number(player.position.z.toFixed(2)) };
    if(performance.now() - lastPositionSave > 800){ persistSession(); lastPositionSave = performance.now(); }
  }
  animatePlayer(input.moving, elapsed);
  checkTriggers();
}

function animatePlayer(moving, elapsed){
  if(!playerParts) return;
  const swing = moving ? Math.sin(elapsed * 10) * .58 : 0;
  playerParts.legLeft.rotation.x = swing;
  playerParts.legRight.rotation.x = -swing;
  playerParts.armLeft.rotation.x = -swing * .7;
  if(session?.phase !== 'reward') playerParts.armRight.rotation.x = swing * .7;
  playerParts.body.position.y = 1.45 + (moving ? Math.abs(Math.sin(elapsed * 10)) * .06 : Math.sin(elapsed * 2.2) * .018);
}

function checkTriggers(){
  if(!session || !player) return;
  for(let i = 0; i < TOTAL_COINS; i++){
    if(session.collected[i] || coins[i]?.userData.collecting) continue;
    const location = COIN_LOCATIONS[i];
    if(Math.hypot(player.position.x - location.x, player.position.z - location.z) < 1.55){
      openChallenge(i);
      return;
    }
  }
  const storeDistance = Math.hypot(player.position.x - STORE_POSITION.x, player.position.z - (STORE_POSITION.z + 4.1));
  if(storeDistance < 2.15){
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

function beginReward(){
  if(!session || session.phase !== 'storeUnlocked') return;
  session.phase = 'reward';
  rewardStartedAt = performance.now();
  player.position.set(STORE_POSITION.x, .04, STORE_POSITION.z + 4.15);
  player.rotation.y = Math.PI;
  session.player = { x:player.position.x, z:player.position.z };
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
      refs.rewardCaption.textContent = 'Every last bite! Sullivan’s Island Coin Quest complete!';
      player.position.y = .04 + Math.abs(Math.sin(seconds * 7)) * .18;
    }
  }
  if(elapsed > duration) finishReward();
}

function finishReward(){
  if(!session || session.phase !== 'reward') return;
  player.position.y = .04;
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
  if(session?.phase === 'reward') cameraDesired.set(player.position.x + 7.2, 7.8, player.position.z + 10.2);
  else cameraDesired.set(player.position.x + 10.5, 11.8, player.position.z + 15.5);
  const factor = 1 - Math.exp(-delta * 4.6);
  camera.position.lerp(cameraDesired, factor);
  cameraLook.set(player.position.x, 1.2, player.position.z);
  camera.lookAt(cameraLook);
}

function renderFrame(now){
  if(!active) return;
  const delta = Math.min(.05, previousTime ? (now - previousTime) / 1000 : .016);
  previousTime = now;
  const elapsed = now / 1000;
  updatePlayer(delta, elapsed);
  animateCoins(now);
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
  player.position.set(START_POSITION.x, .04, START_POSITION.z);
  player.rotation.y = Math.PI / 2;
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
    title:'Island Coin Quest',
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

export { TOTAL_COINS, COIN_LOCATIONS, normalize, shuffled, islandHalfWidth };
