import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

// === CONFIGURACIÓN ===
let score = 0;
let targets = [];     // Lista de objetivos
let particles = [];   // Lista de explosiones
let lastShotTime = 0;

// === 1. ESCENA ===
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a0a); // Fondo oscuro
scene.fog = new THREE.Fog(0x0a0a0a, 10, 50);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 100);
const userGroup = new THREE.Group();
userGroup.position.set(0, 1.6, 0); // Altura de ojos
userGroup.add(camera);
scene.add(userGroup);

// === 2. AUDIO (Tu archivo) ===
const listener = new THREE.AudioListener();
camera.add(listener);
const bgMusic = document.getElementById('bg-music');

// Iniciar audio al entrar a VR
renderer.xr.addEventListener('sessionstart', () => {
    if(bgMusic) {
        bgMusic.volume = 0.4;
        bgMusic.play().catch(console.warn);
    }
});

// === 3. ENTORNO SIMPLE ===
// Suelo tipo Grid (Tron style)
const grid = new THREE.GridHelper(100, 40, 0x00ffcc, 0x222222);
scene.add(grid);

// Luz
const light = new THREE.DirectionalLight(0xffffff, 2);
light.position.set(0, 10, 0);
scene.add(light);
scene.add(new THREE.AmbientLight(0xffffff, 0.5));

// === 4. HUD (Marcador de puntos) ===
const hudCanvas = document.createElement('canvas');
hudCanvas.width = 512; hudCanvas.height = 256;
const hudCtx = hudCanvas.getContext('2d');
const hudTexture = new THREE.CanvasTexture(hudCanvas);

function updateHUD() {
    hudCtx.fillStyle = '#111';
    hudCtx.fillRect(0,0,512,256);
    
    hudCtx.strokeStyle = '#00ffcc';
    hudCtx.lineWidth = 10;
    hudCtx.strokeRect(5,5,502,246);
    
    hudCtx.fillStyle = '#00ffcc';
    hudCtx.textAlign = 'center';
    hudCtx.font = 'bold 80px Arial';
    hudCtx.fillText(`PUNTOS: ${score}`, 256, 150);
    
    hudTexture.needsUpdate = true;
}
updateHUD();

// Pantalla flotante frente a ti
const hudMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 0.75),
    new THREE.MeshBasicMaterial({ map: hudTexture, transparent: true, opacity: 0.9 })
);
hudMesh.position.set(0, 1.5, -3); // 3 metros al frente, un poco arriba
scene.add(hudMesh);

// === 5. FUNCIONES DE JUEGO ===

// Crear un objetivo (Cubo rojo flotante)
const targetGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
const targetMat = new THREE.MeshStandardMaterial({ color: 0xff0055, roughness: 0.2 });

function spawnTarget() {
    const mesh = new THREE.Mesh(targetGeo, targetMat);
    
    // Posición aleatoria frente al jugador (semicírculo)
    const angle = (Math.random() - 0.5) * Math.PI; // -90 a 90 grados
    const radius = 3 + Math.random() * 5;          // Entre 3 y 8 metros de distancia
    
    mesh.position.x = Math.sin(angle) * radius;
    mesh.position.z = -Math.cos(angle) * radius;
    mesh.position.y = 1 + Math.random() * 2;       // Altura variable
    
    // Animación simple (Guardamos datos en userData)
    mesh.userData = { 
        speedY: (Math.random() - 0.5) * 0.02,
        rotSpeed: Math.random() * 0.05
    };
    
    scene.add(mesh);
    targets.push(mesh);
}

// Crear explosión (Partículas)
function spawnExplosion(pos) {
    const pCount = 8;
    const geo = new THREE.BufferGeometry();
    const posArr = new Float32Array(pCount*3);
    const velArr = [];
    
    for(let i=0; i<pCount; i++) {
        posArr[i*3] = pos.x; posArr[i*3+1] = pos.y; posArr[i*3+2] = pos.z;
        velArr.push({
            x: (Math.random()-0.5)*0.1,
            y: (Math.random()-0.5)*0.1,
            z: (Math.random()-0.5)*0.1
        });
    }
    geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    const mat = new THREE.PointsMaterial({ color: 0xffaa00, size: 0.1 });
    const sys = new THREE.Points(geo, mat);
    sys.userData = { life: 60 }; // Dura 60 frames
    scene.add(sys);
    particles.push(sys);
}

// Sonido sintético (Pew Pew)
function playPew() {
    if(listener.context.state === 'suspended') listener.context.resume();
    const osc = listener.context.createOscillator();
    const gain = listener.context.createGain();
    osc.frequency.setValueAtTime(800, listener.context.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, listener.context.currentTime + 0.1);
    gain.gain.setValueAtTime(0.1, listener.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, listener.context.currentTime + 0.1);
    osc.connect(gain); gain.connect(listener.destination);
    osc.start(); osc.stop(listener.context.currentTime + 0.15);
}

// === 6. CONTROLES Y RAYCASTER ===
const controller = renderer.xr.getController(1); // Mano Derecha
const controllerModelFactory = new XRControllerModelFactory();
const controllerGrip = renderer.xr.getControllerGrip(1);
controllerGrip.add(controllerModelFactory.createControllerModel(controllerGrip));
userGroup.add(controller, controllerGrip);

// Línea roja (Láser visual para apuntar)
const laserGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), new THREE.Vector3(0,0,-100)]);
const laserLine = new THREE.Line(laserGeo, new THREE.LineBasicMaterial({ color: 0xff0000 }));
laserLine.scale.z = 1;
controller.add(laserLine);

// Raycaster para detectar disparos
const raycaster = new THREE.Raycaster();
const tempMatrix = new THREE.Matrix4();

controller.addEventListener('selectstart', () => {
    playPew();
    
    // Configurar rayo desde el control
    tempMatrix.identity().extractRotation(controller.matrixWorld);
    raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

    // Checar intersecciones
    const intersects = raycaster.intersectObjects(targets);
    
    if (intersects.length > 0) {
        // ¡IMPACTO!
        const hitObject = intersects[0].object;
        spawnExplosion(hitObject.position);
        
        // Eliminar objetivo
        scene.remove(hitObject);
        targets = targets.filter(t => t !== hitObject);
        
        // Puntos
        score += 100;
        updateHUD();
    }
});

// === 7. BUCLE PRINCIPAL ===
let timer = 0;

renderer.setAnimationLoop(() => {
    // Generar enemigos cada cierto tiempo
    timer++;
    if(timer > 60) { // Aprox cada segundo (60 frames)
        if(targets.length < 10) spawnTarget(); // Máximo 10 a la vez
        timer = 0;
    }
    
    // Animar Objetivos (Flotar)
    targets.forEach(t => {
        t.rotation.x += t.userData.rotSpeed;
        t.rotation.y += t.userData.rotSpeed;
        t.position.y += t.userData.speedY;
        // Rebotar si sube o baja mucho
        if(t.position.y > 4 || t.position.y < 0.5) t.userData.speedY *= -1;
    });

    // Animar Partículas
    for(let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.userData.life--;
        
        // Mover partículas hacia afuera
        const pos = p.geometry.attributes.position.array;
        const vels = p.userData.vels; 
        // Nota: Por simplicidad en este ejemplo ultra-ligero, 
        // no actualizamos posiciones individuales en el loop para máximo rendimiento,
        // solo reducimos opacidad.
        
        p.material.opacity = p.userData.life / 60;
        
        if(p.userData.life <= 0) {
            scene.remove(p);
            particles.splice(i, 1);
        }
    }

    renderer.render(scene, camera);
});

// Ajuste de ventana
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}); 
