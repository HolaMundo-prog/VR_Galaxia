import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

// === CONFIGURACIÓN ===
const SPEED = 40;         // Velocidad del juego
const LANE_WIDTH = 12;    // Ancho de la carretera
let score = 0;
let isGameOver = false;

// Arrays
let enemies = [];

// === ESCENA BÁSICA ===
const renderer = new THREE.WebGLRenderer({ antialias: false }); // False para más rendimiento
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101010);
scene.fog = new THREE.Fog(0x101010, 20, 100);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth/window.innerHeight, 0.1, 200);
const playerGroup = new THREE.Group();
playerGroup.position.set(0, 1.0, 0); // Altura de auto
playerGroup.add(camera);
scene.add(playerGroup);

// Música
const listener = new THREE.AudioListener();
camera.add(listener);
const bgMusic = document.getElementById('bg-music');
renderer.xr.addEventListener('sessionstart', () => {
    if(bgMusic) { bgMusic.volume=0.3; bgMusic.play().catch(console.warn); }
    resetGame();
});

// === CARRETERA ===
// Usamos una textura simple generada por código para el asfalto
const canvasRoad = document.createElement('canvas');
canvasRoad.width = 128; canvasRoad.height = 128;
const ctxR = canvasRoad.getContext('2d');
ctxR.fillStyle = '#333'; ctxR.fillRect(0,0,128,128);
ctxR.fillStyle = '#fff'; ctxR.fillRect(60, 0, 8, 64); // Línea central
const roadTex = new THREE.CanvasTexture(canvasRoad);
roadTex.wrapS = THREE.RepeatWrapping;
roadTex.wrapT = THREE.RepeatWrapping;
roadTex.repeat.set(1, 10); // Repetir mucho para que parezca carretera

const road = new THREE.Mesh(
    new THREE.PlaneGeometry(LANE_WIDTH * 2, 400),
    new THREE.MeshBasicMaterial({ map: roadTex }) // MeshBasic es el más rápido
);
road.rotation.x = -Math.PI / 2;
road.position.z = -100; // Centrada adelante
scene.add(road);

// === JUGADOR (CABINA HUD) ===
// Tablero con puntaje
const hudCanvas = document.createElement('canvas');
hudCanvas.width = 512; hudCanvas.height = 256;
const hudCtx = hudCanvas.getContext('2d');
const hudTexture = new THREE.CanvasTexture(hudCanvas);

function updateHUD() {
    hudCtx.fillStyle = '#222';
    hudCtx.fillRect(0, 0, 512, 256);
    
    hudCtx.strokeStyle = isGameOver ? 'red' : 'white';
    hudCtx.lineWidth = 10;
    hudCtx.strokeRect(5,5,502,246);

    hudCtx.textAlign = 'center';
    hudCtx.font = 'bold 60px Arial';
    
    if(isGameOver) {
        hudCtx.fillStyle = 'red';
        hudCtx.fillText("¡CHOQUE!", 256, 100);
        hudCtx.fillStyle = 'white';
        hudCtx.font = '40px Arial';
        hudCtx.fillText("Gatillo para Reiniciar", 256, 180);
    } else {
        hudCtx.fillStyle = '#00ff00';
        hudCtx.fillText(`PUNTOS: ${Math.floor(score)}`, 256, 150);
    }
    hudTexture.needsUpdate = true;
}

const dashboard = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.5, 0.5),
    new THREE.MeshBasicMaterial({ color: 0x222222 })
);
dashboard.position.set(0, -0.4, -0.6);

const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(1.2, 0.4),
    new THREE.MeshBasicMaterial({ map: hudTexture })
);
screen.position.set(0, 0.26, 0); // Encima del tablero
screen.rotation.x = -0.5;
dashboard.add(screen);
playerGroup.add(dashboard);

// === ENEMIGOS (AUTOS) ===
const enemyGeo = new THREE.BoxGeometry(1.5, 1, 3);
const enemyMat = new THREE.MeshBasicMaterial({ color: 0xff0000 }); // Rojo simple

function spawnEnemy() {
    if(isGameOver) return;
    const mesh = new THREE.Mesh(enemyGeo, enemyMat);
    // Posición aleatoria en X (carriles)
    mesh.position.set(
        (Math.random() - 0.5) * (LANE_WIDTH * 1.5), 
        0.5, 
        -100 // Aparece lejos
    );
    scene.add(mesh);
    enemies.push(mesh);
}

// === LOGICA DE JUEGO ===
function resetGame() {
    enemies.forEach(e => scene.remove(e));
    enemies = [];
    score = 0;
    isGameOver = false;
    playerGroup.position.x = 0; // Centrar jugador
    updateHUD();
}

function playCrashSound() {
    if(listener.context.state === 'suspended') listener.context.resume();
    const osc = listener.context.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(100, listener.context.currentTime);
    osc.frequency.exponentialRampToValueAtTime(10, listener.context.currentTime + 0.5);
    osc.connect(listener.destination);
    osc.start();
    osc.stop(listener.context.currentTime + 0.5);
}

// === CONTROLES VR ===
const controller = renderer.xr.getController(1); // Mano derecha
const factory = new XRControllerModelFactory();
const grip = renderer.xr.getControllerGrip(1);
grip.add(factory.createControllerModel(grip));
playerGroup.add(controller, grip);

controller.addEventListener('selectstart', () => {
    if(isGameOver) resetGame();
});

// === LOOP PRINCIPAL ===
const clock = new THREE.Clock();
let spawnTimer = 0;

renderer.setAnimationLoop(() => {
    const dt = clock.getDelta();

    // 1. Movimiento del Jugador (Inclinación)
    if(renderer.xr.isPresenting && !isGameOver) {
        // Usamos la rotación de la mano derecha para movernos izquierda/derecha
        const rot = controller.rotation.z; 
        playerGroup.position.x -= rot * 15 * dt; // Velocidad de giro lateral

        // Limites de carretera
        if(playerGroup.position.x > LANE_WIDTH) playerGroup.position.x = LANE_WIDTH;
        if(playerGroup.position.x < -LANE_WIDTH) playerGroup.position.x = -LANE_WIDTH;

        // Efecto visual de carretera infinita
        roadTex.offset.y -= (SPEED * 0.01 * dt);

        // Puntaje por distancia
        score += dt * 10;
        if(Math.floor(score) % 10 === 0) updateHUD(); // Actualizar solo a veces para rendimiento

        // Generar enemigos
        spawnTimer += dt;
        if(spawnTimer > 1.0) { // Un auto cada segundo
            spawnEnemy();
            spawnTimer = 0;
        }
    }

    // 2. Mover Enemigos y Colisiones
    // Bucle inverso para borrar seguro
    for(let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        
        if(!isGameOver) {
            e.position.z += SPEED * dt; // El auto viene hacia ti
        }

        // COLISIÓN (Caja simple)
        // Si el auto está cerca en Z (profundidad) y cerca en X (carril)
        const dz = Math.abs(e.position.z - playerGroup.position.z);
        const dx = Math.abs(e.position.x - playerGroup.position.x);

        if(dz < 2.5 && dx < 1.8) {
            // Choque
            isGameOver = true;
            playCrashSound();
            updateHUD();
        }

        // Limpieza (si el auto ya pasó)
        if(e.position.z > 10) {
            scene.remove(e);
            enemies.splice(i, 1);
        }
    }

    renderer.render(scene, camera);
});

// Resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth/window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

