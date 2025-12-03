import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

// === CONFIGURACIÓN ===
let score = 0;
let targets = [];
let particles = [];

// Colores
const COLOR_LASER_IDLE = 0xff0000; // Rojo (Sin objetivo)
const COLOR_LASER_HIT = 0x00ff00;  // Verde (Objetivo fijado)
const COLOR_ENEMY = 0xff0055;

// === 1. ESCENA ===
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

// === 2. AMBIENTE ===
// Suelo
const gridHelper = new THREE.GridHelper(200, 100, 0x00aaff, 0x111122);
scene.add(gridHelper);
// Luces
scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.0));
const dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
dirLight.position.set(0, 10, 5);
scene.add(dirLight);

// === 3. HUD ===
const hudCanvas = document.createElement('canvas');
hudCanvas.width = 512; hudCanvas.height = 128;
const hudCtx = hudCanvas.getContext('2d');
const hudTexture = new THREE.CanvasTexture(hudCanvas);

function updateHUD() {
    hudCtx.clearRect(0,0,512,128);
    hudCtx.fillStyle = 'rgba(0, 20, 40, 0.8)';
    hudCtx.fillRect(0,0,512,128);
    hudCtx.strokeStyle = '#00d2ff';
    hudCtx.lineWidth = 4;
    hudCtx.strokeRect(2,2,508,124);
    
    hudCtx.fillStyle = '#ffffff';
    hudCtx.textAlign = 'center';
    hudCtx.font = 'bold 60px Courier New';
    hudCtx.fillText(`SCORE: ${score}`, 256, 85);
    hudTexture.needsUpdate = true;
}
updateHUD();

const hudMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 0.37),
    new THREE.MeshBasicMaterial({ map: hudTexture, transparent: true })
);
hudMesh.position.set(0, 1.3, -2.5);
hudMesh.rotation.x = -0.2;
scene.add(hudMesh);

// === 4. SISTEMA DE ENEMIGOS ===
const enemyGeo = new THREE.IcosahedronGeometry(0.4, 0); 
const enemyMat = new THREE.MeshStandardMaterial({ 
    color: COLOR_ENEMY, roughness: 0.4, metalness: 0.8, emissive: 0x440022, emissiveIntensity: 0.5 
});

function spawnTarget() {
    const mesh = new THREE.Mesh(enemyGeo, enemyMat.clone());
    const angle = (Math.random() * Math.PI) - (Math.PI / 2);
    const dist = 4 + Math.random() * 6;
    
    mesh.position.set(Math.sin(angle) * dist, 1 + Math.random() * 2.5, -Math.cos(angle) * dist);
    
    mesh.userData = { 
        rotSpeed: { x: Math.random()*0.05, y: Math.random()*0.05 },
        floatSpeed: 0.005 + Math.random() * 0.01,
        floatOffset: Math.random() * Math.PI * 2
    };
    scene.add(mesh);
    targets.push(mesh);
}

function spawnExplosion(pos) {
    const count = 15;
    const geo = new THREE.BufferGeometry();
    const posArr = new Float32Array(count*3);
    const velArr = [];
    for(let i=0; i<count; i++) {
        posArr[i*3] = pos.x; posArr[i*3+1] = pos.y; posArr[i*3+2] = pos.z;
        velArr.push({x:(Math.random()-0.5)*0.2, y:(Math.random()-0.5)*0.2, z:(Math.random()-0.5)*0.2});
    }
    geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffaa00, size: 0.15, transparent: true }));
    pts.userData = { life: 1.0, vels: velArr };
    scene.add(pts);
    particles.push(pts);
}

function playSound() {
    if(listener.context.state === 'suspended') listener.context.resume();
    const osc = listener.context.createOscillator();
    const gain = listener.context.createGain();
    osc.frequency.setValueAtTime(800 + Math.random()*200, listener.context.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, listener.context.currentTime + 0.1);
    gain.gain.setValueAtTime(0.2, listener.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, listener.context.currentTime + 0.1);
    osc.connect(gain); gain.connect(listener.destination);
    osc.start(); osc.stop(listener.context.currentTime + 0.15);
}

// === 5. SISTEMA DE CONTROLES (DUAL WIELD) ===
// Creamos una fábrica para generar los mandos 0 y 1
const controllerModelFactory = new XRControllerModelFactory();

// Función para configurar un mando (Izquierda o Derecha)
function setupController(index) {
    const controller = renderer.xr.getController(index);
    
    // Modelo visual (Grip)
    const grip = renderer.xr.getControllerGrip(index);
    grip.add(controllerModelFactory.createControllerModel(grip));
    userGroup.add(grip);
    
    // Línea Láser
    const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), new THREE.Vector3(0,0,-100)]);
    const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: COLOR_LASER_IDLE }));
    controller.add(line);
    
    // Almacenar datos útiles en el controlador
    controller.userData = {
        isSelecting: false,
        line: line,
        intersected: null // Aquí guardaremos qué estamos apuntando
    };

    // Eventos de disparo
    controller.addEventListener('selectstart', () => {
        controller.userData.isSelecting = true;
        playSound();
        
        // Retroceso visual
        line.scale.z = 0.5; 
        setTimeout(() => { line.scale.z = 1; }, 100);

        // LÓGICA DE DESTRUCCIÓN:
        // Si ya estamos apuntando a algo (calculado en el loop), lo destruimos.
        if (controller.userData.intersected) {
            const obj = controller.userData.intersected;
            spawnExplosion(obj.position);
            
            scene.remove(obj);
            // Limpiar memoria
            obj.geometry.dispose();
            obj.material.dispose();
            
            targets = targets.filter(t => t !== obj);
            score += 100;
            updateHUD();
            
            // Limpiar referencia
            controller.userData.intersected = null;
        }
    });

    userGroup.add(controller);
    return controller;
}

const controllers = [
    setupController(0), // Izquierda
    setupController(1)  // Derecha
];

// Raycaster global
const raycaster = new THREE.Raycaster();
const tempMatrix = new THREE.Matrix4();

// === 6. BUCLE PRINCIPAL ===
const clock = new THREE.Clock();
let timer = 0;

renderer.setAnimationLoop(() => {
    const dt = clock.getDelta();
    timer += dt;

    // 1. Spawner
    if(timer > 1.2) {
        if(targets.length < 8) spawnTarget();
        timer = 0;
    }

    // 2. Lógica de Apuntado (Para AMBOS controles)
    controllers.forEach(ctrl => {
        // Reiniciar estado
        ctrl.userData.intersected = null;
        ctrl.userData.line.material.color.setHex(COLOR_LASER_IDLE);
        ctrl.userData.line.scale.z = 1;

        // Configurar Rayo
        tempMatrix.identity().extractRotation(ctrl.matrixWorld);
        raycaster.ray.origin.setFromMatrixPosition(ctrl.matrixWorld);
        raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

        // Detectar colisión
        const intersects = raycaster.intersectObjects(targets);
        
        if (intersects.length > 0) {
            // ¡Tenemos un blanco!
            const hit = intersects[0].object;
            ctrl.userData.intersected = hit;
            
            // Feedback Visual: Láser Verde y corto hasta el objetivo
            ctrl.userData.line.material.color.setHex(COLOR_LASER_HIT);
            ctrl.userData.line.scale.z = intersects[0].distance / 100; // Cortar láser
            
            // Resaltar Enemigo
            hit.material.emissive.setHex(0xffffff); // Brillo blanco intenso
            hit.userData.isHovered = true;
        }
    });

    // 3. Animar Enemigos
    const time = clock.getElapsedTime();
    targets.forEach(t => {
        t.rotation.x += t.userData.rotSpeed.x;
        t.rotation.y += t.userData.rotSpeed.y;
        t.position.y += Math.sin(time + t.userData.floatOffset) * t.userData.floatSpeed;
        
        // Resetear color si nadie lo apunta
        if(!t.userData.isHovered) {
            t.material.emissive.setHex(0x440022);
        }
        t.userData.isHovered = false; // Reset para el siguiente frame
    });

    // 4. Partículas
    for(let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.userData.life -= dt * 2;
        const attr = p.geometry.attributes.position;
        const vels = p.userData.vels;
        for(let k=0; k<vels.length; k++) {
            attr.setXYZ(k, attr.getX(k)+vels[k].x, attr.getY(k)+vels[k].y, attr.getZ(k)+vels[k].z);
        }
        attr.needsUpdate = true;
        p.material.opacity = p.userData.life;
        if(p.userData.life <= 0) {
            scene.remove(p);
            p.geometry.dispose(); p.material.dispose();
            particles.splice(i, 1);
        }
    }

    renderer.render(scene, camera);
});

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
