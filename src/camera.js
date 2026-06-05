import * as THREE from 'three'
import { log } from './log.js'
import { shelfConfig } from './shelf.js'

const MOD = 'Camera'

export const LEVEL1_POS = new THREE.Vector3(15, 15, 17)
export const LEVEL1_LOOKAT = new THREE.Vector3(0, 0, 8)
export const LEVEL1_FOV = 50

export const LEVEL2_POS = new THREE.Vector3(0, 3, 0)
export const LEVEL2_LOOKAT = new THREE.Vector3(0, 1.5, 0)
export const LEVEL2_FOV = 80

export const LEVEL3_FOV = 40
export const LEVEL3_PULL_DISTANCE = 5

export const LEVEL1_PAN_BOUNDS = { minX: -14, maxX: 14, minZ: -4, maxZ: 19 }

export function computeL1PanBounds() {
  const halfWidth = shelfConfig.shelfWidth / 2
  const storeZstart = -shelfConfig.shelfDepth * 1.5
  const numPairs = Math.ceil(shelfConfig.numShelfUnits / 2)
  const storeZend = (numPairs - 1) * shelfConfig.aisleSpacingZ + shelfConfig.shelfDepth / 2
  return {
    minX: -(halfWidth + 2),
    maxX: halfWidth + 2,
    minZ: storeZstart - 2,
    maxZ: storeZend + 2
  }
}

export function createCamera() {
  const camera = new THREE.PerspectiveCamera(
    LEVEL1_FOV,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  )
  camera.position.copy(LEVEL1_POS)
  camera.lookAt(LEVEL1_LOOKAT)
  log.info(MOD, `Camera created — pos(${LEVEL1_POS.x},${LEVEL1_POS.y},${LEVEL1_POS.z}) FOV=${LEVEL1_FOV}°`)
  return camera
}

export function updateCameraAspect(camera) {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
}

export function lerpFOV(camera, targetFOV, speed) {
  camera.fov += (targetFOV - camera.fov) * speed
  camera.updateProjectionMatrix()
}
