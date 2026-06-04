import * as THREE from 'three'
import { log } from './log.js'

const MOD = 'Scene'

export function createScene() {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0xe8e8e8)

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
  scene.add(ambientLight)

  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8)
  dirLight.position.set(5, 12, 11)
  scene.add(dirLight)

  const floorGeo = new THREE.PlaneGeometry(28, 28)
  const floorMat = new THREE.MeshStandardMaterial({ color: 0xcccccc })
  const floor = new THREE.Mesh(floorGeo, floorMat)
  floor.rotation.x = -Math.PI / 2
  floor.position.set(0, 0, 11)
  floor.name = 'floor'
  scene.add(floor)

  log.info(MOD, 'Scene created — 28x28 floor, ambient + directional lights')
  return scene
}

export function createRenderer() {
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(window.devicePixelRatio)
  document.body.appendChild(renderer.domElement)
  log.info(MOD, 'Renderer created')
  return renderer
}
