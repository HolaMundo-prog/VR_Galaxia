// main.js - versión corregida para entrar a WebXR directamente
// Asegúrate de servir por HTTPS / servidor local

// UI
const startScreen = document.getElementById('startScreen');
const startBtn = document.getElementById('startBtn');
const enterVrBtn = document.getElementById('enterVrBtn');
const hud = document.getElementById('hud');
const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');
const endScreen = document.getElementById('endScreen');
const finalText = document.getElementById('finalText');
const restartBtn = document.getElementById('restartBtn');
const endBtn = document.getElementById('endBtn');

const canvas = document.getElementById('xr-canvas');
const audio = new Audio('assets/fondo.mp3');
audio.loop = true;

// three.js essentials
let scene, camera, renderer;
let gems = [], obstacles = [];
let score = 0, best = parseInt(localStorage.getItem('aq_best')||'0',10);
bestEl.innerText = 'Mejor: ' + best;
let running = false;
let gameOver = false;

// settings
const ROAD_LENGTH = 600;
const GEM_COUNT = 36;
const OBST_COUNT = 26;
let worldZ = 0;
const speed = 0.12; // world forward per frame

// input fallback for desktop
let inputX = 0;
window.addEventListener('keydown', e => {
  if (e.key === 'ArrowLeft' || e.key === 'a') inputX = -1;
  if (e.key === 'ArrowRight' || e.key === 'd') inputX = 1;
  if (e.key === 'Enter' && !running) startGame();
});
window.addEventListener('keyup', e => { if (['ArrowLeft','a','ArrowRight','d'].includes(e.key)) inputX = 0; });

// START button: user gesture (needed for audio / autoplay policies)
startBtn.addEventListener('click', ()=>{
  // play a tiny silent sound to unlock audio if needed
  audio.play().catch(()=>{/* ignore */});
  startGame();
});

// custom Enter VR button: request an immersive-vr session and set it on renderer.xr
enterVrBtn.addEventListener('click', async ()=>{
  if (!navigator.xr) {
    alert('WebXR no está disponible en este navegador.');
    return;
  }
  try {
    const isSupported = await navigator.xr.isSessionSupported('immersive-vr');
    if (!isSupported) return alert('immersive-vr no soportado en este dispositivo.');
    const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor','bounded-floor','hand-tracking'] });
    // ensure renderer is initialized
    if (!renderer) initScene();
    renderer.xr.setSession(session);
    // hide start screen when entering VR if game already running
    if (running) startScreen.classList.add('hidden');
  } catch (err) {
    console.error('No se pudo crear sesión VR:', err);
    alert('Fallo al entrar a VR: ' + (err && err.message ? err.message : err));
  }
});

// RESTART / END buttons
restartBtn.addEventListener('click', ()=> location.reload());
endBtn.addEventListener('click', ()=> endGame());

// Start game logic (initializes scene then sets running)
function startGame(){
  if (!renderer) initScene();
  startScreen.classList.add('hidden');
  hud.classList.remove('hidden');
  audio.play().catch(()=>{});
  running = true;
}

// Initialize three.js scene and objects
function initScene(){
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x06121a);

  camera = new THREE.PerspectiveCamera(70, window.innerWidth/window.innerHeight, 0.01, 1000);
  camera.position.set(0, 1.6, 2);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;

  // light
  const hemi = new THREE.HemisphereLight(0x88bbff, 0x222233, 0.9);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff, 0.6);
  dir.position.set(3, 10, 5);
  scene.add(dir);

  createRoad();
  createPlayerMarker();
  spawnGems();
  spawnObstacles();

  window.addEventListener('resize', onResize);
  renderer.setAnimationLoop(loop);
}

// Simple visual cue for player position (not a physical car model)
let playerMarker;
function createPlayerMarker(){
  const geom = new THREE.CylinderGeometry(0.01, 0.01, 0.01, 4); // invisible
  playerMarker = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({visible:false}));
  playerMarker.position.set(0, 1.6, 0);
  scene.add(playerMarker);
}

// Road (long plane)
function createRoad(){
  const g = new THREE.PlaneGeometry(12, ROAD_LENGTH, 1, 1);
  const m = new THREE.MeshStandardMaterial({color:0x111217});
  const road = new THREE.Mesh(g,m);
  road.rotation.x = -Math.PI/2;
  road.position.z = -ROAD_LENGTH/2 + 5;
  scene.add(road);

  // lane markers
  const mat = new THREE.MeshBasicMaterial({color:0x323232});
  for(let i=0;i<200;i++){
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.2,0.02,2), mat);
    stripe.position.set(0, 0.01, -i*3 - 2);
    scene.add(stripe);
  }
}

// Gems
function spawnGems(){
  const geom = new THREE.OctahedronGeometry(0.18);
  const mat = new THREE.MeshStandardMaterial({color:0x00f5d4,metalness:0.4,roughness:0.2});
  for(let i=0;i<GEM_COUNT;i++){
    const mesh = new THREE.Mesh(geom, mat.clone());
    mesh.position.set((Math.random()-0.5)*6, 1 + Math.random()*0.6, -5 - Math.random()*170);
    mesh.userData.collected = false;
    scene.add(mesh);
    gems.push(mesh);
  }
}

// Obstacles
function spawnObstacles(){
  const geom = new THREE.BoxGeometry(1.3,1.3,1.3);
  for(let i=0;i<OBST_COUNT;i++){
    const mat = new THREE.MeshStandardMaterial({color: new THREE.Color().setHSL(Math.random(),0.8,0.5)});
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set((Math.random()-0.5)*6, 1, -8 - Math.random()*180);
    scene.add(mesh);
    obstacles.push(mesh);
  }
}

// Main loop
function loop(timestamp, frame){
  // render only when scene ready
  if (!scene || !camera) return;

  // if not running, still render (so VR view works) but don't advance world
  if (running && !gameOver){
    // Advance world (move scene forward)
    worldZ += speed;
    scene.traverse(obj=>{
      if (obj.isMesh && obj.geometry && obj.geometry.type === 'PlaneGeometry') {
        // don't move road
      }
    });

    // handle input: joystick right-handed preferred
    handleXRInput();

    // update gems (rotation + check collision)
    for (let i = gems.length -1; i >=0; i--){
      const g = gems[i];
      g.rotation.y += 0.04;
      // distance test against camera world position
      const camPos = new THREE.Vector3();
      camera.getWorldPosition(camPos);
      if (g.position.distanceTo(camPos) < 1.0 && !g.userData.collected){
        g.userData.collected = true;
        scene.remove(g);
        gems.splice(i,1);
        score++;
        scoreEl.innerText = score;
      }
      // optionally recycle gems if behind
      if (g.position.z > camPos.z + 5) {
        // move further ahead instead of removing (keeps gameplay longer)
        g.position.z = -50 - Math.random()*160;
        g.position.x = (Math.random()-0.5)*6;
      }
    }

    // obstacles collision
    const camPos = new THREE.Vector3(); camera.getWorldPosition(camPos);
    for (let obs of obstacles){
      // simple collision radius
      if (obs.position.distanceTo(camPos) < 1.1){
        // hit
        endGame();
        break;
      }
      // recycle obstacles past camera to keep road populated
      if (obs.position.z > camPos.z + 6){
        obs.position.z = -50 - Math.random()*180;
        obs.position.x = (Math.random()-0.5)*6;
      }
    }

    // move all dynamic objects slowly towards camera to simulate motion
    const moveAmount = speed;
    gems.forEach(g=> g.position.z += moveAmount);
    obstacles.forEach(o=> o.position.z += moveAmount);
    // lane stripes: we kept them static to avoid complexity

  }

  renderer.render(scene, camera);
}

// XR input handling: read right-hand joystick axes if present; fallback to keyboard inputX
function handleXRInput(){
  // default lateral input from keyboard
  let lateral = inputX * 0.02;
  if (renderer && renderer.xr && renderer.xr.isPresenting){
    const session = renderer.xr.getSession();
    if (session){
      for(const inputSource of session.inputSources){
        if (!inputSource.gamepad) continue;
        // prefer right handed controller
        if (inputSource.handedness === 'right' || !lateral){
          const gp = inputSource.gamepad;
          // axis 2 in some controllers, axis 0 in others — try common indices
          const ax = (gp.axes.length >= 2) ? gp.axes[2] ?? gp.axes[0] : gp.axes[0] ?? 0;
          lateral = ax * 0.03;
        }
      }
    }
  }
  // apply lateral to camera x but clamp
  camera.position.x = THREE.MathUtils.clamp(camera.position.x + lateral, -4, 4);
}

// End game
function endGame(){
  if (gameOver) return;
  gameOver = true;
  running = false;
  finalText.innerText = `Gemas: ${score}`;
  endScreen.classList.remove('hidden');
  if (score > best){ localStorage.setItem('aq_best', score); best = score; bestEl.innerText = 'Mejor: ' + best; }
  audio.pause();
}

// resize
function onResize(){
  if (!camera || !renderer) return;
  camera.aspect = window.innerWidth/window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
