import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

// === CONFIGURACIÓN DEL JUEGO ===
const CONFIG = {
    baseSpeed: 35,         // Velocidad inicial
    lateralSpeed: 60,      // Sensibilidad de volante
    laneWidth: 10,         
    spawnRate: 0.8,        // Frecuencia inicial de obstáculos
    timeToWin: 120         // 2 minutos (120 segundos) para ganar
};

// Estados
const STATE = { MENU: 0, PLAYING: 1, GAMEOVER: 2, WIN: 3 };
let currentState = STATE.MENU;

let score = 0;          // Puntos = Tiempo sobrevivido (segundos)
let currentSpeed = CONFIG.baseSpeed;
let survivalTime = 0;
let items = []; 
let tunnelRings = []; 

// === 1. ESCENA Y RENDERER ===
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020005);
scene.fog = new THREE.FogExp2(0x020005, 0.02);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 300);
const playerGroup = new THREE.Group();
scene.add(playerGroup);
playerGroup.add(camera);

// Audio
const listener = new THREE.AudioListener();
camera.add(listener);
const bgMusic = document.getElementById('bg-music');
renderer.xr.addEventListener('sessionstart', () => {
    if(bgMusic) { bgMusic.volume=0.3; bgMusic.play().catch(console.warn); }
    resetGame();
});

// === 2. ENTORNO ===
// Grid
const grid = new THREE.GridHelper(400, 100, 0xff00ff, 0x110033);
grid.position.y = -2;
scene.add(grid);

// Luces
const dirLight = new THREE.DirectionalLight(0xffffff, 2);
dirLight.position.set(0, 20, 10);
scene.add(dirLight);
scene.add(new THREE.AmbientLight(0xffffff, 0.5));

// Anillos
const ringGeo = new THREE.TorusGeometry(18, 0.3, 8, 32);
const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.2 });

function spawnRing() {
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.z = -150; 
    scene.add(ring);
    tunnelRings.push(ring);
}

// === 3. HUD (MODO SUPERVIVENCIA) ===
const hudCanvas = document.createElement('canvas');
hudCanvas.width = 1024; hudCanvas.height = 512;
const hudCtx = hudCanvas.getContext('2d');
const hudTexture = new THREE.CanvasTexture(hudCanvas);

function updateHUD(title, subtitle, extraInfo) {
    hudCtx.clearRect(0,0,1024,512);
    
    // Panel para Menús
    if (currentState !== STATE.PLAYING) {
        hudCtx.fillStyle = 'rgba(0, 10, 20, 0.9)';
        hudCtx.fillRect(0,0,1024,512);
        
        let color = '#00ffcc'; 
        if(currentState === STATE.GAMEOVER) color = '#ff0044'; 
        if(currentState === STATE.WIN) color = '#ffff00';
        
        hudCtx.lineWidth = 15;
        hudCtx.strokeStyle = color;
        hudCtx.strokeRect(10,10,1004,492);
        
        hudCtx.textAlign = 'center';
        hudCtx.fillStyle = color;
        hudCtx.font = 'bold 90px Arial';
        hudCtx.fillText(title || "GALACTIC SURVIVAL", 512, 160);
        
        hudCtx.fillStyle = '#ffffff';
        hudCtx.font = '50px Arial';
        hudCtx.fillText(subtitle || "SOBREVIVE 2 MINUTOS", 512, 260);
        
        if(extraInfo) {
            hudCtx.fillStyle = '#aaaaaa';
            hudCtx.font = 'italic 40px Arial';
            hudCtx.fillText(extraInfo, 512, 380);
        }
        
        // CRÉDITOS
        hudCtx.fillStyle = '#0088ff';
        hudCtx.font = 'bold 35px Arial';
        hudCtx.fillText("Creado por: Angel Budar Solano", 512, 460);

    } else {
        // --- HUD DE JUEGO (SUPERVIVENCIA) ---
        hudCtx.textAlign = 'left';
        
        // Tiempo Sobrevivido (Grande)
        const timeLeft = Math.max(0, CONFIG.timeToWin - survivalTime);
        const mins = Math.floor(timeLeft / 60);
        const secs = Math.floor(timeLeft % 60).toString().padStart(2, '0');
        
        hudCtx.fillStyle = timeLeft < 30 ? '#ff0044' : '#00ffcc'; // Rojo si queda poco
        hudCtx.font = 'bold 80px Monospace';
        hudCtx.fillText(`META: ${mins}:${secs}`, 50, 100);
        
        // Velocidad
        hudCtx.fillStyle = '#ffff00'; 
        hudCtx.font = '50px Arial';
        hudCtx.fillText(`VELOCIDAD: ${Math.floor(currentSpeed)} km/h`, 50, 180);
        
        // Objetos Esquivados
        hudCtx.fillStyle = '#ffffff';
        hudCtx.font = '40px Arial';
        hudCtx.fillText(`ESQUIVADOS: ${score}`, 50, 250);
    }
    
    hudTexture.needsUpdate = true;
}

updateHUD("GALACTIC SURVIVAL", "OBJETIVO: Sobrevivir 2 Minutos", "Presiona GATILLO para Iniciar");

const hudScreen = new THREE.Mesh(
    new THREE.PlaneGeometry(2.5, 1.25),
    new THREE.MeshBasicMaterial({ map: hudTexture, transparent: true })
);
hudScreen.position.set(0, 1.8, -4.0);
playerGroup.add(hudScreen);

// === 4. NAVE ===
function createCar() {
    const car = new THREE.Group();
    const body = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 0.5, 3),
        new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4 })
    );
    const engine = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.5, 0.5),
        new THREE.MeshBasicMaterial({ color: 0x00ffff })
    );
    engine.position.set(0, 0.3, 1.2);
    car.add(body, engine);
    return car;
}
const myCar = createCar();
myCar.position.set(0, -0.5, -1);
playerGroup.add(myCar);

// === 5. OBSTÁCULOS (LETALES) ===
// Dos tipos de obstáculos para variedad visual, ambos matan
const boxGeo = new THREE.BoxGeometry(2, 4, 2); 
const boxMat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0x550000 }); 

const spikeGeo = new THREE.ConeGeometry(1.5, 4, 8);
const spikeMat = new THREE.MeshStandardMaterial({ color: 0xff5500, emissive: 0xaa2200 }); 

function spawnItem() {
    if(currentState !== STATE.PLAYING) return;
    
    const isSpike = Math.random() > 0.5; 
    const mesh = new THREE.Mesh(
        isSpike ? spikeGeo : boxGeo,
        isSpike ? spikeMat : boxMat
    );
    
    // Posición aleatoria
    const xPos = (Math.random() - 0.5) * CONFIG.laneWidth * 2.2;
    mesh.position.set(xPos, 0.5, -120); 
    
    if(isSpike) {
        mesh.rotation.x = Math.random() * 0.5; 
        mesh.userData.rotSpeed = Math.random() * 2;
    }

    mesh.userData = { active: true }; // Todos son peligrosos
    scene.add(mesh);
    items.push(mesh);
}

// === 6. SONIDO & EFECTOS ===
function playSound(type) {
    if(listener.context.state === 'suspended') listener.context.resume();
    const osc = listener.context.createOscillator();
    const gain = listener.context.createGain();
    
    if (type === 'pass') { // Sonido suave al esquivar
        osc.frequency.setValueAtTime(400, listener.context.currentTime);
        osc.frequency.exponentialRampToValueAtTime(600, listener.context.currentTime + 0.1);
        gain.gain.setValueAtTime(0.05, listener.context.currentTime);
    } else if (type === 'crash') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(100, listener.context.currentTime);
        osc.frequency.exponentialRampToValueAtTime(10, listener.context.currentTime + 0.5);
        gain.gain.setValueAtTime(0.5, listener.context.currentTime);
    } else if (type === 'win') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(400, listener.context.currentTime);
        osc.frequency.linearRampToValueAtTime(800, listener.context.currentTime + 1.0);
        gain.gain.setValueAtTime(0.3, listener.context.currentTime);
    }
    
    gain.gain.exponentialRampToValueAtTime(0.01, listener.context.currentTime + (type==='crash'?0.5:0.2));
    osc.connect(gain); gain.connect(listener.destination);
    osc.start(); osc.stop(listener.context.currentTime + (type==='crash'?0.5:0.2));
}

// === 7. CONTROLES ===
const controller = renderer.xr.getController(1);
const factory = new XRControllerModelFactory();
const grip = renderer.xr.getControllerGrip(1);
grip.add(factory.createControllerModel(grip));
playerGroup.add(controller, grip);

controller.addEventListener('selectstart', () => {
    if(currentState !== STATE.PLAYING) {
        resetGame();
    }
});

// === 8. RESET ===
function resetGame() {
    items.forEach(i => scene.remove(i));
    items = [];
    tunnelRings.forEach(r => scene.remove(r));
    tunnelRings = [];
    
    score = 0; // Objetos esquivados
    survivalTime = 0;
    currentSpeed = CONFIG.baseSpeed;
    currentState = STATE.PLAYING;
    playerGroup.position.x = 0;
    
    updateHUD();
}

// === BUCLE PRINCIPAL ===
const clock = new THREE.Clock();
let spawnTimer = 0;
let ringTimer = 0;
let difficultyTimer = 0;

renderer.setAnimationLoop(() => {
    const dt = clock.getDelta();

    // -- EFECTOS DE FONDO --
    const bgSpeed = (currentState === STATE.PLAYING) ? currentSpeed : 10;
    
    grid.position.z += bgSpeed * dt;
    if(grid.position.z > 20) grid.position.z = 0;

    ringTimer += dt;
    if(ringTimer > (15 / bgSpeed)) { // Spawn anillos basado en velocidad
        spawnRing();
        ringTimer = 0;
    }
    for(let i=tunnelRings.length-1; i>=0; i--) {
        const r = tunnelRings[i];
        r.position.z += bgSpeed * dt;
        if(r.position.z > 10) {
            scene.remove(r);
            tunnelRings.splice(i, 1);
        }
    }

    // -- LÓGICA DE JUEGO --
    if (currentState === STATE.PLAYING) {
        survivalTime += dt;
        
        // Aumentar dificultad cada 10 segundos
        difficultyTimer += dt;
        if(difficultyTimer > 10) {
            currentSpeed += 5; // Más rápido
            CONFIG.spawnRate *= 0.9; // Más frecuente (reduce el tiempo entre spawns)
            difficultyTimer = 0;
        }

        // Victoria por Tiempo (2 minutos)
        if(survivalTime >= CONFIG.timeToWin) {
            currentState = STATE.WIN;
            playSound('win');
            updateHUD("¡SOBREVIVISTE!", `Tiempo Total: 2:00`, "¡Misión Cumplida, Comandante!");
        } else {
            updateHUD(); // Actualizar reloj
        }

        // Control
        if (renderer.xr.isPresenting) {
            const rot = controller.rotation.z; 
            playerGroup.position.x -= rot * CONFIG.lateralSpeed * dt; 
            
            const limit = CONFIG.laneWidth;
            if(playerGroup.position.x > limit) playerGroup.position.x = limit;
            if(playerGroup.position.x < -limit) playerGroup.position.x = -limit;
            
            myCar.rotation.z = -rot * 0.8;
            myCar.rotation.y = -rot * 0.3;
        }

        // Spawn Obstáculos
        spawnTimer += dt;
        if(spawnTimer > CONFIG.spawnRate) {
            spawnItem();
            spawnTimer = 0;
        }

        // Mover Obstáculos y Colisiones
        for (let i = items.length - 1; i >= 0; i--) {
            const item = items[i];
            item.position.z += currentSpeed * dt;
            if(item.userData.rotSpeed) item.rotation.y += item.userData.rotSpeed * dt;

            const distZ = Math.abs(item.position.z - playerGroup.position.z);
            const distX = Math.abs(item.position.x - playerGroup.position.x);

            // COLISIÓN (GAME OVER SI TOCAS ALGO)
            if (item.userData.active && distZ < 2.0 && distX < 1.5) {
                currentState = STATE.GAMEOVER;
                playSound('crash');
                updateHUD("GAME OVER", "Impacto Crítico Detectado", `Sobreviviste: ${Math.floor(survivalTime)} seg`);
            }

            // PUNTOS POR ESQUIVAR (Pasar el objeto)
            if (item.userData.active && item.position.z > 2.0) {
                item.userData.active = false; // Ya pasó
                score++; // Esquivado +1
                playSound('pass');
            }

            if (item.position.z > 5) {
                scene.remove(item);
                items.splice(i, 1);
            }
        }
    } else {
        // En menu/gameover
        myCar.rotation.y = Math.sin(clock.getElapsedTime()) * 0.1;
        
        // Mover items restantes lentamente para que no se congelen
        for (let i = items.length - 1; i >= 0; i--) {
            const item = items[i];
            item.position.z += 10 * dt;
             if (item.position.z > 5) {
                scene.remove(item);
                items.splice(i, 1);
            }
        }
    }

    renderer.render(scene, camera);
});

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
