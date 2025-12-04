import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

// === CONFIGURACIÓN ===
const CONFIG = {
    baseSpeed: 50,         // Más rápido desde el inicio
    lateralSpeed: 70,      // Muy sensible
    laneWidth: 12,         // Un poco más ancho para maniobrar
    spawnRate: 0.7,        
    timeToWin: 180         // 3 Minutos para ganar
};

// Estados
const STATE = { MENU: 0, PLAYING: 1, GAMEOVER: 2, WIN: 3 };
let currentState = STATE.MENU;

let currentSpeed = CONFIG.baseSpeed;
let survivalTime = 0;
let items = []; 
let tunnelRings = []; 
let warpParticles = []; // Partículas de velocidad

// === 1. ESCENA ===
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
scene.fog = new THREE.FogExp2(0x000000, 0.015);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 400);
const playerGroup = new THREE.Group();
scene.add(playerGroup);

// Un grupo interno para efectos de temblor (Shake)
const shakeGroup = new THREE.Group();
playerGroup.add(shakeGroup);
shakeGroup.add(camera);

// Audio
const listener = new THREE.AudioListener();
camera.add(listener);
const bgMusic = document.getElementById('bg-music');
renderer.xr.addEventListener('sessionstart', () => {
    if(bgMusic) { bgMusic.volume=0.4; bgMusic.play().catch(console.warn); }
    resetGame();
});

// === 2. ENTORNO ===
const grid = new THREE.GridHelper(600, 150, 0xff00cc, 0x110022); // Grid Synthwave
grid.position.y = -4;
scene.add(grid);

const dirLight = new THREE.DirectionalLight(0xffffff, 2);
dirLight.position.set(0, 20, 10);
scene.add(dirLight);
scene.add(new THREE.AmbientLight(0xffffff, 0.5));

// Anillos del túnel
const ringGeo = new THREE.TorusGeometry(25, 0.5, 8, 32);
const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.15 });

function spawnRing() {
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.z = -200; 
    scene.add(ring);
    tunnelRings.push(ring);
}

// Efecto Warp (Estrellas fugaces)
const warpGeo = new THREE.BufferGeometry();
const warpCount = 1000;
const warpPos = new Float32Array(warpCount * 3);
for(let i=0; i<warpCount*3; i++) warpPos[i] = (Math.random()-0.5)*100;
warpGeo.setAttribute('position', new THREE.BufferAttribute(warpPos, 3));
const warpMat = new THREE.PointsMaterial({color: 0xffffff, size: 0.2, transparent: true, opacity: 0.8});
const warpSystem = new THREE.Points(warpGeo, warpMat);
scene.add(warpSystem);


// === 3. HUD (INTERFAZ) ===
const hudCanvas = document.createElement('canvas');
hudCanvas.width = 1024; hudCanvas.height = 512;
const hudCtx = hudCanvas.getContext('2d');
const hudTexture = new THREE.CanvasTexture(hudCanvas);

function updateHUD(title, subtitle, extraInfo) {
    hudCtx.clearRect(0,0,1024,512);
    
    if (currentState === STATE.PLAYING) {
        // --- HUD JUGANDO (Minimalista) ---
        hudCtx.textAlign = 'left';
        
        // Tiempo
        const mins = Math.floor(survivalTime / 60);
        const secs = Math.floor(survivalTime % 60).toString().padStart(2, '0');
        const ms = Math.floor((survivalTime % 1) * 100).toString().padStart(2, '0');
        
        // Color cambia si estás cerca de ganar
        hudCtx.fillStyle = survivalTime > 150 ? '#ff00cc' : '#00ffcc';
        hudCtx.font = 'bold 90px Monospace';
        hudCtx.fillText(`${mins}:${secs}:${ms}`, 50, 100);
        
        hudCtx.fillStyle = '#ffffff';
        hudCtx.font = '40px Arial';
        hudCtx.fillText(`META: 3:00`, 50, 160);
        
        // Velocímetro
        hudCtx.fillStyle = '#ffff00'; 
        hudCtx.font = 'bold 60px Arial';
        hudCtx.fillText(`${Math.floor(currentSpeed)} KM/H`, 50, 450);

    } else {
        // --- PANTALLAS MENÚ / GAME OVER ---
        hudCtx.fillStyle = 'rgba(0, 0, 0, 0.95)';
        hudCtx.fillRect(0,0,1024,512);
        
        let color = '#00ffcc'; 
        if(currentState === STATE.GAMEOVER) color = '#ff0000'; 
        if(currentState === STATE.WIN) color = '#ffff00';
        
        hudCtx.lineWidth = 20;
        hudCtx.strokeStyle = color;
        hudCtx.strokeRect(10,10,1004,492);
        
        hudCtx.textAlign = 'center';
        
        // Título Principal
        hudCtx.fillStyle = color;
        hudCtx.font = 'bold 100px Arial';
        hudCtx.fillText(title || "HYPER RUNNER", 512, 150);
        
        // Subtítulo
        hudCtx.fillStyle = '#ffffff';
        hudCtx.font = 'bold 50px Arial';
        hudCtx.fillText(subtitle || "OBJETIVO: Sobrevivir 3 Minutos", 512, 250);
        
        // Extra
        if(extraInfo) {
            hudCtx.fillStyle = '#aaaaaa';
            hudCtx.font = 'italic 40px Arial';
            hudCtx.fillText(extraInfo, 512, 350);
        }
        
        // Botón Simulado
        hudCtx.fillStyle = color;
        hudCtx.fillRect(312, 400, 400, 80);
        hudCtx.fillStyle = '#000000';
        hudCtx.font = 'bold 40px Arial';
        hudCtx.fillText(currentState === STATE.GAMEOVER ? "GATILLO: REINICIAR" : "GATILLO: INICIAR", 512, 455);
    }
    
    hudTexture.needsUpdate = true;
}

updateHUD("GALACTIC RACER", "Sobrevive 3 Minutos para Ganar", "Esquiva los obstáculos rojos");

const hudScreen = new THREE.Mesh(
    new THREE.PlaneGeometry(3.5, 1.75),
    new THREE.MeshBasicMaterial({ map: hudTexture, transparent: true })
);
hudScreen.position.set(0, 2.2, -5.0);
playerGroup.add(hudScreen);


// === 4. NAVE ESPACIAL (DISEÑO MEJORADO) ===
function createShip() {
    const ship = new THREE.Group();
    
    // Materiales
    const hullMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.3, metalness: 0.8 });
    const paintMat = new THREE.MeshStandardMaterial({ color: 0x00d2ff, roughness: 0.2, metalness: 0.5 });
    const glowMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
    const engineMat = new THREE.MeshBasicMaterial({ color: 0xff00aa });

    // Cuerpo principal (Fusulaje)
    const bodyGeo = new THREE.ConeGeometry(0.8, 4, 8);
    const body = new THREE.Mesh(bodyGeo, hullMat);
    body.rotation.x = Math.PI / 2;
    body.scale.z = 1.5;
    ship.add(body);

    // Cabina
    const cockpit = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 0.5, 1.5),
        new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.1 })
    );
    cockpit.position.set(0, 0.5, 0.5);
    ship.add(cockpit);

    // Alas
    const wingGeo = new THREE.BoxGeometry(4, 0.1, 1.5);
    const wing = new THREE.Mesh(wingGeo, paintMat);
    wing.position.set(0, 0, 1);
    // Doblar alas (simple truco visual con rotación de hijos o geometría custom, aquí usamos cajas inclinadas)
    const leftWingTip = new THREE.Mesh(new THREE.BoxGeometry(1, 0.1, 2), hullMat);
    leftWingTip.position.set(2.2, 0.2, 1);
    leftWingTip.rotation.z = 0.5;
    
    const rightWingTip = new THREE.Mesh(new THREE.BoxGeometry(1, 0.1, 2), hullMat);
    rightWingTip.position.set(-2.2, 0.2, 1);
    rightWingTip.rotation.z = -0.5;
    
    ship.add(wing, leftWingTip, rightWingTip);

    // Motores (Propulsores)
    const engineGeo = new THREE.CylinderGeometry(0.3, 0.1, 1, 16);
    const leftEng = new THREE.Mesh(engineGeo, hullMat);
    leftEng.rotation.x = Math.PI / 2;
    leftEng.position.set(-1, 0, 2);
    
    const rightEng = new THREE.Mesh(engineGeo, hullMat);
    rightEng.rotation.x = Math.PI / 2;
    rightEng.position.set(1, 0, 2);
    
    // Brillo motor
    const glowGeo = new THREE.CircleGeometry(0.25, 16);
    const lGlow = new THREE.Mesh(glowGeo, engineMat); lGlow.position.set(0, -0.51, 0); lGlow.rotation.x = Math.PI/2;
    const rGlow = new THREE.Mesh(glowGeo, engineMat); rGlow.position.set(0, -0.51, 0); rGlow.rotation.x = Math.PI/2;
    
    leftEng.add(lGlow);
    rightEng.add(rGlow);
    ship.add(leftEng, rightEng);

    return ship;
}
const myShip = createShip();
myShip.position.set(0, -1.5, -2); // Posición bajo la cámara
shakeGroup.add(myShip); // Añadir al grupo de temblor


// === 5. OBSTÁCULOS (NEÓN PELIGROSO) ===
const boxGeo = new THREE.BoxGeometry(3, 6, 3); 
const boxMat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xaa0000, roughness: 0.1 }); 
const spikeGeo = new THREE.OctahedronGeometry(2.5, 0);
const spikeMat = new THREE.MeshStandardMaterial({ color: 0xff3300, emissive: 0xff1100, roughness: 0.1 }); 

function spawnItem() {
    if(currentState !== STATE.PLAYING) return;
    
    const isSpike = Math.random() > 0.5; 
    const mesh = new THREE.Mesh(
        isSpike ? spikeGeo : boxGeo,
        isSpike ? spikeMat : boxMat
    );
    
    // Posición aleatoria más agresiva
    const xPos = (Math.random() - 0.5) * CONFIG.laneWidth * 2.5;
    mesh.position.set(xPos, 0, -150); 
    
    if(isSpike) {
        mesh.userData.rotSpeed = Math.random() * 3;
    }

    mesh.userData = { active: true };
    scene.add(mesh);
    items.push(mesh);
}

// === 6. EFECTOS VISUALES & SONIDO ===
function playSound(type) {
    if(listener.context.state === 'suspended') listener.context.resume();
    const osc = listener.context.createOscillator();
    const gain = listener.context.createGain();
    
    if (type === 'crash') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(100, listener.context.currentTime);
        osc.frequency.exponentialRampToValueAtTime(10, listener.context.currentTime + 0.8);
        gain.gain.setValueAtTime(0.8, listener.context.currentTime);
    } else if (type === 'win') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(400, listener.context.currentTime);
        osc.frequency.linearRampToValueAtTime(800, listener.context.currentTime + 2.0);
        gain.gain.setValueAtTime(0.5, listener.context.currentTime);
    }
    
    gain.gain.exponentialRampToValueAtTime(0.01, listener.context.currentTime + 1.0);
    osc.connect(gain); gain.connect(listener.destination);
    osc.start(); osc.stop(listener.context.currentTime + 1.0);
}

function cameraShake(intensity) {
    shakeGroup.position.x = (Math.random() - 0.5) * intensity;
    shakeGroup.position.y = (Math.random() - 0.5) * intensity;
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
    
    survivalTime = 0;
    currentSpeed = CONFIG.baseSpeed;
    currentState = STATE.PLAYING;
    playerGroup.position.x = 0;
    shakeGroup.position.set(0,0,0);
    
    CONFIG.spawnRate = 0.7; // Reset spawn rate

    updateHUD();
}

// === BUCLE PRINCIPAL ===
const clock = new THREE.Clock();
let spawnTimer = 0;
let ringTimer = 0;
let difficultyTimer = 0;

renderer.setAnimationLoop(() => {
    const dt = clock.getDelta();

    // Fondo siempre en movimiento
    const bgSpeed = (currentState === STATE.PLAYING) ? currentSpeed : 20;
    
    grid.position.z += bgSpeed * dt;
    if(grid.position.z > 20) grid.position.z = 0;

    // Warp Particles (Efecto velocidad)
    const positions = warpSystem.geometry.attributes.position.array;
    for(let i=0; i<warpCount; i++) {
        positions[i*3 + 2] += bgSpeed * dt * 2; // Se mueven más rápido que el entorno
        if(positions[i*3 + 2] > 20) {
            positions[i*3 + 2] = -150;
            positions[i*3] = (Math.random()-0.5)*100;
            positions[i*3+1] = (Math.random()-0.5)*100;
        }
    }
    warpSystem.geometry.attributes.position.needsUpdate = true;

    // Anillos
    ringTimer += dt;
    if(ringTimer > (25 / bgSpeed)) {
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
        
        // Temblor de velocidad (Adrenalina)
        const shakeIntensity = (currentSpeed - CONFIG.baseSpeed) * 0.0005;
        cameraShake(shakeIntensity);

        updateHUD(); 

        // Dificultad
        difficultyTimer += dt;
        if(difficultyTimer > 15) {
            currentSpeed += 8; // Acelerar
            CONFIG.spawnRate *= 0.9; // Más obstáculos
            difficultyTimer = 0;
        }
        
        // WIN CONDITION
        if(survivalTime >= CONFIG.timeToWin) {
            currentState = STATE.WIN;
            playSound('win');
            updateHUD("¡VICTORIA!", "SOBREVIVISTE 3 MINUTOS", "¡Eres un piloto legendario!");
        }

        // Control
        if (renderer.xr.isPresenting) {
            const rot = controller.rotation.z; 
            playerGroup.position.x -= rot * CONFIG.lateralSpeed * dt; 
            
            const limit = CONFIG.laneWidth;
            if(playerGroup.position.x > limit) playerGroup.position.x = limit;
            if(playerGroup.position.x < -limit) playerGroup.position.x = -limit;
            
            // Inclinación dramática de la nave
            myShip.rotation.z = -rot * 1.2; 
            myShip.rotation.y = -rot * 0.5;
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
            if(item.userData.rotSpeed) item.rotation.x += item.userData.rotSpeed * dt;

            const distZ = Math.abs(item.position.z - playerGroup.position.z);
            const distX = Math.abs(item.position.x - playerGroup.position.x);

            // COLISIÓN
            if (item.userData.active && distZ < 2.5 && distX < 2.0) {
                currentState = STATE.GAMEOVER;
                playSound('crash');
                updateHUD("GAME OVER", "NAVE DESTRUIDA", `Tiempo Final: ${Math.floor(survivalTime)} seg`);
            }

            if (item.position.z > 5) {
                scene.remove(item);
                items.splice(i, 1);
            }
        }
    } else {
        // Animación en espera
        myShip.rotation.z = Math.sin(clock.getElapsedTime()*2) * 0.1;
        
        // Limpieza visual
        for (let i = items.length - 1; i >= 0; i--) {
            const item = items[i];
            item.position.z += 15 * dt;
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
