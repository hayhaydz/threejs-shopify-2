import './style.css'
import { createScene, createRenderer } from './scene.js'
import { createCamera, updateCameraAspect } from './camera.js'
import { createAisleSystem } from './shelf.js'
import { LevelManager } from './levels.js'
import { InputManager } from './input.js'
import { log } from './log.js'
import { initDebug, beginFrame, endFrame, syncSettings } from './debug.js'

const MOD = 'Main'

const scene = createScene()
const renderer = createRenderer()
const camera = createCamera()

const aisleSystem = createAisleSystem()
scene.add(aisleSystem)

const input = new InputManager(camera, renderer.domElement)
const levelManager = new LevelManager(camera, aisleSystem, input, scene)

initDebug(camera, levelManager, scene)

window.addEventListener('resize', () => {
  updateCameraAspect(camera)
  renderer.setSize(window.innerWidth, window.innerHeight)
  log.debug(MOD, `Resize: ${window.innerWidth}x${window.innerHeight}`)
})

function animate() {
  requestAnimationFrame(animate)
  beginFrame()
  levelManager.update()
  renderer.render(scene, camera)
  syncSettings(levelManager, camera)
  endFrame()
}

log.info(MOD, 'Starting animation loop')
animate()
