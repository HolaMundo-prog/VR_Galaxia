import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

// === CONFIGURACIÓN ===
let score = 0;
let targets = [];
let particles = [];

// === 1. ESCENA BÁSICA ===
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050510);
scene.fog = new THREE.FogExp2(0x050510, 0.02);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 100);
const userGroup = new THREE.Group();
userGroup.position.set(0, 1.6, 0);
userGroup.add(camera);
scene.add(userGroup);

// Audio
const listener = new THREE.AudioListener();
camera.add(listener);
const bgMusic = document.getElementById('bg-music');
renderer.xr.addEventListener('sessionstart', () => {
    if(bgMusic) { bgMusic.volume = 0.3; bgMusic.play().catch(console.warn); }
});

// Luz y Suelo
scene.add(new THREE.GridHelper(100, 40, 0x00aaff, 0x111122));
scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.5));

// === 2. HUD (Marcador) ===
const hudCanvas = document.createElement('canvas');
hudCanvas.width = 512; hudCanvas.height = 128;
const hudCtx = hudCanvas.getContext('2d');
const hudTexture = new THREE.CanvasTexture(hudCanvas);

function updateHUD() {
    hudCtx.fillStyle = '#111'; hudCtx.fillRect(0,0,512,128);
    hudCtx.strokeStyle = '#00ffcc'; hudCtx.lineWidth=5; hudCtx.strokeRect(2,2,508,124);
    hudCtx.fillStyle = '#fff'; hudCtx.font='bold 60px Arial'; hudCtx.textAlign='center';
    hudCtx.fillText(`PUNTOS: ${score}`, 256, 90);
    hudTexture.needsUpdate = true;
}
updateHUD();

const hudMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 0.37),
    new THREE.MeshBasicMaterial({ map: hudTexture, transparent: true })
);
hudMesh.position.set(0, 1.4, -2.5);
scene.add(hudMesh);

// === 3. ENEMIGOS ===
const enemyGeo = new THREE.IcosahedronGeometry(0.5, 0); 
const enemyMat = new THREE.MeshStandardMaterial({ 
    color: 0xff0055, roughness: 0.2, metalness: 0.5, emissive: 0x220011 
});

function spawnTarget() {
    const mesh = new THREE.Mesh(enemyGeo, enemyMat.clone());
    // Posición aleatoria
    const angle = (Math.random()-0.5) * Math.PI; 
    const dist = 3 + Math.random() * 5;
    mesh.position.set(Math.sin(angle)*dist, 1+Math.random()*2, -Math.cos(angle)*dist);
    
    mesh.userData = { 
        id: Math.random(),
        speedY: (Math.random()-0.5)*0.01,
        rot: Math.random()*0.05
    };
    scene.add(mesh);
    targets.push(mesh);
}

// === 4. EFECTOS (Explosión y Sonido) ===
function spawnExplosion(pos) {
    const geo = new THREE.BufferGeometry();
    const posArr = new Float32Array(30); // 10 partículas x 3 coords
    for(let i=0; i<30; i++) posArr[i] = (Math.random()-0.5);
    geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    const mat = new THREE.PointsMaterial({ color: 0xffaa00, size: 0.2, transparent: true });
    const pts = new THREE.Points(geo, mat);
    pts.position.copy(pos);
    pts.userData = { life: 1.0 };
    scene.add(pts);
    particles.push(pts);
}

function playSound() {
    if(listener.context.state === 'suspended') listener.context.resume();
    const osc = listener.context.createOscillator();
    const gain = listener.context.createGain();
    osc.frequency.setValueAtTime(600, listener.context.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, listener.context.currentTime + 0.1);
    gain.gain.setValueAtTime(0.1, listener.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, listener.context.currentTime + 0.1);
    osc.connect(gain); gain.connect(listener.destination);
    osc.start(); osc.stop(listener.context.currentTime + 0.15);
}

// === 5. CONTROLES Y DISPARO (Lógica Robusta) ===
const controllerModelFactory = new XRControllerModelFactory();
const raycaster = new THREE.Raycaster();
const tempMatrix = new THREE.Matrix4();

function setupController(index) {
    const controller = renderer.xr.getController(index);
    
    // Modelo Visual
    const grip = renderer.xr.getControllerGrip(index);
    grip.add(controllerModelFactory.createControllerModel(grip));
    userGroup.add(grip);
    
    // Línea Láser
    const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), new THREE.Vector3(0,0,-50)]),
        new THREE.LineBasicMaterial({ color: 0xff0000 })
    );
    controller.add(line);
    userGroup.add(controller);

    // --- EL EVENTO IMPORTANTE: DISPARO ---
    controller.addEventListener('selectstart', () => {
        playSound();
        
        // 1. Efecto visual de disparo (retroceso)
        line.scale.z = 0.1; 
        setTimeout(()=> line.scale.z = 1, 100);

        // 2. CÁLCULO DIRECTO DE RAYCASTING (Aquí está la solución)
        // Configuramos el rayo para que salga EXACTAMENTE desde la posición actual del control
        tempMatrix.identity().extractRotation(controller.matrixWorld);
        raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
        raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

        // 3. Buscar intersecciones
        const intersects = raycaster.intersectObjects(targets);

        if (intersects.length > 0) {
            // ¡IMPACTO CONFIRMADO!
            const hitObject = intersects[0].object;
            
            // Destruir visualmente
            spawnExplosion(hitObject.position);
            
            // Eliminar de Three.js
            scene.remove(hitObject);
            // Eliminar de nuestro array
            targets = targets.filter(t => t !== hitObject);
            
            // Limpiar memoria
            hitObject.geometry.dispose();
            hitObject.material.dispose();
            
            score += 100;
            updateHUD();
        }
    });

    return controller;
}

setupController(0); // Izquierda
setupController(1); // Derecha

// === 6. BUCLE PRINCIPAL ===
const clock = new THREE.Clock();
let timer = 0;

renderer.setAnimationLoop(() => {
    const dt = clock.getDelta();
    timer += dt;

    // Spawner
    if(timer > 1.0) {
        if(targets.length < 8) spawnTarget();
        timer = 0;
    }

    // Animar Enemigos
    targets.forEach(t => {
        t.rotation.x += t.userData.rot;
        t.rotation.y += t.userData.rot;
        t.position.y += Math.sin(clock.getElapsedTime() + t.userData.id) * 0.01;
    });

    // Animar Partículas
    for(let i=particles.length-1; i>=0; i--) {
        const p = particles[i];
        p.userData.life -= dt * 2;
        p.material.opacity = p.userData.life;
        const pos = p.geometry.attributes.position.array;
        for(let j=0; j<pos.length; j+=3) {
            pos[j] += (Math.random()-0.5)*0.1; // Expansión
            pos[j+1] += (Math.random()-0.5)*0.1;
            pos[j+2] += (Math.random()-0.5)*0.1;
        }
        p.geometry.attributes.position.needsUpdate = true;

        if(p.userData.life <= 0) {
            scene.remove(p);
            particles.splice(i, 1);
        }
    }

    renderer.render(scene, camera);
});

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth/window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
