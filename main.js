let scene, camera, renderer;
let score = 0;
let running = false;
let gameOver = false;
let gems = [];
let blocks = [];

const scoreEl = document.getElementById("score");
const uiStart = document.getElementById("uiStart");
const uiEnd = document.getElementById("uiEnd");
const hud = document.getElementById("hud");
const finalScore = document.getElementById("finalScore");

const startBtn = document.getElementById("startBtn");
const endBtn = document.getElementById("endBtn");
const restartBtn = document.getElementById("restartBtn");
const enterVrBtn = document.getElementById("enterVrBtn");

startBtn.onclick = startGame;
restartBtn.onclick = () => location.reload();
endBtn.onclick = endGame;
enterVrBtn.onclick = enterVR;

function enterVR(){
    if(!navigator.xr){
        alert("Este navegador no soporta WebXR");
        return;
    }
    navigator.xr.requestSession("immersive-vr", { requiredFeatures:["local-floor"] })
    .then(session=>{
        renderer.xr.enabled = true;
        renderer.xr.setSession(session);
        uiStart.classList.add("hidden");
    })
    .catch(err=>alert("No se pudo iniciar VR: " + err));
}

init();
function init(){
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(70, window.innerWidth/window.innerHeight, 0.1, 200);
    camera.position.set(0,1.6,2);

    renderer = new THREE.WebGLRenderer({canvas:document.getElementById("glCanvas"), antialias:true});
    renderer.setSize(window.innerWidth, window.innerHeight);

    const light = new THREE.DirectionalLight(0xffffff,1);
    light.position.set(2,4,1);
    scene.add(light);

    createTunnel();
    spawnGems();
    spawnBlocks();

    window.addEventListener("resize", ()=>{
        camera.aspect = window.innerWidth/window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    renderer.setAnimationLoop(gameLoop);
}

function createTunnel(){
    const geo = new THREE.CylinderGeometry(8,8,200,32,8,true);
    const mat = new THREE.MeshStandardMaterial({
        color:0x08131d,
        side:THREE.BackSide
    });
    const tunnel = new THREE.Mesh(geo,mat);
    tunnel.rotation.z = Math.PI/2;
    scene.add(tunnel);
}

function spawnGems(){
    const g = new THREE.SphereGeometry(0.25,16,16);
    const m = new THREE.MeshStandardMaterial({color:0x00ffcc, emissive:0x004433});

    for(let i=0;i<50;i++){
        const mesh = new THREE.Mesh(g,m.clone());
        mesh.position.set((Math.random()-0.5)*6, (Math.random()-0.5)*2 + 1.6, -i*4);
        scene.add(mesh);
        gems.push(mesh);
    }
}

function spawnBlocks(){
    const g = new THREE.BoxGeometry(1,1,1);
    for(let i=0;i<30;i++){
        const m = new THREE.MeshStandardMaterial({color:0xff0040});
        const cube = new THREE.Mesh(g,m);
        cube.position.set((Math.random()-0.5)*6,1.6,-i*6-10);
        scene.add(cube);
        blocks.push(cube);
    }
}

function startGame(){
    if(running) return;
    uiStart.classList.add("hidden");
    hud.classList.remove("hidden");
    running = true;
}

function endGame(){
    running = false;
    gameOver = true;
    hud.classList.add("hidden");
    finalScore.innerText = "Puntos: " + score;
    uiEnd.classList.remove("hidden");
}

function handleMovement(){
    const session = renderer.xr.getSession();
    let moveX = 0;

    if(session){
        for(const src of session.inputSources){
            if(!src.gamepad) continue;
            const ax = src.gamepad.axes[2] || src.gamepad.axes[0] || 0;
            moveX = ax * 0.05;
        }
    }

    camera.position.x = THREE.MathUtils.clamp(camera.position.x + moveX, -4, 4);
}

function gameLoop(){
    if(running && !gameOver){
        handleMovement();

        // Move world towards camera
        gems.forEach(g => {
            g.position.z += 0.1;
            if(g.position.distanceTo(camera.position) < 0.6){
                score++;
                scoreEl.innerText = score;
                g.position.z = -200;
            }
        });

        blocks.forEach(b=>{
            b.position.z += 0.1;
            if(b.position.distanceTo(camera.position) < 1){
                endGame();
            }
        });
    }

    renderer.render(scene,camera);
}
