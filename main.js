import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

/** ================= CONFIGURACIÓN ================= */
const CONFIG = {
    shipSpeed: 20,
    laserSpeed: 80,
    worldDepth: 200,
    bounds: { x: 15, y: 10 }
};

let score = 0;
let health = 100;
let isGameOver = false;

// Arrays de objetos
let asteroids = [];
let lasers = [];
let particles = [];

/** ================= ESCENA ================= */
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x000000, 0.005);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 500);
const shipGroup = new THREE.Group();
shipGroup.position.set(0, 1.6, 0);
shipGroup.add(camera);
scene.add(shipGroup);

// Audio
const listener = new THREE.AudioListener();
camera.add(listener);
const bgMusic = document.getElementById('bg-music');

renderer.xr.addEventListener('sessionstart', () => {
    if(bgMusic) { bgMusic.volume = 0.3; bgMusic.play().catch(console.warn); }
    resetGame();
});

/** ================= PANTALLA HUD (Canvas de Alto Rendimiento) ================= */
// Usamos un Canvas 2D pintado en una textura 3D. Esto NO traba la PC.
const hudCanvas = document.createElement('canvas');
hudCanvas.width = 512; 
hudCanvas.height = 256;
const hudCtx = hudCanvas.getContext('2d');
const hudTexture = new THREE.CanvasTexture(hudCanvas);

function drawHUD() {
    // 1. Limpiar fondo
    hudCtx.fillStyle = 'rgba(0, 0, 0, 0.6)'; 
    hudCtx.fillRect(0, 0, 512, 256);
    
    // 2. Borde Neón
    hudCtx.lineWidth = 10;
    hudCtx.strokeStyle = isGameOver ? '#ff0000' : '#00ffcc';
    hudCtx.strokeRect(5, 5, 502, 246);

    // 3. Textos
    hudCtx.textAlign = 'center';
    hudCtx.font = 'bold 50px monospace';
    
    if (isGameOver) {
        hudCtx.fillStyle = '#ff0000';
        hudCtx.fillText("GAME OVER", 256, 100);
        hudCtx.fillStyle = '#ffffff';
        hudCtx.font = '30px monospace';
        hudCtx.fillText("Dispara para reiniciar", 256, 160);
        hudCtx.fillText(`Score Final: ${score}`, 256, 210);
    } else {
        hudCtx.fillStyle = '#00ffcc';
        hudCtx.fillText(`SCORE: ${score}`, 256, 80);
        
        // Barra de Vida
        hudCtx.fillStyle = health > 30 ? '#00ff00' : '#ff0000';
        hudCtx.fillText(`VIDA: ${health}%`, 256, 160);
        hudCtx.fillRect(56, 190, 4 * health, 30); // Barra visual
    }
    
    // Importante: Avisar a Three.js que la textura cambió
    hudTexture.needsUpdate = true;
}

/** ================= OBJETOS ================= */
// 1. Estrellas (Fondo)
const starsGeo = new THREE.BufferGeometry();
const starsPos = new Float32Array(3000 * 3);
for(let i=0; i<3000*3; i++) starsPos[i] = (Math.random()-0.5)*600;
starsGeo.setAttribute('position', new THREE.BufferAttribute(starsPos, 3));
const stars = new THREE.Points(starsGeo, new THREE.PointsMaterial({color: 0xffffff, size: 0.6}));
scene.add(stars);

// 2. Cabina y Pantalla
function createCockpit() {
    const cockpit = new THREE.Group();
    
    // Casco
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 2), new THREE.MeshStandardMaterial({ color: 0x222222 }));
    hull.position.set(0, -0.8, 0);
    cockpit.add(hull);

    // Pantalla HUD
    const screenGeo = new THREE.PlaneGeometry(1.2, 0.6);
    const screenMat = new THREE.MeshBasicMaterial({ map: hudTexture, transparent: true, opacity: 0.95 });
    const screen = new THREE.Mesh(screenGeo, screenMat);
    screen.position.set(0, -0.4, -0.8);
    screen.rotation.x = -0.3;
    cockpit.add(screen);

    return cockpit;
}
shipGroup.add(createCockpit());

// 3. Luces
const light = new THREE.DirectionalLight(0xffffff, 2);
light.position.set(-10, 20, 10);
scene.add(light);
scene.add(new THREE.AmbientLight(0x404050));

// Geometrías reutilizables (Para no saturar memoria)
const asteroidGeo = new THREE.DodecahedronGeometry(1.2, 0);
const asteroidMat = new THREE.MeshStandardMaterial({ color: 0x885555, flatShading: true });
const laserGeo = new THREE.BoxGeometry(0.08, 0.08, 1.5);
const laserMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });

/** ================= LÓGICA DE JUEGO ================= */

function spawnAsteroid() {
    if(isGameOver) return;
    const mesh = new THREE.Mesh(asteroidGeo, asteroidMat); // Comparten material (rápido)
    mesh.position.set(
        (Math.random()-0.5) * 50,
        (Math.random()-0.5) * 20,
        -CONFIG.worldDepth
    );
    mesh.userData = { 
        speed: CONFIG.shipSpeed + Math.random() * 10,
        rot: {x: Math.random()*0.05, y: Math.random()*0.05}
    };
    scene.add(mesh);
    asteroids.push(mesh);
}

function resetGame() {
    // Limpieza agresiva
    asteroids.forEach(a => scene.remove(a));
    lasers.forEach(l => scene.remove(l));
    particles.forEach(p => scene.remove(p)); // Limpiar partículas viejas
    asteroids = [];
    lasers = [];
    particles = [];
    
    score = 0;
    health = 100;
    isGameOver = false;
    
    drawHUD();
}

function spawnExplosion(pos) {
    const count = 10; // Pocas partículas para rendimiento
    const geo = new THREE.BufferGeometry();
    const posArr = new Float32Array(count*3);
    const velArr = [];
    
    for(let i=0; i<count; i++){
        posArr[i*3] = pos.x; posArr[i*3+1] = pos.y; posArr[i*3+2] = pos.z;
        velArr.push({
            x: (Math.random()-0.5)*10,
            y: (Math.random()-0.5)*10,
            z: (Math.random()-0.5)*10
        });
    }
    geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    const mat = new THREE.PointsMaterial({ color: 0xff9900, size: 0.5, transparent: true });
    const sys = new THREE.Points(geo, mat);
    sys.userData = { life: 1.0, vels: velArr };
    scene.add(sys);
    particles.push(sys);
}

function playSound(freq, type) {
    if(listener.context.state === 'suspended') listener.context.resume();
    const osc = listener.context.createOscillator();
    const gain = listener.context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, listener.context.currentTime);
    osc.frequency.exponentialRampToValueAtTime(10, listener.context.currentTime + 0.1);
    gain.gain.setValueAtTime(0.1, listener.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, listener.context.currentTime + 0.1);
    osc.connect(gain); gain.connect(listener.destination);
    osc.start(); osc.stop(listener.context.currentTime + 0.15);
}

/** ================= CONTROLES ================= */
const controller2 = renderer.xr.getController(1);
const controllerModelFactory = new XRControllerModelFactory();
const grip2 = renderer.xr.getControllerGrip(1);
grip2.add(controllerModelFactory.createControllerModel(grip2));
shipGroup.add(controller2, grip2);

controller2.addEventListener('selectstart', () => {
    if(isGameOver) {
        resetGame();
        return;
    }
    
    const mesh = new THREE.Mesh(laserGeo, laserMat);
    const p = new THREE.Vector3(); const q = new THREE.Quaternion();
    controller2.getWorldPosition(p); controller2.getWorldQuaternion(q);
    mesh.position.copy(p); mesh.quaternion.copy(q);
    mesh.translateZ(-0.5);
    scene.add(mesh);
    lasers.push(mesh);
    playSound(880, 'square');
});

/** ================= LOOP PRINCIPAL ================= */
const clock = new THREE.Clock();
drawHUD(); // Dibujar inicial

renderer.setAnimationLoop(() => {
    const dt = clock.getDelta();
    
    if(isGameOver) return; // Si perdió, congelar lógica (pero renderizar escena)

    // 1. Generar enemigos
    if(Math.random() < 0.03) spawnAsteroid();

    // 2. Control Nave
    if(renderer.xr.isPresenting) {
        const rot = controller2.rotation;
        shipGroup.position.x -= rot.z * 15 * dt;
        shipGroup.position.y += rot.x * 15 * dt;
        shipGroup.position.x = THREE.MathUtils.clamp(shipGroup.position.x, -CONFIG.bounds.x, CONFIG.bounds.x);
        shipGroup.position.y = THREE.MathUtils.clamp(shipGroup.position.y, 0, CONFIG.bounds.y);
        shipGroup.rotation.z = THREE.MathUtils.lerp(shipGroup.rotation.z, -rot.z*0.5, 0.1);
    }

    // 3. Mover Asteroides
    for (let i = asteroids.length - 1; i >= 0; i--) {
        const a = asteroids[i];
        a.position.z += a.userData.speed * dt;
        a.rotation.x += a.userData.rot.x;
        
        // Choque con Nave
        if(a.position.distanceTo(shipGroup.position) < 2.0) {
            spawnExplosion(shipGroup.position);
            scene.remove(a);
            asteroids.splice(i, 1);
            health -= 20;
            playSound(100, 'sawtooth');
            drawHUD();
            
            if(health <= 0) {
                isGameOver = true;
                drawHUD();
            }
            continue;
        }

        // Eliminar si pasa de largo
        if(a.position.z > 20) {
            scene.remove(a);
            asteroids.splice(i, 1);
        }
    }

    // 4. Mover Láseres y Colisiones (La parte crítica)
    for (let i = lasers.length - 1; i >= 0; i--) {
        const l = lasers[i];
        l.translateZ(-CONFIG.laserSpeed * dt);
        
        let hit = false;
        
        // Comprobar colisión con cada asteroide
        for (let j = asteroids.length - 1; j >= 0; j--) {
            const a = asteroids[j];
            if(l.position.distanceTo(a.position) < 2.0) {
                // IMPACTO
                spawnExplosion(a.position);
                
                scene.remove(a); // Borrar visual
                asteroids.splice(j, 1); // Borrar de lógica
                
                score += 10;
                hit = true;
                playSound(200, 'sawtooth');
                break; // Romper bucle interno
            }
        }
        
        // Si impactó o salió del mundo, borrar láser
        if(hit || l.position.distanceTo(shipGroup.position) > 200) {
            scene.remove(l);
            lasers.splice(i, 1);
            if(hit) drawHUD(); // Solo actualizar HUD si hubo puntos
        }
    }

    // 5. Partículas
    for(let i=particles.length-1; i>=0; i--) {
        const p = particles[i];
        p.userData.life -= dt * 2;
        const attr = p.geometry.attributes.position;
        const vels = p.userData.velocities;
        for(let k=0; k<vels.length; k++) {
            attr.setXYZ(k, attr.getX(k)+vels[k].x*dt, attr.getY(k)+vels[k].y*dt, attr.getZ(k)+vels[k].z*dt);
        }
        attr.needsUpdate = true;
        p.material.opacity = p.userData.life;
        if(p.userData.life <= 0) { scene.remove(p); particles.splice(i,1); }
    }

    renderer.render(scene, camera);
});

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth/window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
