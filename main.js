import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

// === CONFIGURACIÓN DEL JUEGO ===
const CONFIG = {
    baseSpeed: 40,         
    lateralSpeed: 60,      // Sensibilidad alta para esquivar
    laneWidth: 10,         
    winScore: 5000,        // Meta alta (50 monedas) para que no acabe rápido
    spawnRate: 0.6         
};

// Estados
const STATE = { MENU: 0, PLAYING: 1, GAMEOVER: 2, WIN: 3 };
let currentState = STATE.MENU;

let score = 0;
let currentSpeed = CONFIG.baseSpeed;
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
// Grid en movimiento
const grid = new THREE.GridHelper(400, 100, 0xff00ff, 0x110033);
grid.position.y = -2;
scene.add(grid);

// Luces
const dirLight = new THREE.DirectionalLight(0xffffff, 2);
dirLight.position.set(0, 20, 10);
scene.add(dirLight);
scene.add(new THREE.AmbientLight(0xffffff, 0.5));

// Anillos del túnel (Neon)
const ringGeo = new THREE.TorusGeometry(18, 0.3, 8, 32);
const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.2 });

function spawnRing() {
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.z = -150; 
    scene.add(ring);
    tunnelRings.push(ring);
}

// === 3. HUD (PANTALLA CON CRÉDITOS) ===
const hudCanvas = document.createElement('canvas');
hudCanvas.width = 1024; hudCanvas.height = 512;
const hudCtx = hudCanvas.getContext('2d');
const hudTexture = new THREE.CanvasTexture(hudCanvas);

function updateHUD(title, subtitle, extraInfo) {
    hudCtx.clearRect(0,0,1024,512);
    
    // Fondo panel
    hudCtx.fillStyle = 'rgba(0, 10, 20, 0.85)';
    hudCtx.fillRect(0,0,1024,512);
    
    // Borde de color
    let color = '#00ffcc'; 
    if(currentState === STATE.GAMEOVER) color = '#ff0044'; 
    if(currentState === STATE.WIN) color = '#ffff00'; 
    
    hudCtx.lineWidth = 15;
    hudCtx.strokeStyle = color;
    hudCtx.strokeRect(10,10,1004,492);

    hudCtx.textAlign = 'center';
    
    if (currentState === STATE.PLAYING) {
        // Marcador en juego
        hudCtx.fillStyle = '#00ffcc';
        hudCtx.font = 'bold 80px Arial';
        hudCtx.fillText(`PUNTOS: ${score} / ${CONFIG.winScore}`, 512, 150);
        
        // Barra
        hudCtx.fillStyle = '#333';
        hudCtx.fillRect(212, 200, 600, 30);
        hudCtx.fillStyle = '#00ffcc';
        const progress = Math.min((score / CONFIG.winScore) * 600, 600);
        hudCtx.fillRect(212, 200, progress, 30);

        hudCtx.font = '50px Arial';
        hudCtx.fillStyle = '#ffffff';
        hudCtx.fillText("AZUL = Puntos  |  ROJO = Muerte", 512, 350);

    } else {
        // Pantallas de Menú / Fin
        hudCtx.shadowColor = color;
        hudCtx.shadowBlur = 20;
        
        hudCtx.fillStyle = color;
        hudCtx.font = 'bold 100px Arial';
        hudCtx.fillText(title || "GALACTIC TUNNEL", 512, 150);
        
        hudCtx.shadowBlur = 0;
        hudCtx.fillStyle = '#ffffff';
        hudCtx.font = '50px Arial';
        hudCtx.fillText(subtitle || "Reglas: Inclina tu mano para moverte.", 512, 250);
        
        if(extraInfo) {
            hudCtx.fillStyle = '#aaaaaa';
            hudCtx.font = 'italic 40px Arial';
            hudCtx.fillText(extraInfo, 512, 400);
        }
        
        // CRÉDITOS
        hudCtx.fillStyle = '#0088ff';
        hudCtx.font = 'bold 35px Arial';
        hudCtx.fillText("Creado por: Angel Budar Solano", 512, 460);
    }
    hudTexture.needsUpdate = true;
}

// Crear pantalla inicial
updateHUD("GALACTIC TUNNEL", "REGLAS: Esquiva ROJO, Toma AZUL", "Presiona GATILLO para Iniciar");

const hudScreen = new THREE.Mesh(
    new THREE.PlaneGeometry(2.5, 1.25),
    new THREE.MeshBasicMaterial({ map: hudTexture, transparent: true })
);
hudScreen.position.set(0, 1.5, -3.5);
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

// === 5. OBJETOS ===
const obstacleGeo = new THREE.BoxGeometry(2, 4, 2); 
const obstacleMat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0x550000 }); 
const coinGeo = new THREE.SphereGeometry(1, 16, 16);
const coinMat = new THREE.MeshStandardMaterial({ color: 0x0088ff, emissive: 0x0088ff, emissiveIntensity: 1 });

function spawnItem() {
    if(currentState !== STATE.PLAYING) return;
    
    const isCoin = Math.random() > 0.5; 
    const mesh = new THREE.Mesh(
        isCoin ? coinGeo : obstacleGeo,
        isCoin ? coinMat : obstacleMat
    );
    
    const xPos = (Math.random() - 0.5) * CONFIG.laneWidth * 2.2;
    mesh.position.set(xPos, 0.5, -120); 
    mesh.userData = { type: isCoin ? 'coin' : 'obstacle', active: true };
    
    scene.add(mesh);
    items.push(mesh);
}

// === 6. SONIDO & EFECTOS ===
function playSound(type) {
    if(listener.context.state === 'suspended') listener.context.resume();
    const osc = listener.context.createOscillator();
    const gain = listener.context.createGain();
    
    if (type === 'coin') {
        osc.frequency.setValueAtTime(600, listener.context.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1200, listener.context.currentTime + 0.1);
        gain.gain.setValueAtTime(0.2, listener.context.currentTime);
    } else if (type === 'crash') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, listener.context.currentTime);
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
    
    score = 0;
    currentSpeed = CONFIG.baseSpeed;
    currentState = STATE.PLAYING;
    playerGroup.position.x = 0;
    
    camera.fov = 75;
    camera.updateProjectionMatrix();

    updateHUD();
}

// === BUCLE PRINCIPAL ===
const clock = new THREE.Clock();
let spawnTimer = 0;
let ringTimer = 0;

renderer.setAnimationLoop(() => {
    const dt = clock.getDelta();

    // -- EFECTOS DE FONDO (Siempre corren para que no se sienta trabado) --
    const bgSpeed = (currentState === STATE.PLAYING) ? currentSpeed : 10;
    
    grid.position.z += bgSpeed * dt;
    if(grid.position.z > 20) grid.position.z = 0;

    // Anillos de fondo
    ringTimer += dt;
    if(ringTimer > 0.4) {
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
        currentSpeed += dt * 0.5; // Acelerar

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

        // Spawn Items
        spawnTimer += dt;
        if(spawnTimer > (20 / currentSpeed)) {
            spawnItem();
            spawnTimer = 0;
        }

        // Mover Items y Colisiones
        for (let i = items.length - 1; i >= 0; i--) {
            const item = items[i];
            item.position.z += currentSpeed * dt;
            item.rotation.x += dt * 2;
            item.rotation.y += dt * 2;

            const distZ = Math.abs(item.position.z - playerGroup.position.z);
            const distX = Math.abs(item.position.x - playerGroup.position.x);

            if (item.userData.active && distZ < 2.0 && distX < 1.5) {
                item.userData.active = false;
                scene.remove(item);
                items.splice(i, 1);
                
                if (item.userData.type === 'coin') {
                    score += 100;
                    playSound('coin');
                    
                    // Efecto Turbo
                    camera.fov = 85; 
                    camera.updateProjectionMatrix();
                    setTimeout(() => {
                        camera.fov = 75;
                        camera.updateProjectionMatrix();
                    }, 200);

                    updateHUD();
                    
                    // Meta: 5000 puntos
                    if (score >= CONFIG.winScore) {
                        currentState = STATE.WIN;
                        playSound('win');
                        updateHUD("¡MISIÓN CUMPLIDA!", `Puntaje Máximo: ${score}`, "Angel Budar Solano te felicita.");
                    }
                } else {
                    currentState = STATE.GAMEOVER;
                    playSound('crash');
                    updateHUD("GAME OVER", "Te estrellaste.", "Inténtalo de nuevo.");
                }
                continue;
            }

            if (item.position.z > 5) {
                scene.remove(item);
                items.splice(i, 1);
            }
        }
    } else {
        // En menu/gameover rotamos la nave lentamente
        myCar.rotation.y = Math.sin(clock.getElapsedTime()) * 0.1;
    }

    renderer.render(scene, camera);
});

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
