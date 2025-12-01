import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';

/** ========= ESTADO DEL JUEGO ========= */
const STATE = {
    MENU: 0,
    PLAYING: 1,
    GAMEOVER: 2
};
let currentState = STATE.MENU;

let score = 0;
let health = 100;
const SHIP_SPEED = 60; // Velocidad simulada
const LASER_SPEED = 150;

/** ========= ESCENA ========= */
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
document.body.appendChild(VRButton.createButton(renderer));

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x050510, 0.0025); // Niebla púrpura oscura

// Cámara y Contenedor del Jugador
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
const shipGroup = new THREE.Group();
shipGroup.position.set(0, 1.6, 0);
shipGroup.add(camera);
scene.add(shipGroup);

// Audio
const listener = new THREE.AudioListener();
camera.add(listener);
const bgMusic = document.getElementById('bg-music');
renderer.xr.addEventListener('sessionstart', () => {
    if(bgMusic) { bgMusic.volume=0.3; bgMusic.play().catch(()=>{}); }
    resetGame();
});

/** ========= ENTORNO ========= */
// Estrellas (Fondo móvil)
const starsGeo = new THREE.BufferGeometry();
const starsCount = 3000;
const starsPos = new Float32Array(starsCount * 3);
for(let i=0; i<starsCount; i++) {
    starsPos[i*3] = (Math.random()-0.5)*800;
    starsPos[i*3+1] = (Math.random()-0.5)*800;
    starsPos[i*3+2] = (Math.random()-0.5)*800;
}
starsGeo.setAttribute('position', new THREE.BufferAttribute(starsPos, 3));
const starsMat = new THREE.PointsMaterial({color:0xffffff, size:0.7});
const starField = new THREE.Points(starsGeo, starsMat);
scene.add(starField);

// Iluminación
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(-10, 50, 20);
scene.add(sun);
scene.add(new THREE.AmbientLight(0x404060, 0.6));

/** ========= CABINA PRO (DISEÑO MEJORADO) ========= */
function createCockpit() {
    const cockpit = new THREE.Group();

    // 1. Base principal
    const hullMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5, metalness: 0.8 });
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.2, 3.0), hullMat);
    hull.position.set(0, -0.8, 0.5);
    cockpit.add(hull);

    // 2. Tablero de instrumentos (Inclinado)
    const dashGeo = new THREE.CylinderGeometry(1.2, 1.2, 0.5, 3); // Prisma triangular
    const dash = new THREE.Mesh(dashGeo, hullMat);
    dash.rotation.z = Math.PI / 2;
    dash.rotation.y = Math.PI / 2;
    dash.position.set(0, -0.4, -0.8);
    cockpit.add(dash);

    // 3. Paneles brillantes (Monitores)
    const screenMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc });
    const screenLeft = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.3), screenMat);
    screenLeft.position.set(-0.6, -0.3, -0.85);
    screenLeft.rotation.y = 0.5;
    screenLeft.rotation.x = -0.5;
    cockpit.add(screenLeft);

    const screenRight = screenLeft.clone();
    screenRight.position.set(0.6, -0.3, -0.85);
    screenRight.rotation.y = -0.5;
    cockpit.add(screenRight);

    // 4. Marcos de la ventana (Struts)
    const strutMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
    const leftStrut = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.5, 2), strutMat);
    leftStrut.position.set(-1, 0.5, 0);
    leftStrut.rotation.z = -0.2;
    cockpit.add(leftStrut);

    const rightStrut = leftStrut.clone();
    rightStrut.position.set(1, 0.5, 0);
    rightStrut.rotation.z = 0.2;
    cockpit.add(rightStrut);

    return cockpit;
}
const myCockpit = createCockpit();
shipGroup.add(myCockpit);

/** ========= UI 3D (TEXTOS FLOTANTES) ========= */
// Cargamos una fuente para escribir en 3D
const loader = new FontLoader();
let fontLoaded = null;
let scoreMesh = null;
let healthMesh = null;
let gameOverGroup = new THREE.Group();

loader.load('https://unpkg.com/three@0.160.1/examples/fonts/helvetiker_bold.typeface.json', (font) => {
    fontLoaded = font;
    update3DText();
    createGameOverScreen();
});

// Panel de Game Over
function createGameOverScreen() {
    if(!fontLoaded) return;
    gameOverGroup.clear();

    // Texto "GAME OVER"
    const textGeo = new TextGeometry('MISION FALLIDA', { font: fontLoaded, size: 0.3, height: 0.05 });
    textGeo.center();
    const textMesh = new THREE.Mesh(textGeo, new THREE.MeshBasicMaterial({ color: 0xff0000 }));
    textMesh.position.y = 0.2;
    
    // Texto "Reiniciar"
    const subGeo = new TextGeometry('Dispara para reiniciar', { font: fontLoaded, size: 0.12, height: 0.02 });
    subGeo.center();
    const subMesh = new THREE.Mesh(subGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    subMesh.position.y = -0.2;

    gameOverGroup.add(textMesh, subMesh);
    gameOverGroup.position.set(0, 1.6, -2); // Flotando frente a la cámara
    gameOverGroup.visible = false;
    scene.add(gameOverGroup);
}

// Actualizar marcadores de la nave
function update3DText() {
    if(!fontLoaded) return;
    
    // Borrar anteriores
    if(scoreMesh) myCockpit.remove(scoreMesh);
    if(healthMesh) myCockpit.remove(healthMesh);

    // Score (Azul)
    const scoreGeo = new TextGeometry(`Puntos: ${score}`, { font: fontLoaded, size: 0.08, height: 0.01 });
    scoreMesh = new THREE.Mesh(scoreGeo, new THREE.MeshBasicMaterial({ color: 0x00aaff }));
    scoreMesh.position.set(-0.8, -0.15, -0.9);
    scoreMesh.rotation.y = 0.4;
    myCockpit.add(scoreMesh);

    // Salud (Verde/Rojo)
    const col = health > 30 ? 0x00ff00 : 0xff0000;
    const healthGeo = new TextGeometry(`Escudo: ${health}%`, { font: fontLoaded, size: 0.08, height: 0.01 });
    healthMesh = new THREE.Mesh(healthGeo, new THREE.MeshBasicMaterial({ color: col }));
    healthMesh.position.set(0.3, -0.15, -1.0);
    healthMesh.rotation.y = -0.4;
    myCockpit.add(healthMesh);
}

/** ========= OBJETOS DEL JUEGO ========= */
let asteroids = [];
let lasers = [];
const particles = [];

const asteroidGeo = new THREE.DodecahedronGeometry(1.5, 0); // Más grandes
const asteroidMat = new THREE.MeshStandardMaterial({ color: 0x884444, flatShading: true });

function spawnAsteroid() {
    if(currentState !== STATE.PLAYING) return;

    const rock = new THREE.Mesh(asteroidGeo, asteroidMat.clone());
    
    // POSICIÓN: Aparecen lejos (-200) y dispersos
    rock.position.set(
        (Math.random() - 0.5) * 80,
        (Math.random() - 0.5) * 40,
        -250 
    );
    
    rock.userData = { 
        rot: { x: Math.random()*0.05, y: Math.random()*0.05 },
        speed: SHIP_SPEED + Math.random() * 20
    };
    
    scene.add(rock);
    asteroids.push(rock);
}

function shootLaser(controller) {
    if(currentState === STATE.GAMEOVER) {
        resetGame(); // Disparar reinicia el juego
        return;
    }
    if(currentState !== STATE.PLAYING) return;

    const geo = new THREE.BoxGeometry(0.1, 0.1, 3);
    const mat = new THREE.MeshBasicMaterial({ color: 0x00ff00 }); // Verde brillante
    const laser = new THREE.Mesh(geo, mat);

    // Posición y rotación del control
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    controller.getWorldPosition(p);
    controller.getWorldQuaternion(q);

    laser.position.copy(p);
    laser.quaternion.copy(q);
    laser.translateZ(-1.0); // Ajuste para que no salga de la mano

    scene.add(laser);
    lasers.push(laser);

    playSound(800, 'square');
}

function createExplosion(pos) {
    // Partículas simples
    const pCount = 15;
    const geo = new THREE.BufferGeometry();
    const posArr = new Float32Array(pCount*3);
    const velArr = [];

    for(let i=0; i<pCount; i++) {
        posArr[i*3] = pos.x;
        posArr[i*3+1] = pos.y;
        posArr[i*3+2] = pos.z;
        velArr.push({
            x: (Math.random()-0.5)*15,
            y: (Math.random()-0.5)*15,
            z: (Math.random()-0.5)*15
        });
    }
    geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    const mat = new THREE.PointsMaterial({color: 0xffaa00, size: 0.6, transparent: true});
    const sys = new THREE.Points(geo, mat);
    sys.userData = { life: 1.0, vels: velArr };
    scene.add(sys);
    particles.push(sys);
}

function playSound(freq, type) {
    if(listener.context.state === 'suspended') listener.context.resume();
    const osc = listener.context.createOscillator();
    const gain = listener.context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, listener.context.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, listener.context.currentTime + 0.1);
    gain.gain.setValueAtTime(0.1, listener.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, listener.context.currentTime + 0.1);
    osc.connect(gain); gain.connect(listener.destination);
    osc.start(); osc.stop(listener.context.currentTime + 0.15);
}

/** ========= LÓGICA DEL JUEGO ========= */
function resetGame() {
    // Limpiar escena
    asteroids.forEach(a => { scene.remove(a); a.geometry.dispose(); });
    lasers.forEach(l => { scene.remove(l); l.geometry.dispose(); });
    asteroids = [];
    lasers = [];
    
    score = 0;
    health = 100;
    currentState = STATE.PLAYING;
    gameOverGroup.visible = false;
    update3DText();
    
    // Iniciar oleada inicial
    for(let i=0; i<5; i++) spawnAsteroid();
}

function gameOver() {
    currentState = STATE.GAMEOVER;
    gameOverGroup.visible = true;
    playSound(150, 'sawtooth'); // Sonido grave
}

function checkCollisions() {
    const shipBox = new THREE.Box3().setFromObject(myCockpit);

    // 1. Láser vs Asteroide
    // Usamos bucle inverso para borrar sin errores de índice (ESTO EVITA QUE SE TRABE)
    for (let i = lasers.length - 1; i >= 0; i--) {
        const laser = lasers[i];
        let laserHit = false;

        for (let j = asteroids.length - 1; j >= 0; j--) {
            const ast = asteroids[j];
            
            // Distancia simple (esferas)
            const dist = laser.position.distanceTo(ast.position);
            
            if (dist < 2.5) { // Radio de colisión generoso
                createExplosion(ast.position);
                playSound(200, 'sawtooth');
                
                // Borrar asteroide
                scene.remove(ast);
                asteroids.splice(j, 1);
                
                laserHit = true;
                score += 10;
                update3DText();
                
                // Reemplazar asteroide eliminado
                spawnAsteroid();
                break; 
            }
        }
        
        if (laserHit) {
            scene.remove(laser);
            lasers.splice(i, 1);
        }
    }

    // 2. Asteroide vs Nave
    for (let i = asteroids.length - 1; i >= 0; i--) {
        const ast = asteroids[i];
        
        // Si el asteroide está muy cerca de la posición del jugador
        if (ast.position.distanceTo(shipGroup.position) < 3.0) {
            createExplosion(shipGroup.position.clone().add(new THREE.Vector3(0,0,-2)));
            playSound(100, 'square');
            
            health -= 20;
            update3DText();
            
            // Eliminar asteroide que chocó
            scene.remove(ast);
            asteroids.splice(i, 1);

            if(health <= 0) gameOver();
        }
    }
}

/** ========= CONTROLES ========= */
const controller1 = renderer.xr.getController(0);
const controller2 = renderer.xr.getController(1);
const controllerModelFactory = new XRControllerModelFactory();

// Modelos visibles
const grip1 = renderer.xr.getControllerGrip(0);
grip1.add(controllerModelFactory.createControllerModel(grip1));
const grip2 = renderer.xr.getControllerGrip(1);
grip2.add(controllerModelFactory.createControllerModel(grip2));

scene.add(controller1, controller2, grip1, grip2);
shipGroup.add(controller1, controller2, grip1, grip2);

controller2.addEventListener('selectstart', () => shootLaser(controller2));

/** ========= LOOP PRINCIPAL ========= */
const clock = new THREE.Clock();

renderer.setAnimationLoop(() => {
    const dt = clock.getDelta();

    if(currentState === STATE.PLAYING) {
        // Generación continua de asteroides
        if(Math.random() < 0.02) spawnAsteroid(); // 2% chance per frame

        // 1. Mover Jugador (Inclinación)
        if(renderer.xr.isPresenting) {
            const rot = controller2.rotation;
            shipGroup.position.x -= rot.z * 15 * dt;
            shipGroup.position.y += rot.x * 15 * dt;
            // Límites
            shipGroup.position.x = THREE.MathUtils.clamp(shipGroup.position.x, -20, 20);
            shipGroup.position.y = THREE.MathUtils.clamp(shipGroup.position.y, -5, 15);
            // Efecto visual
            shipGroup.rotation.z = THREE.MathUtils.lerp(shipGroup.rotation.z, -rot.z * 0.5, 0.1);
        }

        // 2. Actualizar Láseres (¡LIMPIEZA DE MEMORIA!)
        for (let i = lasers.length - 1; i >= 0; i--) {
            const l = lasers[i];
            l.translateZ(-LASER_SPEED * dt);
            
            // Si está muy lejos, eliminar para no saturar memoria
            if (l.position.distanceTo(shipGroup.position) > 300) {
                scene.remove(l);
                l.geometry.dispose(); // Importante
                lasers.splice(i, 1);
            }
        }

        // 3. Actualizar Asteroides (¡LIMPIEZA DE MEMORIA!)
        for (let i = asteroids.length - 1; i >= 0; i--) {
            const a = asteroids[i];
            a.position.z += a.userData.speed * dt;
            a.rotation.x += a.userData.rot.x;
            a.rotation.y += a.userData.rot.y;

            // Si pasa detrás del jugador
            if (a.position.z > 20) {
                scene.remove(a);
                a.geometry.dispose(); // Importante
                asteroids.splice(i, 1);
            }
        }

        checkCollisions();
    }

    // 4. Partículas (Siempre se actualizan)
    for(let i=particles.length-1; i>=0; i--) {
        const p = particles[i];
        p.userData.life -= dt * 2.0;
        const posAttr = p.geometry.attributes.position;
        const vels = p.userData.vels;
        
        for(let j=0; j<vels.length; j++) {
            posAttr.setXYZ(j, 
                posAttr.getX(j) + vels[j].x*dt,
                posAttr.getY(j) + vels[j].y*dt,
                posAttr.getZ(j) + vels[j].z*dt
            );
        }
        posAttr.needsUpdate = true;
        p.material.opacity = p.userData.life;
        
        if(p.userData.life <= 0) {
            scene.remove(p);
            p.geometry.dispose();
            particles.splice(i, 1);
        }
    }

    // 5. Mover fondo (Warp Effect)
    const starPosArr = starField.geometry.attributes.position.array;
    for(let i=0; i<starsCount; i++) {
        starPosArr[i*3+2] += (SHIP_SPEED * 1.5) * dt;
        if(starPosArr[i*3+2] > 400) starPosArr[i*3+2] = -400;
    }
    starField.geometry.attributes.position.needsUpdate = true;

    renderer.render(scene, camera);
});

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
