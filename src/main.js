import './style.css'
import * as THREE from 'three'

// --- Scene ---
const scene = new THREE.Scene()
scene.background = new THREE.Color(0xf0f0f0)

// --- Camera (orthographic, isometric-style) ---
const frustumSize = 15
const aspect = window.innerWidth / window.innerHeight

const camera = new THREE.OrthographicCamera(
  frustumSize * aspect / -2,
  frustumSize * aspect / 2,
  frustumSize / 2,
  frustumSize / -2,
  0.1,
  1000
)
camera.position.set(10, 10, 10)
camera.lookAt(0, 0, 0)

// --- Renderer ---
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setPixelRatio(window.devicePixelRatio)
document.body.appendChild(renderer.domElement)

// --- Lighting ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
scene.add(ambientLight)

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
directionalLight.position.set(5, 10, 7)
scene.add(directionalLight)

// --- Floor ---
const floorGeometry = new THREE.PlaneGeometry(20, 20)
const floorMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc })
const floor = new THREE.Mesh(floorGeometry, floorMaterial)
floor.rotation.x = -Math.PI / 2
scene.add(floor)

// --- Trolley ---
const trolleyGeometry = new THREE.BoxGeometry(1, 1, 1)
const trolleyMaterial = new THREE.MeshStandardMaterial({ color: 0xff3333 })
const trolley = new THREE.Mesh(trolleyGeometry, trolleyMaterial)
trolley.position.set(0, 0.5, 0)
scene.add(trolley)

// --- Input (Raycasting) ---
const raycaster = new THREE.Raycaster()
const mouse = new THREE.Vector2()
const targetPosition = new THREE.Vector3(0, 0.5, 0)

window.addEventListener('pointerdown', (event) => {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1

  raycaster.setFromCamera(mouse, camera)
  const intersects = raycaster.intersectObject(floor)

  if (intersects.length > 0) {
    targetPosition.copy(intersects[0].point)
    targetPosition.y = 0.5
  }
})

// --- Resize ---
window.addEventListener('resize', () => {
  const aspect = window.innerWidth / window.innerHeight
  camera.left = frustumSize * aspect / -2
  camera.right = frustumSize * aspect / 2
  camera.top = frustumSize / 2
  camera.bottom = frustumSize / -2
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})

// --- Animation Loop ---
function animate() {
  requestAnimationFrame(animate)

  if (trolley.position.distanceTo(targetPosition) > 0.1) {
    trolley.position.lerp(targetPosition, 0.1)
  }

  renderer.render(scene, camera)
}

animate()
