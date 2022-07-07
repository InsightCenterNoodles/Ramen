
function on_entity_create(state) {
    console.log("Hello!")


    if (!('dataready' in state)) {
        
    }
}

function is_buffer_ready()

function mark_buffer_ready(state, bytes) {
    state.dataready = true
    state.bytes = bytes
}

function on_buffer_create(state) {    
    console.log(state)

    if ("inline_bytes" in state) {
        mark_buffer_ready(state, state.inline_bytes)
    } else {

    }
}

client = NOO.connect("ws://localhost:50000",
    {
        entity : { on_create : on_entity_create },
        buffer : { on_create : on_buffer_create },
    }
)

width = 720 // window.innerWidth
height = 512

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera( 75, width / height, 0.1, 1000 );

const renderer = new THREE.WebGLRenderer();
renderer.setSize( width, height );
document.body.appendChild( renderer.domElement );

const geometry = new THREE.BoxGeometry( 1, 1, 1 );
const material = new THREE.MeshBasicMaterial( { color: 0x00ff00 } );
const cube = new THREE.Mesh( geometry, material );
scene.add( cube );

camera.position.z = 5;

function animate() {
	requestAnimationFrame( animate );
    cube.rotation.x += 0.01;
    cube.rotation.y += 0.01;
	renderer.render( scene, camera );
}

animate();