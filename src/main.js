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

// --- Render once to confirm everything works ---
renderer.render(scene, camera)
