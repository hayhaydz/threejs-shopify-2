import Stats from 'stats.js'
import GUI from 'lil-gui'
import * as THREE from 'three'
import { log } from './log.js'
import { shelfConfig, rebuildAisleSystem, getStoreStats, getAllProducts, getWorldPositionFromInstance, hideInstance, spawnStandaloneMesh } from './shelf.js'

const MOD = 'Debug'

let stats = null
let gui = null
let axesHelper = null
let gridHelper = null
let sceneRef = null
let levelManagerRef = null

const readouts = {
  shelfUnits: 0,
  products: 0,
  hiddenShelves: 0,
  storeWidth: 0,
  storeDepth: 0
}

const settings = {
  showStats: true,
  showAxes: false,
  showGrid: true,
  showClickZones: false,
  cameraFOV: 30,
  cameraPosX: 0,
  cameraPosY: 15,
  cameraPosZ: 19,
  cameraRotX: 0,
  cameraRotY: 0,
  cameraRotZ: 0,
  lerpSpeed: 0.05,
  l1PanSpeed: 0.01,
  l2PanSpeed: 0.01,
  l2PanClamp: 8,
  ambientIntensity: 0.6,
  dirIntensity: 0.8,
  dirPosX: 5,
  dirPosY: 12,
  dirPosZ: 11,
  wireframe: false,
  currentLevel: 'OVERVIEW',
  forceL1: () => {},
  forceL2: () => {},
  forceL3: () => {},
  rebuildStore: () => {}
}

function doRebuild() {
  const result = rebuildAisleSystem(sceneRef, levelManagerRef)
  updateReadouts(result.stats)
}

function updateReadouts(stats) {
  if (!stats) {
    const aisleSystem = sceneRef.children.find(c => c.name === 'aisleSystem')
    if (aisleSystem) stats = getStoreStats(aisleSystem)
    else return
  }
  readouts.shelfUnits = stats.shelves
  readouts.products = stats.products
  readouts.hiddenShelves = stats.hiddenShelves
  readouts.storeWidth = shelfConfig.shelfWidth
  readouts.storeDepth = parseFloat((Math.ceil(shelfConfig.numShelfUnits / 2) * shelfConfig.aisleSpacingZ + shelfConfig.shelfDepth * 2 + shelfConfig.aisleGap).toFixed(1))
}

export function initDebug(camera, levelManager, scene) {
  sceneRef = scene
  levelManagerRef = levelManager

  stats = new Stats()
  stats.showPanel(0)
  stats.dom.style.left = '0px'
  stats.dom.style.top = '0px'
  document.body.appendChild(stats.dom)
  log.info(MOD, 'Stats.js initialized')

  gui = new GUI({ title: 'Scene Debug', width: 320 })
  log.info(MOD, 'lil-gui initialized')

  settings.cameraFOV = camera.fov
  settings.cameraPosX = camera.position.x
  settings.cameraPosY = camera.position.y
  settings.cameraPosZ = camera.position.z
  settings.cameraRotX = parseFloat(THREE.MathUtils.radToDeg(camera.rotation.x).toFixed(1))
  settings.cameraRotY = parseFloat(THREE.MathUtils.radToDeg(camera.rotation.y).toFixed(1))
  settings.cameraRotZ = parseFloat(THREE.MathUtils.radToDeg(camera.rotation.z).toFixed(1))

  settings.forceL1 = () => {
    levelManager.transitionTo(1)
  }
  settings.forceL2 = () => {
    levelManager.transitionTo(2)
  }
  settings.forceL3 = () => {
    if (levelManager.currentLevel !== 2) {
      log.warn(MOD, 'Force L3 requires being in L2 first')
      return
    }
    const aisleSystem = scene.children.find(c => c.name === 'aisleSystem')
    if (!aisleSystem) return
    const products = getAllProducts(aisleSystem)
    const visible = products.find(p => !p.isHidden)
    if (visible) {
      const worldPos = getWorldPositionFromInstance(visible.shelfGroup, visible.meshType, visible.instanceId)
      if (!worldPos) return
      hideInstance(visible.shelfGroup, visible.meshType, visible.instanceId)
      const standalone = spawnStandaloneMesh(visible.meshType, worldPos, visible.scale, visible.color)
      scene.add(standalone)
      levelManager._instanceRef = {
        shelfGroup: visible.shelfGroup,
        meshType: visible.meshType,
        instanceId: visible.instanceId,
        entry: visible
      }
      levelManager._selectProduct(standalone)
    }
  }

  settings.rebuildStore = () => {
    doRebuild()
  }

  updateReadouts()

  const camFolder = gui.addFolder('Camera')
  camFolder.add(settings, 'cameraFOV', 1, 120, 0.5).name('FOV').onChange(v => {
    camera.fov = v
    camera.updateProjectionMatrix()
  })
  camFolder.add(settings, 'cameraPosX', -30, 30, 0.1).name('Pos X').onChange(v => { camera.position.x = v })
  camFolder.add(settings, 'cameraPosY', 0, 30, 0.1).name('Pos Y').onChange(v => { camera.position.y = v })
  camFolder.add(settings, 'cameraPosZ', -30, 30, 0.1).name('Pos Z').onChange(v => { camera.position.z = v })
  camFolder.add(settings, 'cameraRotX', -180, 180, 1).name('Pitch (°)').onChange(v => {
    camera.rotation.x = THREE.MathUtils.degToRad(v)
  })
  camFolder.add(settings, 'cameraRotY', -180, 180, 1).name('Yaw (°)').onChange(v => {
    camera.rotation.y = THREE.MathUtils.degToRad(v)
  })
  camFolder.add(settings, 'cameraRotZ', -180, 180, 1).name('Roll (°)').onChange(v => {
    camera.rotation.z = THREE.MathUtils.degToRad(v)
  })

  const moveFolder = camFolder.addFolder('Movement')
  moveFolder.add(settings, 'l1PanSpeed', 0.001, 0.05, 0.001).name('L1 Pan Speed').listen().onChange(v => {
    levelManager._setL1PanSpeed(v)
  })
  moveFolder.add(settings, 'l2PanSpeed', 0.001, 0.05, 0.001).name('L2 Pan Speed').listen().onChange(v => {
    levelManager._setL2PanSpeed(v)
  })
  moveFolder.add(settings, 'l2PanClamp', 2, 20, 0.5).name('L2 Pan Clamp').listen().onChange(v => {
    levelManager._setL2PanClamp(v)
  })

  const levelFolder = gui.addFolder('Level')
  levelFolder.add(settings, 'currentLevel').name('Current').listen().disable()
  levelFolder.add(settings, 'lerpSpeed', 0.01, 0.2, 0.005).name('Lerp Speed').onChange(v => {
    levelManager._setLerpSpeed(v)
  })
  levelFolder.add(settings, 'forceL1').name('→ L1 Overview')
  levelFolder.add(settings, 'forceL2').name('→ L2 Side-On')
  levelFolder.add(settings, 'forceL3').name('→ L3 Inspect')

  const ambientLight = scene.children.find(c => c.isAmbientLight)
  const dirLight = scene.children.find(c => c.isDirectionalLight)
  const lightFolder = gui.addFolder('Lighting')
  if (ambientLight) {
    lightFolder.add(settings, 'ambientIntensity', 0, 2, 0.05).name('Ambient').onChange(v => {
      ambientLight.intensity = v
    })
  }
  if (dirLight) {
    lightFolder.add(settings, 'dirIntensity', 0, 2, 0.05).name('Dir Intensity').onChange(v => {
      dirLight.intensity = v
    })
    lightFolder.add(settings, 'dirPosX', -20, 20, 0.5).name('Dir X').onChange(v => { dirLight.position.x = v })
    lightFolder.add(settings, 'dirPosY', 0, 20, 0.5).name('Dir Y').onChange(v => { dirLight.position.y = v })
    lightFolder.add(settings, 'dirPosZ', -20, 20, 0.5).name('Dir Z').onChange(v => { dirLight.position.z = v })
  }

  const productFolder = gui.addFolder('Shelf Products')
  productFolder.add(shelfConfig, 'productsPerTier', 12, 200, 1).name('Products / Tier').listen()
  productFolder.add(shelfConfig, 'depthRows', 1, 20, 1).name('Depth Rows').listen()
  productFolder.add(shelfConfig, 'numTiers', 1, 12, 1).name('Num Tiers').listen()
  productFolder.add(shelfConfig, 'shelfHeight', 1.0, 10.0, 0.1).name('Shelf Height').listen()
  productFolder.add(shelfConfig, 'productScaleMin', 0.3, 1.0, 0.05).name('Scale Min').listen()
  productFolder.add(shelfConfig, 'productScaleRange', 0.1, 1.5, 0.05).name('Scale Range').listen()
  productFolder.add(shelfConfig, 'skipHiddenProducts').name('Skip Hidden').listen()
  productFolder.add(readouts, 'shelfUnits').name('Shelf Units').listen().disable()
  productFolder.add(readouts, 'products').name('Products').listen().disable()
  productFolder.add(readouts, 'hiddenShelves').name('Hidden Shelves').listen().disable()
  productFolder.add(settings, 'wireframe').name('Wireframe').onChange(v => {
    scene.traverse(c => {
      if (c.isMesh && c.material) {
        c.material.wireframe = v
      }
    })
  })

  const aisleFolder = gui.addFolder('Aisle Layout')
  aisleFolder.add(shelfConfig, 'numShelfUnits', 1, 32, 1).name('Shelf Units').listen()
  aisleFolder.add(shelfConfig, 'shelfWidth', 6, 60, 0.5).name('Aisle Length').listen()
  aisleFolder.add(shelfConfig, 'aisleGap', 2.0, 12.0, 0.1).name('Aisle Gap').listen()
  aisleFolder.add(shelfConfig, 'aisleSpacingZ', 3.0, 16.0, 0.1).name('Aisle Spacing').listen()
  aisleFolder.add(shelfConfig, 'shelfDepth', 0.5, 4.0, 0.1).name('Shelf Depth').listen()
  aisleFolder.add(readouts, 'storeWidth').name('Store Width').listen().disable()
  aisleFolder.add(readouts, 'storeDepth').name('Store Depth').listen().disable()
  aisleFolder.add(settings, 'rebuildStore').name('⟳ Rebuild Store')

  const debugFolder = gui.addFolder('Debug')
  debugFolder.add(settings, 'showStats').name('Stats Panel').onChange(v => {
    stats.dom.style.display = v ? 'block' : 'none'
  })
  debugFolder.add(settings, 'showAxes').name('Axes Helper').onChange(v => {
    if (axesHelper) axesHelper.visible = v
  })
  debugFolder.add(settings, 'showGrid').name('Grid Helper').onChange(v => {
    if (gridHelper) gridHelper.visible = v
  })
  debugFolder.add(settings, 'showClickZones').name('Click Zones').onChange(v => {
    shelfConfig.showClickZones = v
    const aisleSystem = sceneRef.children.find(c => c.name === 'aisleSystem')
    if (aisleSystem) {
      aisleSystem.traverse(c => {
        if (c.userData?.clickZone && c.material) {
          c.material.visible = v
        }
      })
    }
  })

  axesHelper = new THREE.AxesHelper(5)
  axesHelper.visible = settings.showAxes
  scene.add(axesHelper)

  gridHelper = new THREE.GridHelper(28, 28, 0x888888, 0xcccccc)
  gridHelper.position.set(0, 0.01, 11)
  gridHelper.visible = settings.showGrid
  scene.add(gridHelper)

  log.info(MOD, 'Debug setup complete — axes/grid helpers added, GUI populated')
}

export function beginFrame() {
  if (stats) stats.begin()
}

export function endFrame() {
  if (stats) stats.end()
}

export function syncSettings(levelManager, camera) {
  if (!levelManager) return
  const state = levelManager.getState()
  const LEVEL_NAMES = { 1: 'OVERVIEW', 2: 'SIDE_ON', 3: 'INSPECT' }
  settings.currentLevel = `${state.level} (${LEVEL_NAMES[state.level] || '?'})`
  if (camera) {
    settings.cameraPosX = camera.position.x
    settings.cameraPosY = camera.position.y
    settings.cameraPosZ = camera.position.z
    settings.cameraRotX = parseFloat(THREE.MathUtils.radToDeg(camera.rotation.x).toFixed(1))
    settings.cameraRotY = parseFloat(THREE.MathUtils.radToDeg(camera.rotation.y).toFixed(1))
    settings.cameraRotZ = parseFloat(THREE.MathUtils.radToDeg(camera.rotation.z).toFixed(1))
    settings.cameraFOV = camera.fov
  }
  settings.l1PanSpeed = levelManager.l1PanSpeed
  settings.l2PanSpeed = levelManager.l2PanSpeed
  settings.l2PanClamp = levelManager.l2PanClamp
}
