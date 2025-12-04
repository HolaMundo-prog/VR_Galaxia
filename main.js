// main.js - Entrar a VR con botón (diseñado para Meta Quest Browser)
// Requisitos: servir por HTTPS o servidor local, colocar assets/fondo.mp3

// UI
const startScreen = document.getElementById('startScreen');
const enterVrBtn = document.getElementById('enterVrBtn');
const startBtn = document.getElementById('startBtn');
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

let renderer, scene, camera;
let gems = [], blocks = [];
let running = false, gameOver = false;
let score = 0;
let best = parseInt(localStorage.getItem('autoquest_best') || '0', 10);
bestEl.innerText = 'Mejor: ' + best;

// Settings
const GEM_COUNT = 40;
const BLOCK_COUNT = 28;
const WORLD_SPEED = 0.12;

// Input fallback
let inputX = 0;
window.addEventListener('keydown', e => {
  if (e.key === 'ArrowLeft' || e.key === 'a') inputX = -1;
  if (e.key === 'ArrowRight' || e.key === 'd') inputX = 1;
  if (e.key === 'Enter' && !running) startGame();
});
window.addEventListener('keyup', e => {
  if (['ArrowLeft','a','ArrowRight','d'].includes(e.key)) inputX = 0;
});

// Buttons
startBtn.addEventListener('click', () => {
  // gesture unlock for audio
  audio.play().catch(()=>{});
  startGame();
});

restartBtn.addEventListener('click', () => location.reload());
endBtn.addEventListener('click', () => endGame());

// Enter VR: request immersive-vr and set session on renderer.xr
enterVrBtn.addEventListener('click', async () => {
  if (!navigator.xr) {
    alert('WebXR no está disponible en este navegador.');
    return;
  }
  try {
    const supported = await navigator.xr.isSessionSupported('immersive-vr');
    if (!supported) return alert('immersive-vr no soportado en este dispositivo.');
    if (!renderer) initScene(); // create renderer before requesting session
    const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor','bounded-floor'] });
    await renderer.xr.setSession(session);
    // Hide start screen when entering VR (if desired)
    startScreen.classList.add('hidden');
  } catch (err) {
    console.error('Error al entrar a VR:', err);
    alert('Fallo al entrar a VR: ' + (err && err.message ? err.message : err));
  }
});

// Initialize scene and rendering (lazy init)
function initScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x06121a);

  camera = new THREE.PerspectiveCamera(70, window.innerWidth/window.innerHeight, 0.01, 1000);
  camera.position.set(0, 1.6, 2);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;

  // lights
  const hemi = new THREE.HemisphereLight(0x88bbff, 0x222233, 0.9);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff, 0.6);
  dir.position.set(3, 10, 5);
  scene.add(dir);

  createTunnel();
  spawnGems();
  spawnBlocks();

  window.addEventListener('resize', onResize);
  renderer.setAnimationLoop(loop);
}

// Create a long tunnel (backside visible)
function createTunnel() {
  const geo = new THREE.CylinderGeometry(8, 8, 600, 32, 8, true);
  const mat = new THREE.MeshStandardMaterial({ color: 0x08131d, side: THREE.BackSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.z = Math.PI/2;
  mesh.position.z = -250;
  scene.add(mesh);

  // faint lane markers (visual)
  const stripeMat = new THREE.MeshBasicMaterial({ color: 0x1b2b34 });
  for (let i=0; i<200; i++){
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.02, 2), stripeMat);
    s.position.set(0, 0.01, -i*3 - 2);
    scene.add(s);
  }
}

// Gems (collectibles)
function spawnGems(){
  const geom = new THREE.OctahedronGeometry(0.18);
  for (let i=0; i<GEM_COUNT; i++){
    const mat = new THREE.MeshStandardMaterial({ color: 0x00f5d4, metalness:0.3, roughness:0.2 });
    const m = new THREE.Mesh(geom, mat);
    m.position.set((Math.random()-0.5)*6, 1 + Math.random()*0.6, -5 - Math.random()*220);
    scene.add(m);
    gems.push(m);
  }
}

// Obstáculos (cubos)
function spawnBlocks(){
  const geom = new THREE.BoxGeometry(1.2, 1.2, 1.2);
  for (let i=0; i<BLOCK_COUNT; i++){
    const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(Math.random(), 0.8, 0.5) });
    const m = new THREE.Mesh(geom, mat);
    m.position.set((Math.random()-0.5)*6, 1.0, -10 - Math.random()*220);
    scene.add(m);
    blocks.push(m);
  }
}

// Start the game (scene will be initialized if not already)
function startGame(){
  if (!renderer) initScene();
  startScreen.classList.add('hidden');
  hud.classList.remove('hidden');
  gameOver = false;
  running = true;
  score = 0;
  scoreEl.innerText = score;
  audio.play().catch(()=>{});
}

// Handle XR + keyboard joystick input
function getLateralInput(){
  let lateral = inputX * 0.02; // keyboard fallback
  if (renderer && renderer.xr && renderer.xr.isPresenting){
    const session = renderer.xr.getSession();
    if (session){
      for (const src of session.inputSources){
        if (!src.gamepad) continue;
        // prefer right-handed controller axes if available
        const gp = src.gamepad;
        // Some controllers map axis 2 to horizontal thumbstick; fallback to axis 0
        const raw = (gp.axes.length >= 3) ? (gp.axes[2] ?? gp.axes[0]) : (gp.axes[0] ?? 0);
        lateral = raw * 0.03;
        // if right handed prefer it
        if (src.handedness === 'right') break;
      }
    }
  }
  return lateral;
}

// Main loop
function loop(){
  if (!scene || !camera) return;
  if (running && !gameOver){
    // movement lateral
    const lateral = getLateralInput();
    camera.position.x = THREE.MathUtils.clamp(camera.position.x + lateral, -4, 4);

    // move environment towards the player by moving objects' z forward slightly
    const move = WORLD_SPEED;
    gems.forEach((g, i) => {
      g.rotation.y += 0.04;
      g.position.z += move;
      // collect
      const camPos = new THREE.Vector3(); camera.getWorldPosition(camPos);
      if (g.position.distanceTo(camPos) < 0.95){
        scene.remove(g);
        gems.splice(i, 1);
        score++;
        scoreEl.innerText = score;
      }
      // recycle far ahead gems
      if (g.position.z > camPos.z + 6){
        g.position.z = -40 - Math.random()*220;
        g.position.x = (Math.random()-0.5)*6;
      }
    });

    // obstacles
    const camPos = new THREE.Vector3(); camera.getWorldPosition(camPos);
    for (let i=blocks.length-1;i>=0;i--){
      const b = blocks[i];
      b.position.z += move;
      if (b.position.distanceTo(camPos) < 1.05){
        // hit
        endGame();
        break;
      }
      if (b.position.z > camPos.z + 6){
        b.position.z = -40 - Math.random()*220;
        b.position.x = (Math.random()-0.5)*6;
      }
    }
  }

  renderer.render(scene, camera);
}

// End game
function endGame(){
  if (gameOver) return;
  gameOver = true;
  running = false;
  hud.classList.add('hidden');
  finalText.innerText = `Gemas: ${score}`;
  endScreen.classList.remove('hidden');
  audio.pause();
  if (score > best){ best = score; localStorage.setItem('autoquest_best', best); bestEl.innerText = 'Mejor: ' + best; }
}

// Resize
function onResize(){
  if (!renderer || !camera) return;
  camera.aspect = window.innerWidth/window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
