let scene, camera, renderer;
let gems = [];
let obstacles = [];
let score = 0;
let speed = 0.1;
let gameOver = false;

const audio = new Audio("assets/fondo.mp3");
audio.loop = true;

// ELEMENTOS
const canvas = document.getElementById("xr-canvas");
const startScreen = document.getElementById("start-screen");
const endScreen = document.getElementById("end-screen");
const finalScore = document.getElementById("final-score");

// BOTÓN INICIAR
document.getElementById("start-btn").onclick = () => {
    start();
};

// BOTÓN REINICIAR
document.getElementById("restart-btn").onclick = () => {
    window.location.reload();
};

// ---------------------- INICIO ----------------------
function start() {
    startScreen.classList.add("hidden");
    audio.play();
    init();
}

// ---------------------- INIT ------------------------
function init() {
    scene = new THREE.Scene();

    // Cámara = ojos del jugador
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 200);
    camera.position.set(0, 1.6, 3);

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;

    document.body.appendChild(VRButton.createButton(renderer));

    // LUZ
    const light = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
    scene.add(light);

    createRoad();
    spawnGems();
    spawnObstacles();

    renderer.setAnimationLoop(gameLoop);
}

// ---------------------- CARRETERA ----------------------
function createRoad() {
    const geo = new THREE.PlaneGeometry(10, 500);
    const mat = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const road = new THREE.Mesh(geo, mat);
    road.rotation.x = -Math.PI / 2;
    road.position.z = -200;
    scene.add(road);
}

// ---------------------- GEMAS ----------------------
function spawnGems() {
    const geo = new THREE.IcosahedronGeometry(0.25, 1);
    const mat = new THREE.MeshStandardMaterial({ color: 0x00fff2 });

    for (let i = 0; i < 40; i++) {
        const gem = new THREE.Mesh(geo, mat);
        gem.position.set(
            (Math.random() - 0.5) * 6,
            1,
            -5 - Math.random() * 150
        );
        scene.add(gem);
        gems.push(gem);
    }
}

// ---------------------- OBSTÁCULOS ----------------------
function spawnObstacles() {
    const geo = new THREE.BoxGeometry(1.3, 1.3, 1.3);
    const mat = new THREE.MeshStandardMaterial({ color: 0xff0033 });

    for (let i = 0; i < 25; i++) {
        const box = new THREE.Mesh(geo, mat);
        box.position.set(
            (Math.random() - 0.5) * 6,
            1,
            -10 - Math.random() * 150
        );
        scene.add(box);
        obstacles.push(box);
    }
}

// ---------------------- LOOP ----------------------
function gameLoop() {
    if (gameOver) return;

    // Avance automático del mundo
    scene.position.z += speed;

    // Joystick del control derecho
    const session = renderer.xr.getSession();
    if (session) {
        session.inputSources.forEach((input) => {
            if (input && input.gamepad && input.handedness === "right") {
                const x = input.gamepad.axes[0];
                camera.position.x += x * 0.15;
                camera.position.x = THREE.MathUtils.clamp(camera.position.x, -4, 4);
            }
        });
    }

    // Gemas
    gems.forEach((gem, i) => {
        gem.rotation.y += 0.03;

        if (gem.position.distanceTo(camera.position) < 1) {
            scene.remove(gem);
            gems.splice(i, 1);
            score++;
        }
    });

    // Obstáculos → Game Over
    obstacles.forEach((obs) => {
        if (obs.position.distanceTo(camera.position) < 1.1) {
            endGame();
        }
    });

    renderer.render(scene, camera);
}

// ---------------------- FIN ----------------------
function endGame() {
    gameOver = true;
    finalScore.textContent = `Gemas recolectadas: ${score}`;
    endScreen.classList.remove("hidden");
}
