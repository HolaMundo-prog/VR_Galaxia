import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

// === CONFIGURACIÓN ===
const CONFIG = {
    baseSpeed: 40,         
    lateralSpeed: 60,      
    laneWidth: 10,         
    spawnRate: 0.8         
};

// Estados
const STATE = { MENU: 0, PLAYING: 1, GAMEOVER: 2 };
let currentState = STATE.MENU;

let currentSpeed = CONFIG.baseSpeed;
let survivalTime = 0;
let items = []; 
let tunnelRings = []; 

// === 1. ESCENA ===
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
scene.fog = new THREE.FogExp2(0x000000, 0.02);

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
const grid = new THREE.GridHelper(400, 100, 0x00ff00, 0x003300); // Grid Matrix Verde
grid.position.y = -2;
scene.add(grid);

const dirLight = new THREE.DirectionalLight(0xffffff, 2);
dirLight.position.set(0, 20, 10);
scene.add(dirLight);
scene.add(new THREE.AmbientLight(0xffffff, 0.5));

// Anillos
const ringGeo = new THREE.TorusGeometry(18, 0.3, 8, 32);
const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.1 });

function spawnRing() {
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.z = -150; 
    scene.add(ring);
    tunnelRings.push(ring);
}

// === 3. HUD (TIEMPO Y GAME OVER) ===
const hudCanvas = document.createElement('canvas');
hudCanvas.width = 1024; hudCanvas.height = 512;
const hudCtx = hudCanvas.getContext('2d');
const hudTexture = new THREE.CanvasTexture(hudCanvas);

function updateHUD(title, subtitle) {
    hudCtx.clearRect(0,0,1024,512);
    
    if (currentState === STATE.PLAYING) {
        // --- HUD JUGANDO ---
        // Fondo transparente para ver bien
        hudCtx.textAlign = 'left';
        
        // Tiempo (Cronómetro)
        const mins = Math.floor(survivalTime / 60);
        const secs = Math.floor(survivalTime % 60).toString().padStart(2, '0');
        const ms = Math.floor((survivalTime % 1) * 100).toString().padStart(2, '0');
        
        hudCtx.fillStyle = '#00ff00';
        hudCtx.font = 'bold 80px Monospace';
        hudCtx.fillText(`TIEMPO: ${mins}:${secs}:${ms}`, 50, 100);
        
        // Velocidad
        hudCtx.fillStyle = '#00ffff'; 
        hudCtx.font = '50px Arial';
        hudCtx.fillText(`VELOCIDAD: ${Math.floor(currentSpeed)} km/h`, 50, 180);

    } else {
        // --- PANTALLA MENÚ / GAME OVER ---
        hudCtx.fillStyle = 'rgba(0, 0, 0, 0.9)';
        hudCtx.fillRect(0,0,1024,512);
        
        let color = '#00ff00'; 
        if(currentState === STATE.GAMEOVER) color = '#ff0000'; 
        
        hudCtx.lineWidth = 20;
        hudCtx.strokeStyle = color;
        hudCtx.strokeRect(10,10,1004,492);
        
        hudCtx.textAlign = 'center';
        hudCtx.fillStyle = color;
        hudCtx.font = 'bold 120px Arial';
        hudCtx.fillText(title || "GALACTIC RUN", 512, 180);
        
        hudCtx.fillStyle = '#ffffff';
        hudCtx.font = '60px Arial';
        hudCtx.fillText(subtitle || "Presiona GATILLO para Iniciar", 512, 300);
        
        // Botón visual simulado
        if(currentState === STATE.GAMEOVER) {
            hudCtx.fillStyle = '#333333';
            hudCtx.fillRect(362, 380, 300, 80);
            hudCtx.fillStyle = '#ffffff';
            hudCtx.font = '40px Arial';
            hudCtx.fillText("[ REINTENTAR ]", 512, 435);
        }
    }
    
    hudTexture.needsUpdate = true;
}

updateHUD("GALACTIC RUN", "Presiona GATILLO para Iniciar");

const hudScreen = new THREE.Mesh(
    new THREE.PlaneGeometry(3, 1.5),
    new THREE.MeshBasicMaterial({ map: hudTexture, transparent: true })
);
hudScreen.position.set(0, 2.0, -4.5); // Arriba y al frente
playerGroup.add(hudScreen);

// === 4. NAVE ===
function createCar() {
    const car = new THREE.Group();
    const body = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 0.5, 3),
        new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 })
    );
    const engine = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.5, 0.5),
        new THREE.MeshBasicMaterial({ color: 0x00ff00 }) // Motor verde
    );
    engine.position.set(0, 0.3, 1.2);
    car.add(body, engine);
    return car;
}
const myCar = createCar();
myCar.position.set(0, -0.5, -1);
playerGroup.add(myCar);

// === 5. OBSTÁCULOS ===
// Todos son obstáculos ahora. No hay monedas.
const boxGeo = new THREE.BoxGeometry(2, 4, 2); 
const boxMat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0x550000 }); 
const spikeGeo = new THREE.ConeGeometry(1.5, 4, 8);
const spikeMat = new THREE.MeshStandardMaterial({ color: 0xff3300, emissive: 0xaa1100 }); 

function spawnItem() {
    if(currentState !== STATE.PLAYING) return;
    
    const isSpike = Math.random() > 0.5; 
    const mesh = new THREE.Mesh(
        isSpike ? spikeGeo : boxGeo,
        isSpike ? spikeMat : boxMat
    );
    
    const xPos = (Math.random() - 0.5) * CONFIG.laneWidth * 2.2;
    mesh.position.set(xPos, 0.5, -120); 
    
    if(isSpike) {
        mesh.rotation.x = Math.random() * 0.5; 
        mesh.userData.rotSpeed = Math.random() * 2;
    }

    mesh.userData = { active: true };
    scene.add(mesh);
    items.push(mesh);
}

// === 6. SONIDOS ===
function playSound(type) {
    if(listener.context.state === 'suspended') listener.context.resume();
    const osc = listener.context.createOscillator();
    const gain = listener.context.createGain();
    
    if (type === 'crash') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(100, listener.context.currentTime);
        osc.frequency.exponentialRampToValueAtTime(10, listener.context.currentTime + 0.5);
        gain.gain.setValueAtTime(0.5, listener.context.currentTime);
    }
    
    gain.gain.exponentialRampToValueAtTime(0.01, listener.context.currentTime + 0.5);
    osc.connect(gain); gain.connect(listener.destination);
    osc.start(); osc.stop(listener.context.currentTime + 0.5);
}

// === 7. CONTROLES ===
const controller = renderer.xr.getController(1);
const factory = new XRControllerModelFactory();
const grip = renderer.xr.getControllerGrip(1);
grip.add(factory.createControllerModel(grip));
playerGroup.add(controller, grip);

// BOTÓN REINTENTAR (Gatillo)
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
    
    survivalTime = 0;
    currentSpeed = CONFIG.baseSpeed;
    currentState = STATE.PLAYING;
    playerGroup.position.x = 0;
    
    // Resetear dificultad
    CONFIG.spawnRate = 0.8;

    updateHUD();
}

// === BUCLE PRINCIPAL ===
const clock = new THREE.Clock();
let spawnTimer = 0;
let ringTimer = 0;
let difficultyTimer = 0;

renderer.setAnimationLoop(() => {
    const dt = clock.getDelta();

    // Fondo siempre en movimiento (incluso en Game Over)
    const bgSpeed = (currentState === STATE.PLAYING) ? currentSpeed : 10;
    
    grid.position.z += bgSpeed * dt;
    if(grid.position.z > 20) grid.position.z = 0;

    ringTimer += dt;
    if(ringTimer > (15 / bgSpeed)) {
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

    if (currentState === STATE.PLAYING) {
        survivalTime += dt;
        updateHUD(); // Actualizar cronómetro

        // Dificultad progresiva
        difficultyTimer += dt;
        if(difficultyTimer > 10) {
            currentSpeed += 5; 
            CONFIG.spawnRate *= 0.95; // Spawns más rápidos
            difficultyTimer = 0;
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

        // Spawn
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

            // COLISIÓN = GAME OVER
            if (item.userData.active && distZ < 2.0 && distX < 1.5) {
                currentState = STATE.GAMEOVER;
                playSound('crash');
                updateHUD("GAME OVER", `Tiempo Final: ${Math.floor(survivalTime)} seg`);
            }

            if (item.position.z > 5) {
                scene.remove(item);
                items.splice(i, 1);
            }
        }
    } else {
        // En Menu/GameOver
        myCar.rotation.y = Math.sin(clock.getElapsedTime()) * 0.1;
        
        // Limpieza visual de objetos pasados
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
