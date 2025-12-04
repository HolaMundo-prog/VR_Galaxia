import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

// === CONFIGURACIÓN DEL JUEGO ===
const CONFIG = {
    speed: 30,             // Velocidad de avance
    laneWidth: 8,          // Ancho del túnel
    winScore: 1000,        // Puntos para ganar
    spawnRate: 0.8         // Tiempo entre obstáculos
};

// Estados
const STATE = { MENU: 0, PLAYING: 1, GAMEOVER: 2, WIN: 3 };
let currentState = STATE.MENU;

let score = 0;
let items = []; // Aquí guardamos obstáculos y monedas
let tunnelRings = []; // Para el efecto visual del túnel

// === 1. ESCENA Y RENDERER ===
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050011);
scene.fog = new THREE.Fog(0x050011, 20, 100);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth/window.innerHeight, 0.1, 200);
const playerGroup = new THREE.Group();
playerGroup.position.set(0, 0, 0);
playerGroup.add(camera);
scene.add(playerGroup);

// Audio
const listener = new THREE.AudioListener();
camera.add(listener);
const bgMusic = document.getElementById('bg-music');
renderer.xr.addEventListener('sessionstart', () => {
    if(bgMusic) { bgMusic.volume=0.3; bgMusic.play().catch(console.warn); }
    resetGame();
});

// === 2. ENTORNO (TÚNEL GALÁCTICO) ===
// Suelo
const grid = new THREE.GridHelper(200, 50, 0xff00cc, 0x220044);
grid.position.y = -2;
scene.add(grid);

// Luces
const light = new THREE.DirectionalLight(0xffffff, 1.5);
light.position.set(0, 10, 5);
scene.add(light);
scene.add(new THREE.AmbientLight(0xffffff, 0.5));

// Anillos del túnel (Efecto visual)
const ringGeo = new THREE.TorusGeometry(15, 0.2, 8, 32);
const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.3 });

function spawnRing() {
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.z = -100; // Aparece lejos
    scene.add(ring);
    tunnelRings.push(ring);
}

// === 3. INTERFAZ HUD (PANTALLA) ===
const hudCanvas = document.createElement('canvas');
hudCanvas.width = 512; hudCanvas.height = 256;
const hudCtx = hudCanvas.getContext('2d');
const hudTexture = new THREE.CanvasTexture(hudCanvas);

function updateHUD(message = null, subMessage = null) {
    hudCtx.clearRect(0,0,512,256);
    
    // Fondo semitransparente
    hudCtx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    hudCtx.fillRect(0,0,512,256);
    
    // Borde
    let color = '#00ffcc';
    if(currentState === STATE.GAMEOVER) color = '#ff0000';
    if(currentState === STATE.WIN) color = '#ffff00';
    
    hudCtx.strokeStyle = color;
    hudCtx.lineWidth = 8;
    hudCtx.strokeRect(4,4,504,248);

    hudCtx.textAlign = 'center';
    
    if (currentState === STATE.PLAYING) {
        hudCtx.fillStyle = '#00ffcc';
        hudCtx.font = 'bold 60px Arial';
        hudCtx.fillText(`PUNTOS: ${score} / ${CONFIG.winScore}`, 256, 100);
        hudCtx.font = '40px Arial';
        hudCtx.fillStyle = '#ffffff';
        hudCtx.fillText("Esquiva ROJO - Toma AZUL", 256, 180);
    } else {
        // Mensajes de Menú / Fin
        hudCtx.fillStyle = color;
        hudCtx.font = 'bold 70px Arial';
        hudCtx.fillText(message || "GALACTIC RACER", 256, 100);
        
        hudCtx.fillStyle = '#ffffff';
        hudCtx.font = '40px Arial';
        hudCtx.fillText(subMessage || "Presiona Gatillo para Jugar", 256, 180);
    }
    hudTexture.needsUpdate = true;
}
updateHUD("GALACTIC RACER", "Presiona Gatillo para Iniciar");

// Pantalla flotante en la cabina
const hudScreen = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 0.8),
    new THREE.MeshBasicMaterial({ map: hudTexture, transparent: true })
);
hudScreen.position.set(0, 1.2, -2.5);
hudScreen.rotation.x = -0.2;
playerGroup.add(hudScreen);

// === 4. LA NAVE (CABINA) ===
function createCar() {
    const car = new THREE.Group();
    // Tablero
    const dash = new THREE.Mesh(
        new THREE.BoxGeometry(2, 0.5, 1),
        new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2 })
    );
    dash.position.set(0, 0.5, -1);
    car.add(dash);
    
    // Parabrisas (Marco)
    const frameGeo = new THREE.BoxGeometry(0.1, 1, 0.1);
    const frameMat = new THREE.MeshStandardMaterial({color: 0x333333});
    const left = new THREE.Mesh(frameGeo, frameMat); left.position.set(-1, 1, -1);
    const right = new THREE.Mesh(frameGeo, frameMat); right.position.set(1, 1, -1);
    car.add(left, right);
    
    return car;
}
playerGroup.add(createCar());

// === 5. OBSTÁCULOS Y PREMIOS ===
const obstacleGeo = new THREE.BoxGeometry(1.5, 1.5, 1.5);
const obstacleMat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0x440000 }); // Rojo

const coinGeo = new THREE.OctahedronGeometry(0.8, 0);
const coinMat = new THREE.MeshStandardMaterial({ color: 0x0088ff, emissive: 0x0044ff }); // Azul

function spawnItem() {
    if(currentState !== STATE.PLAYING) return;
    
    const isCoin = Math.random() > 0.6; // 40% monedas, 60% obstaculos
    const mesh = new THREE.Mesh(
        isCoin ? coinGeo : obstacleGeo,
        isCoin ? coinMat : obstacleMat
    );
    
    // Posición aleatoria en X (Carriles virtuales)
    // Rango de -6 a 6
    const xPos = (Math.random() - 0.5) * CONFIG.laneWidth * 1.5;
    
    mesh.position.set(xPos, 0.5, -100); // Aparece al fondo
    mesh.userData = { type: isCoin ? 'coin' : 'obstacle', active: true };
    
    scene.add(mesh);
    items.push(mesh);
}

// === 6. SONIDOS SINTÉTICOS ===
function playSound(type) {
    if(listener.context.state === 'suspended') listener.context.resume();
    const osc = listener.context.createOscillator();
    const gain = listener.context.createGain();
    
    if (type === 'coin') {
        osc.frequency.setValueAtTime(800, listener.context.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1200, listener.context.currentTime + 0.1);
        gain.gain.setValueAtTime(0.1, listener.context.currentTime);
    } else if (type === 'crash') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(100, listener.context.currentTime);
        osc.frequency.exponentialRampToValueAtTime(10, listener.context.currentTime + 0.5);
        gain.gain.setValueAtTime(0.3, listener.context.currentTime);
    } else if (type === 'win') {
        osc.frequency.setValueAtTime(400, listener.context.currentTime);
        osc.frequency.exponentialRampToValueAtTime(800, listener.context.currentTime + 0.5);
        gain.gain.setValueAtTime(0.2, listener.context.currentTime);
    }
    
    gain.gain.exponentialRampToValueAtTime(0.01, listener.context.currentTime + (type==='crash'?0.5:0.2));
    osc.connect(gain); gain.connect(listener.destination);
    osc.start(); osc.stop(listener.context.currentTime + (type==='crash'?0.5:0.2));
}

// === 7. CONTROLES VR ===
const controller = renderer.xr.getController(1); // Mano derecha
const factory = new XRControllerModelFactory();
const grip = renderer.xr.getControllerGrip(1);
grip.add(factory.createControllerModel(grip));
playerGroup.add(controller, grip);

// Botón para reiniciar/iniciar
controller.addEventListener('selectstart', () => {
    if(currentState !== STATE.PLAYING) {
        resetGame();
    }
});

// === 8. LÓGICA DE JUEGO ===
function resetGame() {
    // Limpiar todo
    items.forEach(i => scene.remove(i));
    items = [];
    tunnelRings.forEach(r => scene.remove(r));
    tunnelRings = [];
    
    score = 0;
    currentState = STATE.PLAYING;
    playerGroup.position.x = 0;
    updateHUD();
}

// === BUCLE PRINCIPAL ===
const clock = new THREE.Clock();
let spawnTimer = 0;
let ringTimer = 0;

renderer.setAnimationLoop(() => {
    const dt = clock.getDelta();

    if (currentState === STATE.PLAYING) {
        // 1. Controles (Inclinación mano derecha)
        if (renderer.xr.isPresenting) {
            const rot = controller.rotation.z; // Inclinación lateral
            playerGroup.position.x -= rot * 20 * dt; // Velocidad de giro
            
            // Límites de carretera
            const limit = CONFIG.laneWidth;
            if(playerGroup.position.x > limit) playerGroup.position.x = limit;
            if(playerGroup.position.x < -limit) playerGroup.position.x = -limit;
            
            // Inclinación visual del "carro"
            playerGroup.rotation.z = -rot * 0.5;
        }

        // 2. Generar cosas
        spawnTimer += dt;
        if(spawnTimer > (1.0 / CONFIG.spawnRate)) {
            spawnItem();
            spawnTimer = 0;
            // Aumentar dificultad ligeramente
            if(CONFIG.spawnRate < 2.5) CONFIG.spawnRate += 0.01;
        }
        
        // 3. Generar anillos de túnel
        ringTimer += dt;
        if(ringTimer > 0.5) {
            spawnRing();
            ringTimer = 0;
        }

        // 4. Mover Items y Colisiones
        for (let i = items.length - 1; i >= 0; i--) {
            const item = items[i];
            item.position.z += CONFIG.speed * dt;
            
            // Rotación visual
            item.rotation.x += dt;
            item.rotation.y += dt;

            // Distancia al jugador
            const distZ = Math.abs(item.position.z - playerGroup.position.z);
            const distX = Math.abs(item.position.x - playerGroup.position.x);

            // Colisión
            if (item.userData.active && distZ < 1.5 && distX < 1.2) {
                item.userData.active = false;
                scene.remove(item);
                items.splice(i, 1);
                
                if (item.userData.type === 'coin') {
                    // Puntos
                    score += 100;
                    playSound('coin');
                    updateHUD();
                    
                    if (score >= CONFIG.winScore) {
                        currentState = STATE.WIN;
                        playSound('win');
                        updateHUD("¡VICTORIA!", `Lograste ${score} puntos. Gatillo para reiniciar.`);
                    }
                } else {
                    // Choque
                    currentState = STATE.GAMEOVER;
                    playSound('crash');
                    updateHUD("GAME OVER", "Chocaste. Gatillo para reiniciar.");
                }
                continue;
            }

            // Limpieza si pasa de largo
            if (item.position.z > 5) {
                scene.remove(item);
                items.splice(i, 1);
            }
        }
        
        // 5. Mover Anillos
        for(let i=tunnelRings.length-1; i>=0; i--) {
            const r = tunnelRings[i];
            r.position.z += CONFIG.speed * dt;
            if(r.position.z > 5) {
                scene.remove(r);
                tunnelRings.splice(i, 1);
            }
        }
    } else {
        // En menú o game over, rotar la escena suavemente
        // playerGroup.rotation.y += dt * 0.1;
    }

    renderer.render(scene, camera);
});

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
