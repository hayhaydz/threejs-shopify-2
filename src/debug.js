import Stats from 'stats.js'
import GUI from 'lil-gui'
import * as THREE from 'three'
import { log } from './log.js'
import { shelfConfig, getAisleSpacingZ, rebuildAisleSystem, getStoreStats, getAllProducts, getWorldPositionFromInstance, hideInstance, spawnStandaloneMesh } from './shelf.js'
import { DOF_ENABLED_DEFAULTS } from './dof.js'

const MOD = 'Debug'

let stats = null
let gui = null
let axesHelper = null
let gridHelper = null
let sceneRef = null
let levelManagerRef = null
let dofRef = null

const _debounceTimers = {}
function debouncedLog(key, label, values, delay = 400) {
  clearTimeout(_debounceTimers[key])
  _debounceTimers[key] = setTimeout(() => {
    console.groupCollapsed(`[DOF] ${label}`)
    for (const [k, v] of Object.entries(values)) {
      console.log(`${k}:`, v)
    }
    console.groupEnd()
  }, delay)
}

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
  l1PanDamping: 0.92,
  l2PanDamping: 0.92,
  rotDamping: 0.95,
  trolleySpeed: 0.25,
  trolleyRotation: 0.15,
  gridOpacity: 0.25,
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
  rebuildStore: () => {},
  dofEnabled: false,
  dofFocus: 2.0,
  dofAperture: DOF_ENABLED_DEFAULTS.aperture,
  dofMaxBlur: DOF_ENABLED_DEFAULTS.maxblur
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
  readouts.storeDepth = parseFloat((Math.ceil(shelfConfig.numShelfUnits / 2) * getAisleSpacingZ() + shelfConfig.shelfDepth * 2 + shelfConfig.aisleGap).toFixed(1))
}

export function initDebug(camera, levelManager, scene, dof) {
  sceneRef = scene
  levelManagerRef = levelManager
  dofRef = dof

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
  moveFolder.add(settings, 'l1PanDamping', 0.8, 0.99, 0.01).name('L1 Pan Damping').listen().onChange(v => {
    levelManager._setL1PanDamping(v)
  })
  moveFolder.add(settings, 'l2PanDamping', 0.8, 0.99, 0.01).name('L2 Pan Damping').listen().onChange(v => {
    levelManager._setL2PanDamping(v)
  })
  moveFolder.add(settings, 'rotDamping', 0.8, 0.99, 0.01).name('L3 Rot Damping').listen().onChange(v => {
    levelManager._setRotDamping(v)
  })

  const dofFolder = camFolder.addFolder('Depth of Field')
  dofFolder.add(settings, 'dofEnabled').name('Enabled').onChange(v => {
    if (dofRef) {
      dofRef.enabled = v
      dofRef.bokehPass.enabled = v
      if (v) {
        dofRef.bokehPass.uniforms['focus'].value = settings.dofFocus
        dofRef.bokehPass.uniforms['aperture'].value = settings.dofAperture
        dofRef.bokehPass.uniforms['maxblur'].value = settings.dofMaxBlur
      }
    }
    debouncedLog('dof-toggle', 'DOF Toggled', { enabled: v })
  })
  dofFolder.add(settings, 'dofFocus', 0.1, 20, 0.1).name('Focus Distance').listen().onChange(v => {
    if (dofRef) {
      dofRef.manualFocus = true
      if (!dofRef.enabled) {
        dofRef.enabled = true
        dofRef.bokehPass.enabled = true
        settings.dofEnabled = true
      }
      dofRef.bokehPass.uniforms['focus'].value = v
    }
    debouncedLog('dof-focus', 'Focus Changed', { focus: v })
  })
  dofFolder.add(settings, 'dofAperture', 0.0001, 0.02, 0.0001).name('Aperture').listen().onChange(v => {
    if (dofRef) {
      if (!dofRef.enabled) {
        dofRef.enabled = true
        dofRef.bokehPass.enabled = true
        settings.dofEnabled = true
      }
      dofRef.bokehPass.uniforms['aperture'].value = v
    }
    debouncedLog('dof-aperture', 'Aperture Changed', { aperture: v })
  })
  dofFolder.add(settings, 'dofMaxBlur', 0.001, 0.05, 0.001).name('Max Blur').listen().onChange(v => {
    if (dofRef) {
      if (!dofRef.enabled) {
        dofRef.enabled = true
        dofRef.bokehPass.enabled = true
        settings.dofEnabled = true
      }
      dofRef.bokehPass.uniforms['maxblur'].value = v
    }
    debouncedLog('dof-maxblur', 'Max Blur Changed', { maxblur: v })
  })

  const levelFolder = gui.addFolder('Level')
  levelFolder.add(settings, 'currentLevel').name('Current').listen().disable()
  levelFolder.add(settings, 'lerpSpeed', 0.01, 0.2, 0.005).name('Lerp Speed').onChange(v => {
    levelManager._setLerpSpeed(v)
  })
  levelFolder.add(settings, 'forceL1').name('→ L1 Overview')
  levelFolder.add(settings, 'forceL2').name('→ L2 Side-On')
  levelFolder.add(settings, 'forceL3').name('→ L3 Inspect')

  const trolleyFolder = gui.addFolder('Trolley')
  trolleyFolder.add(settings, 'trolleySpeed', 0.05, 0.5, 0.01).name('Speed').listen().onChange(v => {
    levelManager._setTrolleySpeed(v)
  })
  trolleyFolder.add(settings, 'trolleyRotation', 0.05, 0.4, 0.01).name('Rotation').listen().onChange(v => {
    levelManager._setTrolleyRotationSpeed(v)
  })

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
  aisleFolder.add(shelfConfig, 'shelfDepth', 0.5, 4.0, 0.1).name('Shelf Depth').listen()
  aisleFolder.add(readouts, 'storeWidth').name('Store Width').listen().disable()
  aisleFolder.add(readouts, 'storeDepth').name('Store Depth').listen().disable()
  aisleFolder.add(settings, 'rebuildStore').name('⟳ Rebuild Store')

  const debugFolder = gui.addFolder('Debug')
  debugFolder.add(settings, 'gridOpacity', 0.05, 0.8, 0.05).name('Grid Opacity').listen().onChange(v => {
    levelManager._setGridOpacity(v)
  })
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

  const { cellSize } = shelfConfig
  const gridWorldWidth = levelManagerRef.gridCols * cellSize
  const gridWorldDepth = levelManagerRef.gridRows * cellSize
  const gridSize = Math.max(gridWorldWidth, gridWorldDepth)
  const divisions = gridSize / cellSize
  const centerX = levelManagerRef.gridOriginX + gridWorldWidth / 2
  const centerZ = levelManagerRef.gridOriginZ + gridWorldDepth / 2
  gridHelper = new THREE.GridHelper(gridSize, divisions, 0x888888, 0xcccccc)
  gridHelper.position.set(centerX, 0.01, centerZ)
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
  settings.l1PanDamping = levelManager.l1PanDamping
  settings.l2PanDamping = levelManager.l2PanDamping
  settings.rotDamping = levelManager.rotDamping
  settings.trolleySpeed = levelManager.trolleySpeed
  settings.trolleyRotation = levelManager.trolleyRotationSpeed
  if (levelManager.gridTileMesh) {
    settings.gridOpacity = levelManager.gridTileMesh.material.opacity
  }
  if (dofRef && dofRef.enabled && !dofRef.manualFocus) {
    settings.dofFocus = parseFloat(dofRef.bokehPass.uniforms['focus'].value.toFixed(2))
  }
}

export function resetDOFSettings(dof) {
  settings.dofEnabled = false
  settings.dofFocus = 2.0
  settings.dofAperture = DOF_ENABLED_DEFAULTS.aperture
  settings.dofMaxBlur = DOF_ENABLED_DEFAULTS.maxblur
  if (dof) {
    dof.disable()
    dof.reset()
  }
}
