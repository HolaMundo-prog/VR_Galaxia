import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

/** ========= CONFIGURACIÓN ========= */
const SHIP_SPEED_Z = 40;
const PLAYER_LIMIT_X = 15;
const PLAYER_LIMIT_Y_MAX = 10;
const PLAYER_LIMIT_Y_MIN = 1;
const ASTEROID_COUNT = 30;

const bgMusic = document.getElementById('bg-music');

/** ========= SCENE SETUP ========= */
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x000000, 20, 150);

/** ========= BOTÓN VR (OBLIGATORIO POR NAVEGADOR) ========= */
// Este botón es necesario para que el navegador de permiso a las gafas
const vrBtn = VRButton.createButton(renderer);
document.body.appendChild(vrBtn);

// Al dar clic para entrar en VR, iniciamos el audio
vrBtn.addEventListener('click', () => {
    if(bgMusic) {
        bgMusic.volume = 0.5;
        bgMusic.play().catch(e => console.log(e));
    }
});

/** ========= CÁMARA Y NAVE ========= */
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 500);
const shipGroup = new THREE.Group();
shipGroup.position.set(0, 3, 0);
shipGroup.add(camera);
scene.add(shipGroup);

// Audio Listener para efectos 3D
const listener = new THREE.AudioListener();
camera.add(listener);

/** ========= ENTORNO ========= */
// 1. CIELO (HDRI)
new RGBELoader().load('https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/starmap_g4k_1k.hdr', (texture) => {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    scene.background = texture;
    scene.environment = texture;
});

// 2. SUELO (Luna)
const texLoader = new THREE.TextureLoader();
const moonTex = texLoader.load('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/terrain/grasslight-big.jpg'); 
moonTex.wrapS = THREE.RepeatWrapping;
moonTex.wrapT = THREE.RepeatWrapping;
moonTex.repeat.set(20, 20);

const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    new THREE.MeshStandardMaterial({ map: moonTex, color: 0x555555, roughness: 0.9, metalness: 0.1 })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// 3. LUCES
const sunLight = new THREE.DirectionalLight(0xffffff, 1.5);
sunLight.position.set(-50, 100, 50);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.far = 500;
sunLight.shadow.camera.left = -100;
sunLight.shadow.camera.right = 100;
sunLight.shadow.camera.top = 100;
sunLight.shadow.camera.bottom = -100;
scene.add(sunLight);
scene.add(new THREE.AmbientLight(0x404060, 0.3));

/** ========= OBJETOS ========= */
// Cabina
function buildCockpit() {
    const cockpit = new THREE.Group();
    // Cristal
    const glass = new THREE.Mesh(
        new THREE.SphereGeometry(1.5, 32, 32, 0, Math.PI*2, 0, Math.PI*0.3),
        new THREE.MeshPhysicalMaterial({ color: 0x00aaff, transmission: 0.9, opacity: 0.2, transparent: true })
    );
    glass.rotation.x = -Math.PI / 2;
    cockpit.add(glass);
    
    // Tablero
    const dash = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 0.4, 0.6),
        new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4, metalness: 0.8 })
    );
    dash.position.set(0, -0.6, -0.6);
    cockpit.add(dash);
    
    return cockpit;
}
shipGroup.add(buildCockpit());

// Objetos Fijos (Monolitos)
const fixedObjects = [];
const towerGeo = new THREE.CylinderGeometry(1, 2, 15, 6);
const towerMat = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0x220000, roughness: 0.2 });
for(let i=0; i<10; i++) {
    const tower = new THREE.Mesh(towerGeo, towerMat);
    tower.position.set((Math.random()-0.5)*60, 7.5, -50-(i*40));
    tower.castShadow = true; tower.receiveShadow = true;
    scene.add(tower);
    fixedObjects.push(tower);
}

// Asteroides (Dinámicos)
const asteroids = [];
const rockGeo = new THREE.DodecahedronGeometry(1, 1);
const rockMat = new THREE.MeshStandardMaterial({ color: 0x888888, flatShading: true });

function spawnAsteroid() {
    const rock = new THREE.Mesh(rockGeo, rockMat);
    resetAsteroid(rock);
    rock.castShadow = true;
    scene.add(rock);
    asteroids.push(rock);
}
function resetAsteroid(obj) {
    obj.position.set((Math.random()-0.5)*80, 2+Math.random()*15, -150-Math.random()*50);
    const s = 1 + Math.random()*3;
    obj.scale.set(s,s,s);
    obj.userData = { rotSpeed: { x: Math.random()*0.05, y: Math.random()*0.05 } };
}
for(let i=0; i<ASTEROID_COUNT; i++) spawnAsteroid();

/** ========= CONTROLES VR ========= */
const controller1 = renderer.xr.getController(0);
const controller2 = renderer.xr.getController(1); // Mando derecho (Piloto)
const controllerModelFactory = new XRControllerModelFactory();

const grip1 = renderer.xr.getControllerGrip(0);
grip1.add(controllerModelFactory.createControllerModel(grip1));
const grip2 = renderer.xr.getControllerGrip(1);
grip2.add(controllerModelFactory.createControllerModel(grip2));

scene.add(controller1, controller2, grip1, grip2);
shipGroup.add(controller1, controller2, grip1, grip2); // Atados a la nave

// DISPARO
const lasers = [];
const laserGeo = new THREE.BoxGeometry(0.05, 0.05, 1);
const laserMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });

controller2.addEventListener('selectstart', () => {
    const laser = new THREE.Mesh(laserGeo, laserMat);
    const pos = new THREE.Vector3(); controller2.getWorldPosition(pos);
    const quat = new THREE.Quaternion(); controller2.getWorldQuaternion(quat);
    laser.position.copy(pos); laser.quaternion.copy(quat);
    scene.add(laser);
    lasers.push({ mesh: laser, life: 2.0 });
    playSound(880, 'sawtooth');
});

function playSound(freq, type) {
    if (listener.context.state === 'suspended') listener.context.resume();
    const osc = listener.context.createOscillator();
    const gain = listener.context.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, listener.context.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, listener.context.currentTime + 0.1);
    gain.gain.setValueAtTime(0.1, listener.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, listener.context.currentTime + 0.1);
    osc.connect(gain); gain.connect(listener.destination);
    osc.start(); osc.stop(listener.context.currentTime + 0.1);
}

/** ========= LOOP PRINCIPAL ========= */
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
    const dt = clock.getDelta();

    // 1. Mover Suelo (Velocidad)
    moonTex.offset.y -= (SHIP_SPEED_Z * 0.005 * dt);

    // 2. Control Nave (VR)
    if(renderer.xr.isPresenting) {
        const rot = controller2.rotation;
        shipGroup.position.x -= rot.z * 15 * dt;
        shipGroup.position.y += rot.x * 10 * dt;
        
        // Límites
        shipGroup.position.x = THREE.MathUtils.clamp(shipGroup.position.x, -PLAYER_LIMIT_X, PLAYER_LIMIT_X);
        shipGroup.position.y = THREE.MathUtils.clamp(shipGroup.position.y, PLAYER_LIMIT_Y_MIN, PLAYER_LIMIT_Y_MAX);
        shipGroup.rotation.z = THREE.MathUtils.lerp(shipGroup.rotation.z, -rot.z * 0.5, 0.1);
    }

    // 3. Mover Entorno
    fixedObjects.forEach(obj => {
        obj.position.z += SHIP_SPEED_Z * dt;
        if(obj.position.z > 10) { obj.position.z = -300; obj.position.x = (Math.random()-0.5)*80; }
    });
    asteroids.forEach(a => {
        a.position.z += (SHIP_SPEED_Z + 10) * dt;
        a.rotation.x += a.userData.rotSpeed.x; a.rotation.y += a.userData.rotSpeed.y;
        if(a.position.z > 10) resetAsteroid(a);
    });

    // 4. Láseres y Colisiones
    for(let i=lasers.length-1; i>=0; i--) {
        const l = lasers[i];
        l.life -= dt;
        l.mesh.translateZ(-100 * dt);
        
        asteroids.forEach(a => {
            if(l.mesh.position.distanceTo(a.position) < 2) {
                resetAsteroid(a);
                playSound(150, 'square'); // Boom
            }
        });
        if(l.life <= 0) { scene.remove(l.mesh); lasers.splice(i,1); }
    }

    renderer.render(scene, camera);
});

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
