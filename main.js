import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

/** ================= CONFIGURACIÓN ================= */
const CONFIG = {
    speed: 25,          // Velocidad de avance
    worldDepth: 150,    // Distancia de aparición
    asteroidSpeed: 15,
    bounds: { x: 12, y: 8 }
};

// Variables de Estado
let score = 0;
let health = 100;
let isGameOver = false;

// Arrays de Objetos (Gestión de Memoria)
let asteroids = [];
let lasers = [];
let particles = [];

/** ================= INICIO DE ESCENA ================= */
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(window.devicePixelRatio); // Importante para nitidez en Quest
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
// Optimización: Desactivar ordenamiento si no hay transparencias complejas
renderer.sortObjects = false; 
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020205);
scene.fog = new THREE.Fog(0x020205, 50, 200); // Niebla eficiente

const camera = new THREE.PerspectiveCamera(70, window.innerWidth/window.innerHeight, 0.1, 500);
const shipGroup = new THREE.Group();
shipGroup.position.set(0, 1.6, 0);
shipGroup.add(camera);
scene.add(shipGroup);

// Audio
const listener = new THREE.AudioListener();
camera.add(listener);
const bgMusic = document.getElementById('bg-music');

// Al entrar en VR en Quest
renderer.xr.addEventListener('sessionstart', () => {
    if(bgMusic) { bgMusic.volume = 0.4; bgMusic.play().catch(console.warn); }
    resetGame();
});

/** ================= UI / HUD (OPTIMIZADO PARA QUEST) ================= */
// Usamos CanvasTexture porque es MUCHO más rápido que TextGeometry
const hudCanvas = document.createElement('canvas');
hudCanvas.width = 512; hudCanvas.height = 256;
const hudCtx = hudCanvas.getContext('2d');
const hudTexture = new THREE.CanvasTexture(hudCanvas);

function drawHUD() {
    // Fondo semi-transparente
    hudCtx.clearRect(0, 0, 512, 256);
    hudCtx.fillStyle = 'rgba(10, 20, 40, 0.8)';
    hudCtx.fillRect(0, 0, 512, 256);
    
    // Marco
    hudCtx.strokeStyle = isGameOver ? '#ff0000' : '#00d2ff';
    hudCtx.lineWidth = 8;
    hudCtx.strokeRect(4, 4, 504, 248);

    // Texto
    hudCtx.textAlign = 'center';
    hudCtx.font = 'bold 50px Courier New';
    
    if (isGameOver) {
        hudCtx.fillStyle = '#ff3333';
        hudCtx.fillText("MISION FALLIDA", 256, 80);
        hudCtx.font = '30px Arial';
        hudCtx.fillStyle = '#ffffff';
        hudCtx.fillText("Gatillo para Reiniciar", 256, 140);
        hudCtx.fillText(`Puntaje Final: ${score}`, 256, 190);
    } else {
        hudCtx.fillStyle = '#00d2ff';
        hudCtx.fillText(`PUNTOS: ${score}`, 256, 70);
        
        // Barra de Vida
        hudCtx.fillStyle = health > 30 ? '#00ff00' : '#ff0000';
        hudCtx.font = '30px Arial';
        hudCtx.fillText(`ENERGIA: ${health}%`, 256, 140);
        hudCtx.fillRect(106, 160, 3 * health, 30);
    }
    hudTexture.needsUpdate = true;
}

/** ================= CONSTRUCCIÓN VISUAL ================= */

// 1. Cabina
function buildCockpit() {
    const cockpit = new THREE.Group();
    
    // Casco (Gris oscuro)
    const hullMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6 });
    const hull = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.2, 2), hullMat);
    hull.position.set(0, -0.6, 0.2);
    cockpit.add(hull);

    // Tablero
    const dash = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 0.8), hullMat);
    dash.position.set(0, -0.5, -0.8);
    cockpit.add(dash);

    // Pantalla HUD
    const screenGeo = new THREE.PlaneGeometry(1.0, 0.5);
    const screenMat = new THREE.MeshBasicMaterial({ map: hudTexture, transparent: true });
    const screen = new THREE.Mesh(screenGeo, screenMat);
    screen.position.set(0, -0.3, -0.79); // Pegado al tablero
    screen.rotation.x = -0.3; // Inclinado hacia arriba para verlo mejor
    cockpit.add(screen);

    return cockpit;
}
shipGroup.add(buildCockpit());

// 2. Fondo de Estrellas (BufferGeometry = Alto Rendimiento)
const starsGeo = new THREE.BufferGeometry();
const starsPos = new Float32Array(2000 * 3);
for(let i=0; i<2000*3; i++) starsPos[i] = (Math.random()-0.5)*500;
starsGeo.setAttribute('position', new THREE.BufferAttribute(starsPos, 3));
const stars = new THREE.Points(starsGeo, new THREE.PointsMaterial({color: 0xffffff, size: 0.8}));
scene.add(stars);

// 3. Luces
const sun = new THREE.DirectionalLight(0xffffff, 2.0);
sun.position.set(-20, 50, 20);
scene.add(sun);
scene.add(new THREE.AmbientLight(0x404050, 0.5));

// Geometrías y Materiales Compartidos (Evita basura en memoria)
const asteroidGeo = new THREE.DodecahedronGeometry(1.5, 0); 
const asteroidMat = new THREE.MeshStandardMaterial({ color: 0x885544, flatShading: true });
const laserGeo = new THREE.BoxGeometry(0.1, 0.1, 2);
const laserMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });

/** ================= LÓGICA DE JUEGO ================= */

function spawnAsteroid() {
    if(isGameOver) return;
    const mesh = new THREE.Mesh(asteroidGeo, asteroidMat);
    mesh.position.set(
        (Math.random()-0.5) * 40,
        (Math.random()-0.5) * 20,
        -CONFIG.worldDepth
    );
    mesh.userData = { 
        speed: CONFIG.asteroidSpeed + Math.random() * 10,
        rot: { x: Math.random()*0.05, y: Math.random()*0.05 }
    };
    scene.add(mesh);
    asteroids.push(mesh);
}

function spawnExplosion(pos) {
    // Sistema de partículas simple
    const count = 12; // Pocas partículas para Quest
    const geo = new THREE.BufferGeometry();
    const posArr = new Float32Array(count*3);
    const velArr = [];
    
    for(let i=0; i<count; i++) {
        posArr[i*3] = pos.x; posArr[i*3+1] = pos.y; posArr[i*3+2] = pos.z;
        velArr.push({
            x: (Math.random()-0.5)*12,
            y: (Math.random()-0.5)*12,
            z: (Math.random()-0.5)*12
        });
    }
    geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({color: 0xffaa00, size: 0.6, transparent: true}));
    pts.userData = { life: 1.0, vels: velArr };
    scene.add(pts);
    particles.push(pts);
}

function playSound(freq, type) {
    if(listener.context.state === 'suspended') listener.context.resume();
    const osc = listener.context.createOscillator();
    const gain = listener.context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, listener.context.currentTime);
    osc.frequency.exponentialRampToValueAtTime(10, listener.context.currentTime + 0.15);
    gain.gain.setValueAtTime(0.2, listener.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, listener.context.currentTime + 0.15);
    osc.connect(gain); gain.connect(listener.destination);
    osc.start(); osc.stop(listener.context.currentTime + 0.2);
}

function resetGame() {
    // Limpieza Total
    asteroids.forEach(a => scene.remove(a));
    lasers.forEach(l => scene.remove(l));
    particles.forEach(p => scene.remove(p));
    asteroids = [];
    lasers = [];
    particles = [];
    
    score = 0;
    health = 100;
    isGameOver = false;
    drawHUD();
}

/** ================= CONTROLES VR ================= */
const controller2 = renderer.xr.getController(1); // Mano derecha
const factory = new XRControllerModelFactory();
const grip2 = renderer.xr.getControllerGrip(1);
grip2.add(factory.createControllerModel(grip2));
shipGroup.add(controller2, grip2);

controller2.addEventListener('selectstart', () => {
    if(isGameOver) {
        resetGame();
        return;
    }
    // Disparar
    const laser = new THREE.Mesh(laserGeo, laserMat);
    const p = new THREE.Vector3(); const q = new THREE.Quaternion();
    controller2.getWorldPosition(p); controller2.getWorldQuaternion(q);
    laser.position.copy(p); laser.quaternion.copy(q);
    laser.translateZ(-0.5); // Que salga de la punta
    scene.add(laser);
    lasers.push(laser);
    playSound(880, 'square');
});

/** ================= BUCLE PRINCIPAL ================= */
const clock = new THREE.Clock();
drawHUD(); // Dibujo inicial

renderer.setAnimationLoop(() => {
    const dt = clock.getDelta();

    // 1. Manejo de inputs (Mano Derecha mueve nave)
    if(renderer.xr.isPresenting && !isGameOver) {
        const rot = controller2.rotation;
        // Movemos la nave basándonos en la inclinación de la muñeca
        shipGroup.position.x -= rot.z * 20 * dt;
        shipGroup.position.y += rot.x * 20 * dt;
        
        // Límites
        shipGroup.position.x = THREE.MathUtils.clamp(shipGroup.position.x, -CONFIG.bounds.x, CONFIG.bounds.x);
        shipGroup.position.y = THREE.MathUtils.clamp(shipGroup.position.y, 0, CONFIG.bounds.y);
        
        // Efecto visual de giro
        shipGroup.rotation.z = THREE.MathUtils.lerp(shipGroup.rotation.z, -rot.z*0.5, 0.1);

        // Spawn Aleatorio
        if(Math.random() < 0.03) spawnAsteroid();
    }

    // Si es Game Over, solo renderizamos partículas, no actualizamos lógica de juego
    if(isGameOver) {
        updateParticles(dt);
        renderer.render(scene, camera);
        return;
    }

    // 2. Mover Asteroides y Colisión con Jugador
    // Usamos bucle invertido para poder borrar sin romper el array
    for (let i = asteroids.length - 1; i >= 0; i--) {
        const a = asteroids[i];
        a.position.z += a.userData.speed * dt;
        a.rotation.x += a.userData.rot.x;

        // Choque Nave
        if(a.position.distanceTo(shipGroup.position) < 2.5) {
            spawnExplosion(shipGroup.position);
            scene.remove(a);
            asteroids.splice(i, 1);
            health -= 20;
            playSound(150, 'sawtooth');
            drawHUD();
            if(health <= 0) {
                isGameOver = true;
                drawHUD();
            }
            continue;
        }

        // Se fue del mapa
        if(a.position.z > 20) {
            scene.remove(a);
            asteroids.splice(i, 1);
        }
    }

    // 3. Mover Láseres y Colisión con Asteroides
    for (let i = lasers.length - 1; i >= 0; i--) {
        const l = lasers[i];
        l.translateZ(-60 * dt); // Velocidad láser

        let hit = false;
        // Verificar contra todos los asteroides
        for(let j = asteroids.length - 1; j >= 0; j--) {
            const a = asteroids[j];
            if(l.position.distanceTo(a.position) < 2.0) {
                // IMPACTO
                spawnExplosion(a.position);
                scene.remove(a);
                asteroids.splice(j, 1);
                hit = true;
                score += 100;
                playSound(300, 'square');
                break; // Romper loop de asteroides
            }
        }

        // Borrar láser si chocó o si se fue lejos
        if(hit || l.position.distanceTo(shipGroup.position) > 150) {
            scene.remove(l);
            lasers.splice(i, 1);
            if(hit) drawHUD();
        }
    }

    updateParticles(dt);
    renderer.render(scene, camera);
});

function updateParticles(dt) {
    for(let i=particles.length-1; i>=0; i--) {
        const p = particles[i];
        p.userData.life -= dt * 2;
        const attr = p.geometry.attributes.position;
        const vels = p.userData.vels;
        
        for(let k=0; k<vels.length; k++) {
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
            p.geometry.dispose(); // ¡IMPORTANTE PARA QUEST!
            p.material.dispose();
            particles.splice(i, 1);
        }
    }
}

// Ajuste ventana
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth/window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
