import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

/** ========= VARIABLES DE JUEGO ========= */
let SCORE = 0;
let HEALTH = 100;
const SHIP_SPEED = 50;
const LIMIT_X = 18;
const LIMIT_Y = 12;

// Elementos HTML
const bgMusic = document.getElementById('bg-music');

/** ========= SETUP BÁSICO ========= */
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
// Sombras suaves
renderer.shadowMap.enabled = true; 
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x000000, 0.002); // Niebla negra profunda

// Botón VR
const vrBtn = VRButton.createButton(renderer);
document.body.appendChild(vrBtn);
vrBtn.addEventListener('click', () => {
    if(bgMusic) { bgMusic.volume = 0.4; bgMusic.play().catch(()=>{}); }
});

/** ========= CÁMARA Y JUGADOR ========= */
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
const shipGroup = new THREE.Group();
shipGroup.position.set(0, 1.6, 5);
shipGroup.add(camera);
scene.add(shipGroup);

// Audio Listener
const listener = new THREE.AudioListener();
camera.add(listener);

/** ========= ENTORNO: ESTRELLAS Y GALAXIA ========= */
// 1. HDRI (Fondo Galáctico)
new RGBELoader().load('https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/starmap_g4k_1k.hdr', (texture) => {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    scene.background = texture;
    scene.environment = texture; // Iluminación basada en la galaxia
});

// 2. Partículas de Estrellas (Efecto Velocidad)
const starCount = 2000;
const starGeo = new THREE.BufferGeometry();
const starPos = new Float32Array(starCount * 3);
for(let i=0; i<starCount; i++){
    starPos[i*3] = (Math.random() - 0.5) * 400;
    starPos[i*3+1] = (Math.random() - 0.5) * 400;
    starPos[i*3+2] = (Math.random() - 0.5) * 400;
}
starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.8, transparent: true, opacity: 0.8 });
const starField = new THREE.Points(starGeo, starMat);
scene.add(starField);

// 3. Suelo (Planeta abajo) - Opcional, para dar referencia
const gridHelper = new THREE.GridHelper(500, 50, 0x00ffff, 0x222222);
gridHelper.position.y = -20;
scene.add(gridHelper);

/** ========= LUCES ========= */
const sunLight = new THREE.DirectionalLight(0xffffff, 2);
sunLight.position.set(-20, 50, 20);
sunLight.castShadow = true;
scene.add(sunLight);
scene.add(new THREE.AmbientLight(0x404060, 0.5)); // Luz ambiente azulada

/** ========= CABINA AVANZADA + HUD ========= */
// Texture Canvas para el HUD (Texto dinámico)
const hudCanvas = document.createElement('canvas');
hudCanvas.width = 512; hudCanvas.height = 256;
const hudCtx = hudCanvas.getContext('2d');
const hudTexture = new THREE.CanvasTexture(hudCanvas);

function updateHUD() {
    hudCtx.fillStyle = '#000000'; 
    hudCtx.fillRect(0,0, 512, 256); // Limpiar fondo
    
    // Borde
    hudCtx.strokeStyle = '#00ffcc';
    hudCtx.lineWidth = 10;
    hudCtx.strokeRect(5,5, 502, 246);

    // Texto Score
    hudCtx.font = 'bold 60px monospace';
    hudCtx.fillStyle = '#00ffcc';
    hudCtx.fillText(`SCORE: ${SCORE}`, 30, 80);

    // Texto Salud (Cambia de color si es bajo)
    hudCtx.fillStyle = HEALTH > 30 ? '#00ff00' : '#ff0000';
    hudCtx.fillText(`HULL:  ${HEALTH}%`, 30, 160);
    
    // Barra de vida visual
    hudCtx.fillStyle = '#333';
    hudCtx.fillRect(30, 190, 450, 40);
    hudCtx.fillStyle = HEALTH > 30 ? '#00ff00' : '#ff0000';
    hudCtx.fillRect(30, 190, 4.5 * HEALTH, 40);

    hudTexture.needsUpdate = true;
}

function buildCockpit() {
    const cockpit = new THREE.Group();

    // 1. Estructura Principal (Gris Metálico)
    const bodyGeo = new THREE.BoxGeometry(2.5, 1.2, 1.5);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.3, metalness: 0.8 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.set(0, -0.8, 0);
    body.castShadow = true;
    cockpit.add(body);

    // 2. Cristal Frontal (Transparente)
    const glassGeo = new THREE.BoxGeometry(2.4, 1.0, 0.1);
    const glassMat = new THREE.MeshPhysicalMaterial({ 
        color: 0x88ccff, transmission: 0.9, opacity: 0.3, transparent: true, roughness: 0 
    });
    const glass = new THREE.Mesh(glassGeo, glassMat);
    glass.position.set(0, 0.2, -0.75);
    cockpit.add(glass);

    // 3. Pantalla HUD (Con la textura del canvas)
    const screenGeo = new THREE.PlaneGeometry(1.2, 0.6);
    const screenMat = new THREE.MeshBasicMaterial({ map: hudTexture, transparent: true, opacity: 0.9 });
    const screen = new THREE.Mesh(screenGeo, screenMat);
    screen.position.set(0, -0.5, -0.74); // Pegado al tablero
    screen.rotation.x = -Math.PI / 6; // Inclinado hacia el jugador
    cockpit.add(screen);

    return cockpit;
}
shipGroup.add(buildCockpit());
updateHUD(); // Dibujar primera vez

/** ========= ASTEROIDES Y OBJETOS ========= */
const asteroids = [];
const asteroidGeo = new THREE.DodecahedronGeometry(1, 0); // Low poly rock
const asteroidMat = new THREE.MeshStandardMaterial({ color: 0x884444, flatShading: true, roughness: 0.8 });

function spawnAsteroid() {
    const rock = new THREE.Mesh(asteroidGeo, asteroidMat.clone()); // Clone material to tint red on hit
    rock.userData = { 
        rotSpeed: { x: Math.random()*0.05, y: Math.random()*0.05 },
        hp: 1
    };
    resetAsteroid(rock);
    rock.castShadow = true;
    scene.add(rock);
    asteroids.push(rock);
}

function resetAsteroid(obj) {
    // Reaparecer lejos en frente
    obj.position.set(
        (Math.random() - 0.5) * 60,   // X disperso
        (Math.random() - 0.5) * 30,   // Y disperso
        -100 - Math.random() * 100    // Z lejos
    );
    const s = 1 + Math.random() * 3;
    obj.scale.set(s,s,s);
    obj.visible = true;
    obj.material.color.setHex(0x884444); // Reset color
}
// Crear 20 asteroides iniciales
for(let i=0; i<25; i++) spawnAsteroid();

/** ========= EFECTOS: EXPLOSIONES ========= */
const explosions = [];
const particleGeo = new THREE.BufferGeometry();
const particleCount = 30;
const pPos = new Float32Array(particleCount * 3);
particleGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
const particleMat = new THREE.PointsMaterial({ color: 0xffaa00, size: 0.5, transparent: true });

function spawnExplosion(position) {
    const pts = new THREE.Points(particleGeo.clone(), particleMat.clone());
    pts.position.copy(position);
    
    // Velocidades aleatorias para cada partícula
    const velocities = [];
    for(let i=0; i<particleCount; i++){
        velocities.push({
            x: (Math.random()-0.5) * 10,
            y: (Math.random()-0.5) * 10,
            z: (Math.random()-0.5) * 10
        });
    }
    
    // Necesitamos clonar las posiciones para animarlas independientemente
    const positions = new Float32Array(particleCount * 3); // Todo en 0,0,0 relativo al centro
    pts.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    pts.userData = { life: 1.0, velocities: velocities };
    scene.add(pts);
    explosions.push(pts);
}

/** ========= CONTROLES Y DISPAROS ========= */
const controller1 = renderer.xr.getController(0);
const controller2 = renderer.xr.getController(1); // Mando derecho dispara
const controllerModelFactory = new XRControllerModelFactory();

const grip1 = renderer.xr.getControllerGrip(0);
grip1.add(controllerModelFactory.createControllerModel(grip1));
const grip2 = renderer.xr.getControllerGrip(1);
grip2.add(controllerModelFactory.createControllerModel(grip2));

scene.add(controller1, controller2, grip1, grip2);
shipGroup.add(controller1, controller2, grip1, grip2);

const lasers = [];
const laserGeo = new THREE.BoxGeometry(0.1, 0.1, 2);
const laserMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc }); // Laser Cian

controller2.addEventListener('selectstart', () => {
    // Crear láser
    const laser = new THREE.Mesh(laserGeo, laserMat);
    const pos = new THREE.Vector3(); 
    controller2.getWorldPosition(pos);
    const quat = new THREE.Quaternion(); 
    controller2.getWorldQuaternion(quat);
    
    laser.position.copy(pos);
    laser.quaternion.copy(quat);
    
    // Pequeño ajuste para que no salga desde dentro del control
    laser.translateZ(-0.5); 
    
    scene.add(laser);
    lasers.push(laser);
    
    playSound(880, 'square'); // Pew Pew
});

function playSound(freq, type) {
    if(!listener.context) return;
    const osc = listener.context.createOscillator();
    const gain = listener.context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, listener.context.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, listener.context.currentTime + 0.1);
    gain.gain.setValueAtTime(0.1, listener.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, listener.context.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(listener.destination);
    osc.start();
    osc.stop(listener.context.currentTime + 0.15);
}

/** ========= LOOP PRINCIPAL ========= */
const clock = new THREE.Clock();

renderer.setAnimationLoop(() => {
    const dt = clock.getDelta();

    // 1. MOVER NAVE (Mando derecho)
    if(renderer.xr.isPresenting) {
        const rot = controller2.rotation;
        // Invertimos controles para sentir "vuelo"
        shipGroup.position.x -= rot.z * 10 * dt; 
        shipGroup.position.y += rot.x * 10 * dt;
        
        // Límites (Clamp)
        shipGroup.position.x = Math.max(-LIMIT_X, Math.min(LIMIT_X, shipGroup.position.x));
        shipGroup.position.y = Math.max(-2, Math.min(LIMIT_Y, shipGroup.position.y));
        
        // Inclinación visual
        shipGroup.rotation.z = THREE.MathUtils.lerp(shipGroup.rotation.z, -rot.z * 0.5, 0.1);
    }

    // 2. MOVER ESTRELLAS (Efecto Warp)
    const starPosArr = starField.geometry.attributes.position.array;
    for(let i=0; i<starCount; i++){
        starPosArr[i*3+2] += (SHIP_SPEED * 2) * dt; 
        if(starPosArr[i*3+2] > 20) {
            starPosArr[i*3+2] = -400; // Reset al fondo
        }
    }
    starField.geometry.attributes.position.needsUpdate = true;

    // 3. GESTIÓN DE LÁSERES (Bucle inverso para evitar crash al borrar)
    for (let i = lasers.length - 1; i >= 0; i--) {
        const laser = lasers[i];
        laser.translateZ(-80 * dt); // Mover hacia adelante muy rápido

        // Distancia máxima de vida del láser
        if (laser.position.distanceTo(shipGroup.position) > 200) {
            scene.remove(laser);
            lasers.splice(i, 1);
            continue;
        }

        // COLISIÓN LÁSER vs ASTEROIDE
        // Iteramos asteroides para ver si tocamos alguno
        let hit = false;
        for (let j = 0; j < asteroids.length; j++) {
            const ast = asteroids[j];
            if (ast.visible && laser.position.distanceTo(ast.position) < (ast.scale.x + 0.5)) {
                // IMPACTO CONFIRMADO
                spawnExplosion(ast.position);
                playSound(150, 'sawtooth'); // Sonido explosión
                resetAsteroid(ast); // Destruir y reciclar
                
                // Actualizar Score
                SCORE += 10;
                updateHUD();
                
                hit = true;
                break; // Un láser solo mata un asteroide
            }
        }

        if (hit) {
            scene.remove(laser);
            lasers.splice(i, 1);
        }
    }

    // 4. GESTIÓN DE ASTEROIDES (Movimiento y Daño al Jugador)
    const shipPos = shipGroup.position;
    asteroids.forEach(ast => {
        // Mover hacia el jugador
        ast.position.z += SHIP_SPEED * dt;
        ast.rotation.x += ast.userData.rotSpeed.x;
        ast.rotation.y += ast.userData.rotSpeed.y;

        // Si pasa detrás, resetear
        if (ast.position.z > 20) {
            resetAsteroid(ast);
        }

        // COLISIÓN ASTEROIDE vs NAVE
        if (ast.visible && ast.position.distanceTo(shipPos) < 2.5) {
            spawnExplosion(shipPos.clone().add(new THREE.Vector3(0,0,-2))); // Explosión en cabina
            playSound(100, 'sawtooth');
            
            HEALTH -= 10;
            resetAsteroid(ast);
            updateHUD();

            // GAME OVER LOGIC
            if(HEALTH <= 0) {
                SCORE = 0;
                HEALTH = 100;
                // Pequeño parpadeo rojo o reinicio
                updateHUD();
            }
        }
    });

    // 5. ANIMAR EXPLOSIONES
    for(let i=explosions.length-1; i>=0; i--){
        const exp = explosions[i];
        exp.userData.life -= dt * 2.0; // Velocidad de desvanecimiento
        
        // Mover partículas
        const positions = exp.geometry.attributes.position.array;
        const vels = exp.userData.velocities;
        for(let k=0; k<vels.length; k++){
            positions[k*3] += vels[k].x * dt;
            positions[k*3+1] += vels[k].y * dt;
            positions[k*3+2] += vels[k].z * dt;
        }
        exp.geometry.attributes.position.needsUpdate = true;
        exp.material.opacity = exp.userData.life;

        if(exp.userData.life <= 0){
            scene.remove(exp);
            explosions.splice(i, 1);
        }
    }

    renderer.render(scene, camera);
});

// Resize window
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
