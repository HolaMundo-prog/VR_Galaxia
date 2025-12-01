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

// Referencias HTML
const overlay = document.getElementById('game-overlay');
const bgMusic = document.getElementById('bg-music');

// ... (configuración de renderer y escena igual) ...

const vrButton = VRButton.createButton(renderer);
document.body.appendChild(vrButton);

// EVENTO: Al dar clic en "ENTER VR", ocultamos la portada e iniciamos la música
vrButton.addEventListener('click', () => {
    overlay.style.display = 'none'; // Ocultar UI
    
    // Configuración de audio
    if (bgMusic) {
        bgMusic.volume = 0.5; // Volumen al 50% para escuchar los disparos
        bgMusic.play().catch(e => console.warn("El navegador bloqueó el audio:", e));
    }
});
const scene = new THREE.Scene();
// Niebla oscura para fundir el horizonte
scene.fog = new THREE.Fog(0x000000, 20, 150);

/** ========= CÁMARA Y NAVE (JUGADOR) ========= */
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 500);
const shipGroup = new THREE.Group();
shipGroup.position.set(0, 3, 0); // Empezamos volando bajo
shipGroup.add(camera);
scene.add(shipGroup);

// Listener de audio en la cámara para efectos 3D
const listener = new THREE.AudioListener();
camera.add(listener);

/** ========= ENTORNO (Requerimientos A, B, C) ========= */

// 1. TECHO / CIELO (HDRI - Galaxia)
const loader = new RGBELoader();
loader.load('https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/starmap_g4k_1k.hdr', function(texture) {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    scene.background = texture;
    scene.environment = texture;
});

// 2. PISO (Textura - Superficie Lunar)
// Usamos una textura repetible de roca
const texLoader = new THREE.TextureLoader();
const moonTex = texLoader.load('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/terrain/grasslight-big.jpg'); 
// Truco: Usamos textura de pasto pero la pintamos de gris oscuro para que parezca roca lunar
moonTex.wrapS = THREE.RepeatWrapping;
moonTex.wrapT = THREE.RepeatWrapping;
moonTex.repeat.set(20, 20);

const floorGeo = new THREE.PlaneGeometry(400, 400);
const floorMat = new THREE.MeshStandardMaterial({ 
    map: moonTex,
    color: 0x555555, // Gris oscuro (luna)
    roughness: 0.9,
    metalness: 0.1
});
const floor = new THREE.Mesh(floorGeo, floorMat);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// 3. LUCES
const sunLight = new THREE.DirectionalLight(0xffffff, 1.5);
sunLight.position.set(-50, 100, 50);
sunLight.castShadow = true;
// Configurar sombras para que se vean bien
sunLight.shadow.mapSize.width = 2048;
sunLight.shadow.mapSize.height = 2048;
sunLight.shadow.camera.near = 0.5;
sunLight.shadow.camera.far = 500;
sunLight.shadow.camera.left = -100;
sunLight.shadow.camera.right = 100;
sunLight.shadow.camera.top = 100;
sunLight.shadow.camera.bottom = -100;
scene.add(sunLight);

const ambientLight = new THREE.AmbientLight(0x404060, 0.3); // Luz azulada tenue
scene.add(ambientLight);


/** ========= OBJETOS (Requerimiento D) ========= */

// 1. CABINA (Procedural - para inmersión)
function buildCockpit() {
    const cockpit = new THREE.Group();
    // Marco
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4, metalness: 0.8 });
    const glassMat = new THREE.MeshPhysicalMaterial({ 
        color: 0x00aaff, transmission: 0.9, opacity: 0.2, transparent: true, roughness: 0.0 
    });
    
    // Ventana
    const glassGeo = new THREE.SphereGeometry(1.5, 32, 32, 0, Math.PI * 2, 0, Math.PI * 0.3);
    const glass = new THREE.Mesh(glassGeo, glassMat);
    glass.rotation.x = -Math.PI / 2;
    cockpit.add(glass);

    // Panel de control
    const dashGeo = new THREE.BoxGeometry(1.2, 0.4, 0.6);
    const dash = new THREE.Mesh(dashGeo, frameMat);
    dash.position.set(0, -0.6, -0.6);
    cockpit.add(dash);

    // Pantalla holográfica (decoración)
    const holoGeo = new THREE.PlaneGeometry(0.4, 0.2);
    const holoMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc, side: THREE.DoubleSide, opacity: 0.6, transparent: true });
    const screen = new THREE.Mesh(holoGeo, holoMat);
    screen.position.set(0, -0.35, -0.8);
    screen.rotation.x = -0.4;
    cockpit.add(screen);

    return cockpit;
}
const myCockpit = buildCockpit();
shipGroup.add(myCockpit);

// 2. OBJETOS FIJOS (Estructuras Alienígenas - Monolitos)
const fixedObjects = [];
const towerGeo = new THREE.CylinderGeometry(1, 2, 15, 6);
const towerMat = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0x220000, roughness: 0.2 });

for(let i=0; i<10; i++) {
    const tower = new THREE.Mesh(towerGeo, towerMat);
    tower.position.x = (Math.random() - 0.5) * 60;
    tower.position.z = -50 - (i * 40); // Distribuidas hacia el fondo
    tower.position.y = 7.5; // Mitad de altura
    tower.castShadow = true;
    tower.receiveShadow = true;
    scene.add(tower);
    fixedObjects.push(tower);
}

// 3. OBJETOS ALEATORIOS (Asteroides con movimiento)
const asteroids = [];
const rockGeo = new THREE.DodecahedronGeometry(1, 1);
const rockMat = new THREE.MeshStandardMaterial({ color: 0x888888, flatShading: true });

function spawnAsteroid() {
    const rock = new THREE.Mesh(rockGeo, rockMat);
    resetObjectPosition(rock);
    rock.castShadow = true;
    scene.add(rock);
    asteroids.push(rock);
}

function resetObjectPosition(obj) {
    obj.position.z = -150 - Math.random() * 50; // Lejos al frente
    obj.position.x = (Math.random() - 0.5) * 80;
    obj.position.y = 2 + Math.random() * 15;
    const s = 1 + Math.random() * 3;
    obj.scale.set(s,s,s);
    obj.userData = {
        rotSpeed: { x: Math.random()*0.05, y: Math.random()*0.05 },
        active: true
    };
}

for(let i=0; i<ASTEROID_COUNT; i++) spawnAsteroid();

/** ========= CONTROLADORES VR ========= */
const controllerLeft = renderer.xr.getController(0);
const controllerRight = renderer.xr.getController(1);

const controllerModelFactory = new XRControllerModelFactory();
const gripLeft = renderer.xr.getControllerGrip(0);
const gripRight = renderer.xr.getControllerGrip(1);
gripLeft.add(controllerModelFactory.createControllerModel(gripLeft));
gripRight.add(controllerModelFactory.createControllerModel(gripRight));

scene.add(controllerLeft, controllerRight, gripLeft, gripRight);
shipGroup.add(controllerLeft, controllerRight, gripLeft, gripRight); // Atarlos a la nave

// Rayo Láser
controllerRight.addEventListener('selectstart', fireLaser);

const lasers = [];
const laserGeo = new THREE.BoxGeometry(0.05, 0.05, 1);
const laserMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });

function fireLaser() {
    const laser = new THREE.Mesh(laserGeo, laserMat);
    const pos = new THREE.Vector3();
    controllerRight.getWorldPosition(pos);
    const quat = new THREE.Quaternion();
    controllerRight.getWorldQuaternion(quat);

    laser.position.copy(pos);
    laser.quaternion.copy(quat);
    scene.add(laser);
    lasers.push({ mesh: laser, life: 2.0 });

    // EFECTO DE SONIDO (Sintetizado para no depender de archivos externos)
    playSoundEffect(880, 'sawtooth', 0.1);
}

function playSoundEffect(freq, type, duration) {
    // Generador de audio simple
    if (listener.context.state === 'suspended') listener.context.resume();
    const osc = listener.context.createOscillator();
    const gain = listener.context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, listener.context.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, listener.context.currentTime + duration);
    gain.gain.setValueAtTime(0.1, listener.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, listener.context.currentTime + duration);
    osc.connect(gain);
    gain.connect(listener.destination);
    osc.start();
    osc.stop(listener.context.currentTime + duration);
}

/** ========= LOOP PRINCIPAL ========= */
const clock = new THREE.Clock();

renderer.setAnimationLoop(() => {
    const dt = clock.getDelta();

    // 1. MANEJO DE LA NAVE (Límites y Movimiento)
    // Simular movimiento infinito del suelo
    moonTex.offset.y -= (SHIP_SPEED_Z * 0.005 * dt);

    if(renderer.xr.isPresenting) {
        // Usar rotación del control derecho para mover la nave en X e Y
        const rot = controllerRight.rotation;
        
        // Mover X
        shipGroup.position.x -= rot.z * 15 * dt; // Inclinar para girar
        // Mover Y
        shipGroup.position.y += rot.x * 10 * dt; // Arriba/Abajo

        // APLICAR LÍMITES (Requerimiento A)
        shipGroup.position.x = THREE.MathUtils.clamp(shipGroup.position.x, -PLAYER_LIMIT_X, PLAYER_LIMIT_X);
        shipGroup.position.y = THREE.MathUtils.clamp(shipGroup.position.y, PLAYER_LIMIT_Y_MIN, PLAYER_LIMIT_Y_MAX);
        
        // Efecto visual de inclinación de cabina
        shipGroup.rotation.z = THREE.MathUtils.lerp(shipGroup.rotation.z, -rot.z * 0.5, 0.1);
    }

    // 2. ACTUALIZAR OBJETOS FIJOS (Simular que pasamos junto a ellos)
    fixedObjects.forEach(obj => {
        obj.position.z += SHIP_SPEED_Z * dt;
        if(obj.position.z > 10) {
            // Reciclar monolito al fondo
            obj.position.z = -300;
            obj.position.x = (Math.random() - 0.5) * 80;
        }
    });

    // 3. ACTUALIZAR ASTEROIDES
    asteroids.forEach(a => {
        a.position.z += (SHIP_SPEED_Z + 10) * dt; // Se mueven más rápido que el entorno
        a.rotation.x += a.userData.rotSpeed.x;
        a.rotation.y += a.userData.rotSpeed.y;

        if(a.position.z > 10) resetObjectPosition(a);
    });

    // 4. LÁSERES
    for(let i=lasers.length-1; i>=0; i--) {
        const l = lasers[i];
        l.life -= dt;
        l.mesh.translateZ(-100 * dt); // Mover láser rápido

        // Colisión simple
        asteroids.forEach(a => {
            if(l.mesh.position.distanceTo(a.position) < 2) {
                resetObjectPosition(a); // Destruir asteroide
                playSoundEffect(150, 'square', 0.3); // Sonido explosión grave
            }
        });

        if(l.life <= 0) {
            scene.remove(l.mesh);
            lasers.splice(i,1);
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