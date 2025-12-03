// ---------- VARIABLES PRINCIPALES ----------
let scene, camera, renderer;
let gems = [];
let obstacles = [];
let score = 0;
let speed = 0.08;
let isGameOver = false;

const audio = new Audio("assets/fondo.mp3");
audio.loop = true;

const canvas = document.getElementById("xr-canvas");

const startScreen = document.getElementById("start-screen");
const endScreen = document.getElementById("end-screen");
const finalScore = document.getElementById("final-score");

// ---------- BOTONES ----------
document.getElementById("start-btn").onclick = () => {
    startScreen.classList.add("hidden");
    audio.play();
    init();
};

document.getElementById("restart-btn").onclick = () => {
    window.location.reload();
};

// ---------- INICIAR ESCENA ----------
function init() {
    scene = new THREE.Scene();

    // Cámara = "ojo del conductor"
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 200);
    camera.position.set(0, 1.6, 0);

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    document.body.appendChild(VRButton.createButton(renderer));

    // Luz
    const light = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
    scene.add(light);

    createRoad();
    spawnGems();
    spawnObstacles();

    renderer.setAnimationLoop(gameLoop);
}

// ---------- CARRETERA ----------
function createRoad() {
    const geometry = new THREE.PlaneGeometry(10, 500);
    const material = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const road = new THREE.Mesh(geometry, material);

    road.rotation.x = -Math.PI / 2;
    road.position.z = -200;
    scene.add(road);
}

// ---------- GEMAS ----------
function spawnGems() {
    const gemGeo = new THREE.IcosahedronGeometry(0.25, 1);
    const gemMat = new THREE.MeshStandardMaterial({ color: 0x00fff2 });

    for (let i = 0; i < 30; i++) {
        const gem = new THREE.Mesh(gemGeo, gemMat);
        gem.position.set(
            (Math.random() - 0.5) * 4,
            1,
            -10 - Math.random() * 150
        );
        scene.add(gem);
        gems.push(gem);
    }
}

// ---------- OBSTÁCULOS ----------
function spawnObstacles() {
    const boxGeo = new THREE.BoxGeometry(1.2, 1.2, 1.2);
    const boxMat = new THREE.MeshStandardMaterial({ color: 0xff0044 });

    for (let i = 0; i < 20; i++) {
        const box = new THREE.Mesh(boxGeo, boxMat);
        box.position.set(
            (Math.random() - 0.5) * 6,
            1,
            -15 - Math.random() * 150
        );
        scene.add(box);
        obstacles.push(box);
    }
}

// ---------- GAME LOOP ----------
function gameLoop() {
    if (isGameOver) return;

    // Movimiento de carretera (movemos la escena hacia atrás)
    scene.position.z += speed;

    // Leer joystick del mando derecho
    const session = renderer.xr.getSession();
    if (session) {
        const input = session.inputSources[0];
        if (input && input.gamepad) {
            const xAxis = input.gamepad.axes[0];

            // Mover auto izquierda / derecha
            camera.position.x += xAxis * 0.12;
            camera.position.x = THREE.MathUtils.clamp(camera.position.x, -4, 4);
        }
    }

    // Colisiones con gemas
    gems.forEach((gem, i) => {
        gem.rotation.y += 0.03;

        if (gem.position.distanceTo(camera.position) < 1) {
            scene.remove(gem);
            gems.splice(i, 1);
            score++;
        }
    });

    // Colisiones con obstáculos (GAME OVER)
    obstacles.forEach(obs => {
        if (obs.position.distanceTo(camera.position) < 1.2) {
            gameOver();
        }
    });

    renderer.render(scene, camera);
}

// ---------- FIN DEL JUEGO ----------
function gameOver() {
    isGameOver = true;
    finalScore.textContent = `Gemas recolectadas: ${score}`;
    endScreen.classList.remove("hidden");
}
