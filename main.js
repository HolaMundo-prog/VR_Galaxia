import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';

/** ================= CONFIGURACIÓN ================= */
const CONFIG = {
    shipSpeed: 25,
    laserSpeed: 60,
    asteroidSpeed: 20,
    spawnRate: 0.02, // Probabilidad por frame
    worldDepth: 200,
    limitX: 15,
    limitY: 10
};

const STATE = {
    LOADING: 0,
    MENU: 1,
    PLAYING: 2,
    GAMEOVER: 3
};

let currentState = STATE.LOADING;
let score = 0;
let playerHealth = 100;

/** ================= ESCENA Y RENDERER ================= */
const container = document.getElementById('container');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.shadowMap.enabled = true;
container.appendChild(renderer.domElement);

document.body.appendChild(VRButton.createButton(renderer));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050505);
scene.fog = new THREE.FogExp2(0x000000, 0.015);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 500);
const playerGroup = new THREE.Group();
playerGroup.position.set(0, 1.6, 0);
playerGroup.add(camera);
scene.add(playerGroup);

// Audio Listener
const listener = new THREE.AudioListener();
camera.add(listener);
const bgMusic = document.getElementById('bg-music');

// Evento al entrar en VR
renderer.xr.addEventListener('sessionstart', () => {
    if(bgMusic) {
        bgMusic.volume = 0.3;
        bgMusic.play().catch(e => console.warn(e));
    }
});

/** ================= RECURSOS (FUENTES Y MATERIALES) ================= */
let fontGlobal = null;
const loader = new FontLoader();
loader.load('https://unpkg.com/three@0.160.0/examples/fonts/helvetiker_bold.typeface.json', (font) => {
    fontGlobal = font;
    currentState = STATE.MENU;
    showMenu("GALACTIC WARFARE", "Presiona Gatillo para Iniciar");
});

// Materiales Reutilizables (Optimización de Memoria)
const matLaser = new THREE.MeshBasicMaterial({ color: 0x00ffcc });
const matAsteroid = new THREE.MeshStandardMaterial({ color: 0x884444, roughness: 0.8, flatShading: true });
const geoAsteroid = new THREE.DodecahedronGeometry(1.5, 0); 
const geoLaser = new THREE.BoxGeometry(0.08, 0.08, 1.5);

/** ================= ENTORNO ================= */
// 1. Estrellas
const starsCount = 2000;
const starsGeo = new THREE.BufferGeometry();
const starsPos = new Float32Array(starsCount * 3);
for(let i=0; i<starsCount; i++){
    starsPos[i*3] = (Math.random()-0.5)*400;
    starsPos[i*3+1] = (Math.random()-0.5)*400;
    starsPos[i*3+2] = (Math.random()-0.5)*400;
}
starsGeo.setAttribute('position', new THREE.BufferAttribute(starsPos, 3));
const stars = new THREE.Points(starsGeo, new THREE.PointsMaterial({color: 0xffffff, size: 0.5}));
scene.add(stars);

// 2. Luces
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(-10, 50, 20);
sun.castShadow = true;
scene.add(sun);
scene.add(new THREE.AmbientLight(0x404050, 0.5));

// 3. Suelo (Grid)
const grid = new THREE.GridHelper(500, 50, 0x333333, 0x111111);
grid.position.y = -10;
scene.add(grid);

/** ================= HUD & UI (TEXTO FLOTANTE) ================= */
const uiGroup = new THREE.Group();
playerGroup.add(uiGroup); // UI se mueve con el jugador
uiGroup.position.set(0, 0, -3); // 3 metros al frente

let scoreMesh = null;
let healthMesh = null;
let menuMesh = null;

function createText(text, size, color, yPos) {
    if(!fontGlobal) return null;
    const geo = new TextGeometry(text, { font: fontGlobal, size: size, height: 0.02 });
    geo.center();
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: color }));
    mesh.position.y = yPos;
    return mesh;
}

function showMenu(title, subtitle) {
    clearUI();
    const titleM = createText(title, 0.4, 0xff00cc, 0.5);
    const subM = createText(subtitle, 0.15, 0xffffff, -0.2);
    menuMesh = new THREE.Group();
    menuMesh.add(titleM, subM);
    uiGroup.add(menuMesh);
}

function updateHUD() {
    clearUI();
    scoreMesh = createText(`SCORE: ${score}`, 0.1, 0x00ffcc, 0.8); // Arriba
    healthMesh = createText(`SALUD: ${playerHealth}%`, 0.1, playerHealth > 30 ? 0x00ff00 : 0xff0000, 0.65);
    scoreMesh.position.x = -0.8;
    healthMesh.position.x = 0.8;
    // Rotarlos un poco hacia el centro
    scoreMesh.rotation.y = 0.2;
    healthMesh.rotation.y = -0.2;
    
    uiGroup.add(scoreMesh, healthMesh);
}

function clearUI() {
    while(uiGroup.children.length > 0){
        const obj = uiGroup.children[0];
        uiGroup.remove(obj);
        if(obj.geometry) obj.geometry.dispose();
        if(obj.material) obj.material.dispose();
        // Si es grupo (menú)
        if(obj.children) {
            obj.children.forEach(c => {
                if(c.geometry) c.geometry.dispose();
                if(c.material) c.material.dispose();
            });
        }
    }
}

/** ================= JUEGO ================= */
let asteroids = [];
let lasers = [];
let particles = [];

function startGame() {
    // Limpieza total
    asteroids.forEach(a => scene.remove(a));
    lasers.forEach(l => scene.remove(l));
    asteroids = [];
    lasers = [];
    particles = [];
    
    score = 0;
    playerHealth = 100;
    currentState = STATE.PLAYING;
    updateHUD();
    
    // Sonido inicio
    playSound(440, 'sine', 0.5);
}

function endGame() {
    currentState = STATE.GAMEOVER;
    showMenu("GAME OVER", `Puntaje Final: ${score}\nDispara para reiniciar`);
    playSound(100, 'sawtooth', 1.0);
}

// Generador de asteroides
function spawnAsteroid() {
    const mesh = new THREE.Mesh(geoAsteroid, matAsteroid.clone());
    mesh.position.set(
        (Math.random()-0.5) * 40,
        (Math.random()-0.5) * 20,
        -CONFIG.worldDepth
    );
    mesh.castShadow = true;
    mesh.userData = {
        rot: { x: Math.random()*0.05, y: Math.random()*0.05 },
        speed: CONFIG.asteroidSpeed + Math.random() * 10
    };
    scene.add(mesh);
    asteroids.push(mesh);
}

// Disparo
function shoot(controller) {
    if(currentState === STATE.MENU || currentState === STATE.GAMEOVER) {
        startGame();
        return;
    }
    
    if(currentState === STATE.PLAYING) {
        const mesh = new THREE.Mesh(geoLaser, matLaser);
        const p = new THREE.Vector3();
        const q = new THREE.Quaternion();
        controller.getWorldPosition(p);
        controller.getWorldQuaternion(q);
        
        mesh.position.copy(p);
        mesh.quaternion.copy(q);
        mesh.translateZ(-0.5);
        
        scene.add(mesh);
        lasers.push(mesh);
        playSound(880, 'square', 0.1);
    }
}

// Explosiones
function spawnExplosion(pos, color) {
    const count = 15;
    const geo = new THREE.BufferGeometry();
    const posArr = new Float32Array(count*3);
    const velArr = [];
    
    for(let i=0; i<count; i++){
        posArr[i*3] = pos.x;
        posArr[i*3+1] = pos.y;
        posArr[i*3+2] = pos.z;
        velArr.push({
            x: (Math.random()-0.5)*10,
            y: (Math.random()-0.5)*10,
            z: (Math.random()-0.5)*10
        });
    }
    geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    const mat = new THREE.PointsMaterial({ color: color, size: 0.4, transparent: true });
    const pts = new THREE.Points(geo, mat);
    pts.userData = { life: 1.0, velocities: velArr };
    scene.add(pts);
    particles.push(pts);
}

/** ================= CONTROLES VR ================= */
const controller1 = renderer.xr.getController(0);
const controller2 = renderer.xr.getController(1);
const controllerModelFactory = new XRControllerModelFactory();

const grip1 = renderer.xr.getControllerGrip(0);
grip1.add(controllerModelFactory.createControllerModel(grip1));
const grip2 = renderer.xr.getControllerGrip(1);
grip2.add(controllerModelFactory.createControllerModel(grip2));

playerGroup.add(controller1, controller2, grip1, grip2);

controller1.addEventListener('selectstart', () => shoot(controller1));
controller2.addEventListener('selectstart', () => shoot(controller2));

// Cabina simple visual
const cockpit = new THREE.Group();
const hull = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.1, 1), new THREE.MeshStandardMaterial({color:0x222222}));
hull.position.set(0, -0.2, 0.2);
cockpit.add(hull);
playerGroup.add(cockpit);


/** ================= AUDIO SINTETIZADO ================= */
function playSound(freq, type, duration) {
    if(listener.context.state === 'suspended') listener.context.resume();
    const osc = listener.context.createOscillator();
    const gain = listener.context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, listener.context.currentTime);
    osc.frequency.exponentialRampToValueAtTime(10, listener.context.currentTime + duration);
    gain.gain.setValueAtTime(0.2, listener.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, listener.context.currentTime + duration);
    osc.connect(gain);
    gain.connect(listener.destination);
    osc.start();
    osc.stop(listener.context.currentTime + duration);
}

/** ================= BUCLE PRINCIPAL (OPTIMIZADO) ================= */
const clock = new THREE.Clock();

renderer.setAnimationLoop(() => {
    const dt = clock.getDelta();

    // 1. CONTROL DE NAVE
    if(renderer.xr.isPresenting) {
        const rot = controller2.rotation;
        playerGroup.position.x -= rot.z * CONFIG.shipSpeed * dt * 0.5;
        playerGroup.position.y += rot.x * CONFIG.shipSpeed * dt * 0.5;
        // Clamp
        playerGroup.position.x = THREE.MathUtils.clamp(playerGroup.position.x, -CONFIG.limitX, CONFIG.limitX);
        playerGroup.position.y = THREE.MathUtils.clamp(playerGroup.position.y, 0, CONFIG.limitY);
        // Tilt visual
        playerGroup.rotation.z = THREE.MathUtils.lerp(playerGroup.rotation.z, -rot.z * 0.5, 0.1);
    }

    // LÓGICA DE JUEGO
    if(currentState === STATE.PLAYING) {
        if(Math.random() < CONFIG.spawnRate) spawnAsteroid();

        // Actualizar Láseres (Hacia atrás para poder borrar)
        for (let i = lasers.length - 1; i >= 0; i--) {
            const l = lasers[i];
            l.translateZ(-CONFIG.laserSpeed * dt);

            // Eliminar si sale del mundo
            if(l.position.distanceTo(playerGroup.position) > CONFIG.worldDepth) {
                scene.remove(l);
                lasers.splice(i, 1);
                continue;
            }

            // Colisiones Láser vs Asteroides
            let hit = false;
            for(let j = asteroids.length - 1; j >= 0; j--) {
                const a = asteroids[j];
                if(l.position.distanceTo(a.position) < 2) {
                    // Impacto
                    spawnExplosion(a.position, 0xffaa00);
                    scene.remove(a);
                    if(a.material) a.material.dispose();
                    if(a.geometry) a.geometry.dispose();
                    asteroids.splice(j, 1);
                    hit = true;
                    score += 10;
                    playSound(200, 'sawtooth', 0.2);
                    break;
                }
            }
            if(hit) {
                scene.remove(l);
                lasers.splice(i, 1);
                updateHUD();
            }
        }

        // Actualizar Asteroides
        const playerPos = playerGroup.position;
        for (let i = asteroids.length - 1; i >= 0; i--) {
            const a = asteroids[i];
            a.position.z += a.userData.speed * dt;
            a.rotation.x += a.userData.rot.x;
            a.rotation.y += a.userData.rot.y;

            // Colisión con Nave
            if(a.position.distanceTo(playerPos) < 2.5) {
                spawnExplosion(playerPos, 0xff0000);
                scene.remove(a);
                asteroids.splice(i, 1);
                playerHealth -= 20;
                playSound(100, 'square', 0.5);
                updateHUD();
                
                if(playerHealth <= 0) endGame();
                continue;
            }

            // Eliminar si pasa de largo
            if(a.position.z > 20) {
                scene.remove(a);
                if(a.geometry) a.geometry.dispose();
                asteroids.splice(i, 1);
            }
        }
    }

    // Animación de Partículas (Siempre activa)
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.userData.life -= dt * 2.0;
        const attr = p.geometry.attributes.position;
        const vels = p.userData.velocities;
        for(let k=0; k<vels.length; k++){
            attr.setXYZ(k, 
                attr.getX(k) + vels[k].x*dt,
                attr.getY(k) + vels[k].y*dt,
                attr.getZ(k) + vels[k].z*dt
            );
        }
        attr.needsUpdate = true;
        p.material.opacity = p.userData.life;
        
        if(p.userData.life <= 0) {
            scene.remove(p);
            p.geometry.dispose();
            p.material.dispose();
            particles.splice(i, 1);
        }
    }

    renderer.render(scene, camera);
});

// Resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
