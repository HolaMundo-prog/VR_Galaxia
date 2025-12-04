import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

// === CONFIGURACIÓN ===
const CONFIG = {
    baseSpeed: 45,         
    lateralSpeed: 70,      
    laneWidth: 12,         
    spawnRate: 0.8,        
    timeToWin: 300 // 5 Minutos (300 segundos)
};

// Estados
const STATE = { MENU: 0, PLAYING: 1, GAMEOVER: 2, WIN: 3 };
let currentState = STATE.MENU;

let currentSpeed = CONFIG.baseSpeed;
let survivalTime = 0;
let items = []; 
let tunnelRings = []; 
let warpParticles = []; 
let speedLines = []; // Ases de luz
let frameCount = 0; 

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
const grid = new THREE.GridHelper(600, 150, 0xff00cc, 0x110022); 
grid.position.y = -4;
scene.add(grid);

const dirLight = new THREE.DirectionalLight(0xffffff, 2);
dirLight.position.set(0, 20, 10);
scene.add(dirLight);
scene.add(new THREE.AmbientLight(0xffffff, 0.5));

// Anillos
const ringGeo = new THREE.TorusGeometry(25, 0.5, 8, 32);
const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.15 });

function spawnRing() {
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.z = -200; 
    scene.add(ring);
    tunnelRings.push(ring);
}

// Warp Particles (Estrellas)
const warpGeo = new THREE.BufferGeometry();
const warpCount = 1000;
const warpPos = new Float32Array(warpCount * 3);
for(let i=0; i<warpCount*3; i++) warpPos[i] = (Math.random()-0.5)*100;
warpGeo.setAttribute('position', new THREE.BufferAttribute(warpPos, 3));
const warpMat = new THREE.PointsMaterial({color: 0xffffff, size: 0.2, transparent: true, opacity: 0.8});
const warpSystem = new THREE.Points(warpGeo, warpMat);
scene.add(warpSystem);

// Ases de Luz (Speed Lines)
function createSpeedLine() {
    const geo = new THREE.BoxGeometry(0.1, 0.1, 10);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.0 });
    const line = new THREE.Mesh(geo, mat);
    line.position.set((Math.random()-0.5)*40, (Math.random()-0.5)*20, -100);
    scene.add(line);
    speedLines.push(line);
}
// Crear pool inicial de líneas
for(let i=0; i<20; i++) createSpeedLine();


// === 3. HUD ===
const hudCanvas = document.createElement('canvas');
hudCanvas.width = 1024; hudCanvas.height = 512;
const hudCtx = hudCanvas.getContext('2d');
const hudTexture = new THREE.CanvasTexture(hudCanvas);

function updateHUD(title, subtitle, extraInfo) {
    hudCtx.clearRect(0,0,1024,512);
    
    if (currentState === STATE.PLAYING) {
        // --- HUD JUGANDO ---
        hudCtx.textAlign = 'left';
        
        const mins = Math.floor(survivalTime / 60);
        const secs = Math.floor(survivalTime % 60).toString().padStart(2, '0');
        const ms = Math.floor((survivalTime % 1) * 100).toString().padStart(2, '0');
        
        hudCtx.fillStyle = survivalTime > 250 ? '#ff00cc' : '#00ffcc';
        hudCtx.font = 'bold 90px Monospace';
        hudCtx.fillText(`${mins}:${secs}:${ms}`, 50, 100);
        
        hudCtx.fillStyle = '#ffffff';
        hudCtx.font = '40px Arial';
        hudCtx.fillText(`META: 5:00`, 50, 160);
        
        hudCtx.fillStyle = '#ffff00'; 
        hudCtx.font = 'bold 60px Arial';
        hudCtx.fillText(`${Math.floor(currentSpeed)} KM/H`, 50, 450);

        hudCtx.font = '30px Arial';
        hudCtx.fillStyle = '#aaaaaa';
        hudCtx.fillText("Botón Grip: Reinicio Rápido", 500, 450);

    } else {
        // --- MENÚ / GAME OVER ---
        hudCtx.fillStyle = 'rgba(0, 0, 0, 0.95)';
        hudCtx.fillRect(0,0,1024,512);
        
        let color = '#00ffcc'; 
        if(currentState === STATE.GAMEOVER) color = '#ff0000'; 
        if(currentState === STATE.WIN) color = '#ffff00';
        
        hudCtx.lineWidth = 20;
        hudCtx.strokeStyle = color;
        hudCtx.strokeRect(10,10,1004,492);
        
        hudCtx.textAlign = 'center';
        
        hudCtx.fillStyle = color;
        hudCtx.font = 'bold 100px Arial';
        hudCtx.fillText(title || "HYPER RUNNER", 512, 150);
        
        hudCtx.fillStyle = '#ffffff';
        hudCtx.font = 'bold 50px Arial';
        hudCtx.fillText(subtitle || "OBJETIVO: Sobrevivir 5 Minutos", 512, 250);
        
        if(extraInfo) {
            hudCtx.fillStyle = '#ff3333'; // Rojo para resaltar advertencia
            hudCtx.font = 'bold 45px Arial';
            hudCtx.fillText(extraInfo, 512, 350);
        }
        
        // Botón
        hudCtx.fillStyle = color;
        hudCtx.fillRect(312, 380, 400, 60);
        hudCtx.fillStyle = '#000000';
        hudCtx.font = 'bold 40px Arial';
        hudCtx.fillText(currentState === STATE.GAMEOVER ? "GATILLO: REINTENTAR" : "GATILLO: INICIAR", 512, 425);

        // Créditos
        hudCtx.textAlign = 'right';
        hudCtx.fillStyle = '#0088ff';
        hudCtx.font = 'bold 25px Arial';
        hudCtx.fillText("Angel Budar Solano - 24200293", 1000, 500);
    }
    
    hudTexture.needsUpdate = true;
}

updateHUD("GALACTIC RACER", "Sobrevive 5 Minutos para Ganar", "Si chocas pierdes. ¡Esquiva!");

const hudScreen = new THREE.Mesh(
    new THREE.PlaneGeometry(3.5, 1.75),
    new THREE.MeshBasicMaterial({ map: hudTexture, transparent: true })
);
hudScreen.position.set(0, 2.2, -5.0);
playerGroup.add(hudScreen);


// === 4. NAVE ===
function createShip() {
    const ship = new THREE.Group();
    
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.3 });
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.8, 4, 8), bodyMat);
    body.rotation.x = Math.PI / 2;
    body.scale.z = 1.5;
    ship.add(body);

    const cockpit = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 0.5, 1.5),
        new THREE.MeshStandardMaterial({ color: 0x111111 })
    );
    cockpit.position.set(0, 0.5, 0.5);
    ship.add(cockpit);

    const wingMat = new THREE.MeshStandardMaterial({ color: 0x00d2ff });
    const wing = new THREE.Mesh(new THREE.BoxGeometry(4, 0.1, 1.5), wingMat);
    wing.position.set(0, 0, 1);
    ship.add(wing);

    return ship;
}
const myShip = createShip();
myShip.position.set(0, -1.5, -2);
shakeGroup.add(myShip);

// === 5. OBSTÁCULOS ===
const boxGeo = new THREE.BoxGeometry(3, 6, 3); 
const boxMat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xaa0000 }); 
const spikeGeo = new THREE.OctahedronGeometry(2.5, 0);
const spikeMat = new THREE.MeshStandardMaterial({ color: 0xff3300, emissive: 0xff1100 }); 

function spawnItem() {
    if(currentState !== STATE.PLAYING) return;
    
    const isSpike = Math.random() > 0.5; 
    const mesh = new THREE.Mesh(
        isSpike ? spikeGeo : boxGeo,
        isSpike ? spikeMat : boxMat
    );
    
    const xPos = (Math.random() - 0.5) * CONFIG.laneWidth * 2.5;
    mesh.position.set(xPos, 0, -200); 
    
    if(isSpike) mesh.userData.rotSpeed = Math.random() * 3;
    mesh.userData.active = true;
    
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
    } else if (type === 'win') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(400, listener.context.currentTime);
        osc.frequency.linearRampToValueAtTime(800, listener.context.currentTime + 1.0);
        gain.gain.setValueAtTime(0.3, listener.context.currentTime);
    }
    
    gain.gain.exponentialRampToValueAtTime(0.01, listener.context.currentTime + 0.5);
    osc.connect(gain); gain.connect(listener.destination);
    osc.start(); osc.stop(listener.context.currentTime + 0.5);
}

// === 7. CONTROLES ===
const controllerModelFactory = new XRControllerModelFactory();

function setupController(index) {
    const controller = renderer.xr.getController(index);
    const grip = renderer.xr.getControllerGrip(index);
    grip.add(controllerModelFactory.createControllerModel(grip));
    playerGroup.add(controller, grip);

    controller.addEventListener('selectstart', handleInput);
    controller.addEventListener('squeezestart', resetGame); // Grip para reinicio rápido
    return controller;
}

const controller0 = setupController(0); 
const controller1 = setupController(1); 

function handleInput() {
    if(currentState === STATE.GAMEOVER || currentState === STATE.WIN || currentState === STATE.MENU) {
        resetGame();
    }
}

window.addEventListener('keydown', (e) => {
    if (e.key === 'r' || e.key === 'R') handleInput();
});

function triggerGameOver() {
    if (currentState !== STATE.PLAYING) return;
    
    currentState = STATE.GAMEOVER;
    playSound('crash');
    
    // Instrucciones claras de pérdida
    updateHUD("GAME OVER", "¡CHOCASTE!", "Presiona GATILLO para REINTENTAR");
}

function resetGame() {
    items.forEach(i => scene.remove(i));
    items = [];
    tunnelRings.forEach(r => scene.remove(r));
    tunnelRings = [];
    
    survivalTime = 0;
    currentSpeed = CONFIG.baseSpeed;
    CONFIG.spawnRate = 0.8;
    currentState = STATE.PLAYING;
    
    playerGroup.position.set(0,0,0);
    shakeGroup.position.set(0,0,0);
    myShip.rotation.set(0,0,0);

    updateHUD();
}

// === 8. BUCLE PRINCIPAL ===
const clock = new THREE.Clock();
let spawnTimer = 0;
let ringTimer = 0;
let diffTimer = 0;

renderer.setAnimationLoop(() => {
    const dt = clock.getDelta();
    frameCount++;

    // Fondo siempre moviéndose
    const bgSpeed = (currentState === STATE.PLAYING) ? currentSpeed : 10;
    
    grid.position.z += bgSpeed * dt;
    if(grid.position.z > 20) grid.position.z = 0;

    // Warp Particles
    const positions = warpSystem.geometry.attributes.position.array;
    for(let i=0; i<warpCount; i++) {
        positions[i*3 + 2] += bgSpeed * dt * 2;
        if(positions[i*3 + 2] > 20) positions[i*3 + 2] = -200;
    }
    warpSystem.geometry.attributes.position.needsUpdate = true;

    // Speed Lines (Ases de luz)
    if (currentState === STATE.PLAYING && currentSpeed > 60) {
        speedLines.forEach(line => {
            line.position.z += bgSpeed * dt * 3;
            line.material.opacity = (currentSpeed - 50) * 0.01; // Más visibles si vas rápido
            if(line.position.z > 10) {
                line.position.z = -150 - Math.random()*50;
                line.position.x = (Math.random()-0.5)*50;
                line.position.y = (Math.random()-0.5)*30;
            }
        });
    } else {
        speedLines.forEach(l => l.material.opacity = 0);
    }

    // Anillos
    ringTimer += dt;
    if(ringTimer > (20 / bgSpeed)) {
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

        if(frameCount % 15 === 0) updateHUD();

        // Dificultad incremental suave
        diffTimer += dt;
        if(diffTimer > 15) { // Cada 15 segundos
            currentSpeed += 2; // Aumentar poco a poco
            if(currentSpeed > 120) currentSpeed = 120; // Límite para que sea posible
            
            CONFIG.spawnRate *= 0.98; // Spawn un poco más rápido
            diffTimer = 0;
        }
        
        if(survivalTime >= CONFIG.timeToWin) {
            currentState = STATE.WIN;
            playSound('win');
            updateHUD("¡VICTORIA!", "SOBREVIVISTE 5 MINUTOS", "¡Eres un piloto legendario!");
        }

        // Control
        if (renderer.xr.isPresenting) {
            const rot = controller1.rotation.z; 
            playerGroup.position.x -= rot * CONFIG.lateralSpeed * dt; 
            
            playerGroup.position.x = Math.max(-CONFIG.laneWidth, Math.min(CONFIG.laneWidth, playerGroup.position.x));
            
            myShip.rotation.z = -rot * 0.5;
            myShip.rotation.y = -rot * 0.2;
        }

        // Spawn
        spawnTimer += dt;
        if(spawnTimer > CONFIG.spawnRate) {
            spawnItem();
            spawnTimer = 0;
        }

        // Obstáculos y Colisiones
        for (let i = items.length - 1; i >= 0; i--) {
            const item = items[i];
            item.position.z += currentSpeed * dt;
            if(item.userData.rotSpeed) item.rotation.y += item.userData.rotSpeed * dt;

            // Hitbox
            const distZ = Math.abs(item.position.z - playerGroup.position.z);
            const distX = Math.abs(item.position.x - playerGroup.position.x);

            // Colisión precisa
            if (item.userData.active && distZ < 2.0 && distX < 1.8) {
                triggerGameOver();
            }

            if (item.position.z > 10) {
                scene.remove(item);
                items.splice(i, 1);
            }
        }
        
        // Temblor
        shakeGroup.position.x = (Math.random() - 0.5) * (currentSpeed * 0.0005);
        shakeGroup.position.y = (Math.random() - 0.5) * (currentSpeed * 0.0005);

    } else {
        // Animación pasiva
        myShip.rotation.z = Math.sin(clock.getElapsedTime()) * 0.1;
        shakeGroup.position.set(0,0,0);
        
        // Limpieza visual suave
        for (let i = items.length - 1; i >= 0; i--) {
            const item = items[i];
            item.position.z += 10 * dt;
             if (item.position.z > 10) {
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
