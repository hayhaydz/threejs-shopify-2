import * as THREE from 'three'
import {
  LEVEL1_POS, LEVEL1_LOOKAT, LEVEL1_FOV,
  LEVEL2_POS, LEVEL2_LOOKAT, LEVEL2_FOV,
  LEVEL3_FOV, LEVEL3_PULL_DISTANCE, lerpFOV,
  computeL1PanBounds
} from './camera.js'
import {
  getAllShelfGroups, shelfConfig,
  hideInstance, showInstance, spawnStandaloneMesh,
  getWorldPositionFromInstance, findProductByInstanceId,
  findShelfGroupForHit, getAllInstanceMeshes, sharedBoxGeo, sharedCylGeo
} from './shelf.js'
import { createTrolley } from './trolley.js'
import { showDimmer, hideDimmer, showCloseButton, hideCloseButton } from './ui.js'
import { log } from './log.js'

const MOD = 'Level'

export const Level = { OVERVIEW: 1, SIDE_ON: 2, INSPECT: 3 }
const LEVEL_NAMES = { 1: 'OVERVIEW', 2: 'SIDE_ON', 3: 'INSPECT' }

let LERP_SPEED = 0.05

function createFloorLabel(text) {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 128
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, 512, 128)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
  ctx.beginPath()
  ctx.roundRect(0, 0, 512, 128, 16)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 48px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 256, 64)

  const texture = new THREE.CanvasTexture(canvas)
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false })
  const geo = new THREE.PlaneGeometry(4, 1)
  const mesh = new THREE.Mesh(geo, material)
  mesh.rotation.x = -Math.PI / 2
  mesh.name = '__floorLabel__'
  return mesh
}

function createInstanceOutline(meshType, position, scale) {
  const geo = meshType === 'cyl' ? sharedCylGeo : sharedBoxGeo
  const outline = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color: 0x00aaff,
    side: THREE.BackSide
  }))
  outline.position.copy(position)
  outline.scale.set(scale * 1.08, scale * 1.08, scale * 1.08)
  outline.name = '__outline__'
  return outline
}

export class LevelManager {
  constructor(camera, aisleSystem, input, scene) {
    this.camera = camera
    this.aisleSystem = aisleSystem
    this.input = input
    this.scene = scene
    this.shelfGroups = getAllShelfGroups(aisleSystem)

    this.currentLevel = Level.OVERVIEW
    this.isTransitioning = false

    this.targetPos = LEVEL1_POS.clone()
    this.targetLookAt = LEVEL1_LOOKAT.clone()
    this.currentLookAt = LEVEL1_LOOKAT.clone()
    this.targetFOV = LEVEL1_FOV

    this.panOffsetX = 0
    this.activeAisleZ = 0

    this.l1CameraOffset = LEVEL1_POS.clone().sub(LEVEL1_LOOKAT)

    this.selectedProduct = null
    this.inspectTargetPos = new THREE.Vector3()
    this.isDraggingProduct = false

    this._instanceRef = null

    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
    this.isPanning = false
    this.frozenCamera = null
    this.panGrabPoint = new THREE.Vector3()
    this.panLookAtStart = new THREE.Vector3()
    this.panCameraStart = new THREE.Vector3()

    this.panBounds = computeL1PanBounds()
    this.l1PanSpeed = 0.01
    this.l2PanSpeed = 0.01
    this.l2PanClamp = 8

    this.hoveredPlane = null
    this.hoveredShelfUnit = null
    this.hoveredProductOutline = null
    this.hoveredProduct = null
    this.floorLabel = null

    this._buildGridPositions()

    this.trolley = createTrolley()
    this.trolleyTarget = new THREE.Vector3(0, 0, this.gridZPositions[1])
    this.trolley.position.copy(this.trolleyTarget)
    scene.add(this.trolley)

    this._setupInput()
    log.info(MOD, `Initialized — ${this.shelfGroups.length} shelf groups`)
  }

  _buildGridPositions() {
    this.gridXPositions = []
    const halfWidth = shelfConfig.shelfWidth / 2 - 1
    for (let x = -halfWidth; x <= halfWidth; x += 2) {
      this.gridXPositions.push(x)
    }

    const numPairs = Math.ceil(shelfConfig.numShelfUnits / 2)
    this.gridZPositions = [-1]
    for (let p = 0; p < numPairs; p++) {
      const pairZ = p * shelfConfig.aisleSpacingZ
      this.gridZPositions.push(parseFloat(pairZ.toFixed(1)))
      if (p < numPairs - 1) {
        const walkwayZ = pairZ + shelfConfig.shelfDepth / 2 + shelfConfig.aisleGap / 2
        this.gridZPositions.push(parseFloat(walkwayZ.toFixed(1)))
      }
    }
    const lastZ = (numPairs - 1) * shelfConfig.aisleSpacingZ + shelfConfig.shelfDepth / 2 + shelfConfig.aisleGap
    this.gridZPositions.push(parseFloat(lastZ.toFixed(1)))
  }

  _getClickZones() {
    const zones = []
    this.aisleSystem.traverse(c => {
      if (c.userData?.clickZone) zones.push(c)
    })
    return zones
  }

  _getInstanceMeshes() {
    return getAllInstanceMeshes(this.aisleSystem)
  }

  _clearHover() {
    if (this.hoveredPlane) {
      this.hoveredPlane.material.visible = shelfConfig.showClickZones
      this.hoveredPlane.material.color.setHex(0x00ff00)
      this.hoveredPlane.material.opacity = 0.15
      this.hoveredPlane = null
    }
    if (this.hoveredProductOutline) {
      if (this.hoveredProductOutline.parent) {
        this.hoveredProductOutline.parent.remove(this.hoveredProductOutline)
      }
      this.hoveredProductOutline.geometry = null
      this.hoveredProductOutline.material.dispose()
      this.hoveredProductOutline = null
    }
    if (this.floorLabel) {
      this.floorLabel.material.map.dispose()
      this.floorLabel.material.dispose()
      this.floorLabel.geometry.dispose()
      this.scene.remove(this.floorLabel)
      this.floorLabel = null
    }
    this.hoveredShelfUnit = null
    this.hoveredProduct = null
    document.body.style.cursor = 'default'
  }

  _isOccluded(raycaster, clickZoneHit) {
    const shelfHits = raycaster.intersectObjects(this.shelfGroups, true)
    if (shelfHits.length === 0) return false
    const closestShelfHit = shelfHits[0]
    return closestShelfHit.distance < clickZoneHit.distance
  }

  _hoverL1(raycaster) {
    const clickZones = this._getClickZones()
    const hits = raycaster.intersectObjects(clickZones, false)

    if (hits.length > 0) {
      const hit = hits[0]

      if (this._isOccluded(raycaster, hit)) {
        if (this.hoveredShelfUnit) {
          this._clearHover()
        }
        return
      }

      const shelfUnitIndex = hit.object.userData.shelfUnitIndex
      let shelfUnit = hit.object.parent
      while (shelfUnit && shelfUnit.name !== 'shelfUnit') {
        shelfUnit = shelfUnit.parent
      }

      if (shelfUnit && shelfUnit !== this.hoveredShelfUnit) {
        this._clearHover()
        this.hoveredShelfUnit = shelfUnit
        this.hoveredPlane = hit.object

        hit.object.material.visible = true
        hit.object.material.color.setHex(0x00aaff)
        hit.object.material.opacity = 0.2

        this.floorLabel = createFloorLabel(`Shelf ${shelfUnitIndex + 1}`)
        this.floorLabel.position.set(
          shelfUnit.position.x,
          0.02,
          shelfUnit.position.z + shelfConfig.shelfDepth * 1.5
        )
        this.scene.add(this.floorLabel)
      }

      document.body.style.cursor = 'pointer'
    } else {
      if (this.hoveredShelfUnit) {
        this._clearHover()
      }
    }
  }

  _hoverL2(raycaster) {
    const instanceMeshes = this._getInstanceMeshes()
    const hits = raycaster.intersectObjects(instanceMeshes, false)
    const productHit = hits.find(h => h.instanceId !== undefined && h.object.userData?.isInstancedProducts)

    if (productHit) {
      const { object, instanceId } = productHit
      const meshType = object.userData.productType
      const shelfGroup = findShelfGroupForHit(object)

      if (!shelfGroup) return

      const entry = findProductByInstanceId(shelfGroup, meshType, instanceId)
      if (!entry || entry.isHidden) return

      const productKey = `${shelfGroup.userData.shelfUnitIndex}-${meshType}-${instanceId}`
      if (productKey !== this.hoveredProduct) {
        this._clearHover()
        this.hoveredProduct = productKey

        const worldPos = getWorldPositionFromInstance(shelfGroup, meshType, instanceId)
        if (worldPos) {
          const outline = createInstanceOutline(meshType, worldPos, entry.scale)
          this.scene.add(outline)
          this.hoveredProductOutline = outline
        }
      }
      document.body.style.cursor = 'pointer'
    } else {
      if (this.hoveredProduct) {
        this._clearHover()
      }
    }
  }

  _hoverL3(raycaster) {

  }

  _setupInput() {
    this.input.onDragStart = (raycaster) => {
      if (this.currentLevel === Level.OVERVIEW && !this.isTransitioning) {
        this.isPanning = true
        this.frozenCamera = this.camera.clone()
        const intersection = new THREE.Vector3()
        raycaster.ray.intersectPlane(this.groundPlane, intersection)
        this.panGrabPoint.copy(intersection)
        this.panLookAtStart.copy(this.currentLookAt)
        this.panCameraStart.copy(this.camera.position)
        log.debug(MOD, 'L1 pan started')
      }
    }

    this.input.onDragMove = (delta, isDragging, raycaster, mouse) => {
      if (this.currentLevel === Level.SIDE_ON && !this.isTransitioning) {
        this.panOffsetX -= delta.x * this.l2PanSpeed
        this.panOffsetX = THREE.MathUtils.clamp(this.panOffsetX, -this.l2PanClamp, this.l2PanClamp)
      }
      if (this.currentLevel === Level.INSPECT && this.isDraggingProduct && this.selectedProduct) {
        this.selectedProduct.rotation.y += delta.x * 0.008
        this.selectedProduct.rotation.x += delta.y * 0.008
      }
      if (this.currentLevel === Level.OVERVIEW && this.isPanning && this.frozenCamera) {
        const frozenRaycaster = new THREE.Raycaster()
        frozenRaycaster.setFromCamera(mouse, this.frozenCamera)
        const currentPoint = new THREE.Vector3()
        if (frozenRaycaster.ray.intersectPlane(this.groundPlane, currentPoint)) {
          const worldDelta = new THREE.Vector3().subVectors(this.panGrabPoint, currentPoint)
          const newLookAt = this.panLookAtStart.clone().add(worldDelta)
          newLookAt.x = THREE.MathUtils.clamp(newLookAt.x, this.panBounds.minX, this.panBounds.maxX)
          newLookAt.z = THREE.MathUtils.clamp(newLookAt.z, this.panBounds.minZ, this.panBounds.maxZ)
          this.camera.position.copy(newLookAt).add(this.l1CameraOffset)
          this.currentLookAt.copy(newLookAt)
          this.camera.lookAt(this.currentLookAt)
        }
      }
    }

    this.input.onDragEnd = () => {
      this.isDraggingProduct = false
      if (this.isPanning) {
        this.isPanning = false
        if (this.frozenCamera) {
          this.frozenCamera = null
        }
        log.debug(MOD, 'L1 pan ended')
      }
    }

    this.input.onHover = (raycaster) => {
      if (this.isTransitioning) {
        this._clearHover()
        return
      }

      if (this.currentLevel === Level.OVERVIEW) {
        this._hoverL1(raycaster)
      } else if (this.currentLevel === Level.SIDE_ON) {
        this._hoverL2(raycaster)
      } else if (this.currentLevel === Level.INSPECT) {
        this._hoverL3(raycaster)
      }
    }

    this.input.onClick = (raycaster) => {
      if (this.isTransitioning) {
        log.debug(MOD, 'Click ignored — transitioning')
        return
      }

      if (this.currentLevel === Level.OVERVIEW) {
        const clickZones = this._getClickZones()
        const hits = raycaster.intersectObjects(clickZones, false)
        if (hits.length > 0) {
          const shelfUnitIndex = hits[0].object.userData.shelfUnitIndex
          const pairIndex = Math.floor(shelfUnitIndex / 2)
          this.activeAisleZ = pairIndex * shelfConfig.aisleSpacingZ
          log.info(MOD, `L1→L2: clicked shelf unit ${shelfUnitIndex} (pair ${pairIndex}) at z=${this.activeAisleZ.toFixed(1)}`)
          this.transitionTo(Level.SIDE_ON)
        } else {
          const floorHits = raycaster.intersectObjects(this.scene.children.filter(c => c.name === 'floor'), false)
          if (floorHits.length > 0) {
            const point = floorHits[0].point
            const snapped = this._snapToGrid(point.x, point.z)
            this.trolleyTarget.set(snapped.x, 0, snapped.z)
            log.info(MOD, `Trolley target set to grid (${snapped.x.toFixed(1)}, ${snapped.z.toFixed(1)})`)
          } else {
            log.debug(MOD, 'L1 click — no shelf or floor hit')
          }
        }
      } else if (this.currentLevel === Level.SIDE_ON) {
        const instanceMeshes = this._getInstanceMeshes()
        const hits = raycaster.intersectObjects(instanceMeshes, false)
        const productHit = hits.find(h => h.instanceId !== undefined && h.object.userData?.isInstancedProducts)

        if (productHit) {
          const { object, instanceId } = productHit
          const meshType = object.userData.productType
          const shelfGroup = findShelfGroupForHit(object)

          if (!shelfGroup) return

          const entry = findProductByInstanceId(shelfGroup, meshType, instanceId)
          if (!entry || entry.isHidden) return

          log.info(MOD, `L2→L3: clicked product "${entry.id}" (instance ${instanceId}, ${meshType})`)

          const worldPos = getWorldPositionFromInstance(shelfGroup, meshType, instanceId)
          if (!worldPos) return

          hideInstance(shelfGroup, meshType, instanceId)

          const standalone = spawnStandaloneMesh(meshType, worldPos, entry.scale, entry.color)
          this.scene.add(standalone)

          this._instanceRef = {
            shelfGroup,
            meshType,
            instanceId,
            entry
          }

          this._selectProduct(standalone)
        } else {
          log.debug(MOD, `L2 click — no product hit (${hits.length} total hits)`)
        }
      } else if (this.currentLevel === Level.INSPECT) {
        if (!this.selectedProduct) return
        const hits = raycaster.intersectObjects([this.selectedProduct], false)
        if (hits.length === 0) {
          log.info(MOD, 'L3 click-outside — returning to L2')
          this._returnToL2()
        } else {
          log.debug(MOD, 'L3 click on product — starting drag')
          this.isDraggingProduct = true
        }
      }
    }

    this.input.onEscape = () => {
      if (this.currentLevel === Level.INSPECT) {
        log.info(MOD, 'Escape — L3→L2')
        this._returnToL2()
      } else if (this.currentLevel === Level.SIDE_ON) {
        log.info(MOD, 'Escape — L2→L1')
        this.panOffsetX = 0
        this.transitionTo(Level.OVERVIEW)
      }
    }
  }

  transitionTo(level) {
    if (this.isTransitioning && level !== Level.OVERVIEW) return
    this.isTransitioning = true
    const fromLevel = LEVEL_NAMES[this.currentLevel] ?? this.currentLevel
    this.currentLevel = level
    log.info(MOD, `transitionTo(${LEVEL_NAMES[level]}) from ${fromLevel}`)

    this._clearHover()

    if (level === Level.OVERVIEW) {
      this.targetPos.copy(LEVEL1_POS)
      this.targetLookAt.copy(LEVEL1_LOOKAT)
      this.targetFOV = LEVEL1_FOV
      this.panOffsetX = 0
      hideDimmer()
      hideCloseButton()
    } else if (level === Level.SIDE_ON) {
      this.panOffsetX = 0
      this._updateL2Targets()
      this.targetFOV = LEVEL2_FOV
      log.debug(MOD, `L2 target: pos(${this.targetPos.x.toFixed(1)},${this.targetPos.y.toFixed(1)},${this.targetPos.z.toFixed(1)}) lookAt(${this.targetLookAt.x.toFixed(1)},${this.targetLookAt.y.toFixed(1)},${this.targetLookAt.z.toFixed(1)})`)
    } else if (level === Level.INSPECT) {
      this.targetFOV = LEVEL3_FOV
    }
  }

  _updateL2Targets() {
    const camZ = this.activeAisleZ + 2.5
    this.targetPos.set(this.panOffsetX, LEVEL2_POS.y, camZ)
    this.targetLookAt.set(this.panOffsetX, LEVEL2_LOOKAT.y, this.activeAisleZ - 0.5)
  }

  _selectProduct(product) {
    this.selectedProduct = product
    this.isTransitioning = true

    const camDir = new THREE.Vector3()
    this.camera.getWorldDirection(camDir)
    this.inspectTargetPos.copy(this.camera.position).add(camDir.multiplyScalar(LEVEL3_PULL_DISTANCE))
    this.inspectTargetPos.y = this.camera.position.y - 0.5

    log.info(MOD, `_selectProduct: "${product.userData.id}" → inspect at (${this.inspectTargetPos.x.toFixed(1)},${this.inspectTargetPos.y.toFixed(1)},${this.inspectTargetPos.z.toFixed(1)})`)

    showDimmer()
    showCloseButton(() => this._returnToL2())
  }

  _returnToL2() {
    if (!this.selectedProduct) return
    this.isTransitioning = true
    this.currentLevel = Level.SIDE_ON
    log.info(MOD, '_returnToL2 — returning product and camera')

    if (this._instanceRef) {
      const origPos = this._instanceRef.entry.originalPosition
      this.selectedProduct.userData.originalPosition = origPos.clone()
      this.selectedProduct.userData.originalRotation = this._instanceRef.entry.originalRotation.clone()
    }

    this._updateL2Targets()
    this.targetFOV = LEVEL2_FOV

    hideDimmer()
    hideCloseButton()
    this.isDraggingProduct = false
  }

  _cleanupStandalone() {
    if (this.selectedProduct && this._instanceRef) {
      this.scene.remove(this.selectedProduct)
      this.selectedProduct.geometry = null
      this.selectedProduct.material.dispose()
      this.selectedProduct = null

      if (this._instanceRef) {
        showInstance(this._instanceRef.shelfGroup, this._instanceRef.meshType, this._instanceRef.instanceId)
        this._instanceRef = null
      }
    }
  }

  update() {
    this.trolley.position.lerp(this.trolleyTarget, 0.04)

    if (this.currentLevel === Level.SIDE_ON && !this.isTransitioning) {
      this._updateL2Targets()
      this.camera.position.lerp(this.targetPos, 0.08)
      this.currentLookAt.lerp(this.targetLookAt, 0.08)
      this.camera.lookAt(this.currentLookAt)
    }

    if (this.isTransitioning) {
      let done = true

      const posDist = this.camera.position.distanceTo(this.targetPos)
      if (posDist > 0.02) {
        this.camera.position.lerp(this.targetPos, LERP_SPEED)
        done = false
      } else {
        this.camera.position.copy(this.targetPos)
      }

      const lookDist = this.currentLookAt.distanceTo(this.targetLookAt)
      if (lookDist > 0.02) {
        this.currentLookAt.lerp(this.targetLookAt, LERP_SPEED)
        done = false
      } else {
        this.currentLookAt.copy(this.targetLookAt)
      }
      this.camera.lookAt(this.currentLookAt)

      if (this.selectedProduct && this.currentLevel === Level.INSPECT) {
        const prodDist = this.selectedProduct.position.distanceTo(this.inspectTargetPos)
        if (prodDist > 0.02) {
          this.selectedProduct.position.lerp(this.inspectTargetPos, LERP_SPEED)
          done = false
        } else {
          this.selectedProduct.position.copy(this.inspectTargetPos)
        }
      }

      if (this.selectedProduct && this.currentLevel === Level.SIDE_ON) {
        const origPos = this.selectedProduct.userData.originalPosition
        const posDist2 = this.selectedProduct.position.distanceTo(origPos)
        if (posDist2 > 0.02) {
          this.selectedProduct.position.lerp(origPos, LERP_SPEED)
          done = false
        } else {
          this.selectedProduct.position.copy(origPos)
        }

        const origRot = this.selectedProduct.userData.originalRotation
        const rxDiff = Math.abs(this.selectedProduct.rotation.x - origRot.x)
        const ryDiff = Math.abs(this.selectedProduct.rotation.y - origRot.y)
        if (rxDiff > 0.01 || ryDiff > 0.01) {
          this.selectedProduct.rotation.x += (origRot.x - this.selectedProduct.rotation.x) * LERP_SPEED
          this.selectedProduct.rotation.y += (origRot.y - this.selectedProduct.rotation.y) * LERP_SPEED
          done = false
        } else {
          this.selectedProduct.rotation.x = origRot.x
          this.selectedProduct.rotation.y = origRot.y
        }
      }

      if (Math.abs(this.camera.fov - this.targetFOV) > 0.1) {
        lerpFOV(this.camera, this.targetFOV, LERP_SPEED)
        done = false
      } else {
        this.camera.fov = this.targetFOV
        this.camera.updateProjectionMatrix()
      }

      if (done) {
        this.isTransitioning = false
        log.info(MOD, `Transition complete — now at ${LEVEL_NAMES[this.currentLevel]}`)
        if (this.currentLevel === Level.SIDE_ON && this.selectedProduct) {
          this._cleanupStandalone()
        }
      }
    }
  }

  rebuildReferences(newAisleSystem) {
    this.aisleSystem = newAisleSystem
    this.shelfGroups = getAllShelfGroups(newAisleSystem)
    this.panBounds = computeL1PanBounds()

    this._buildGridPositions()

    log.info(MOD, `References rebuilt — ${this.shelfGroups.length} shelf groups, ${this.gridZPositions.length} grid Z positions`)
  }

  _snapToGrid(x, z) {
    const nearestX = this.gridXPositions.reduce((prev, curr) =>
      Math.abs(curr - x) < Math.abs(prev - x) ? curr : prev
    )
    const nearestZ = this.gridZPositions.reduce((prev, curr) =>
      Math.abs(curr - z) < Math.abs(prev - z) ? curr : prev
    )
    return { x: nearestX, z: nearestZ }
  }

  _setLerpSpeed(speed) {
    LERP_SPEED = speed
    log.info(MOD, `Lerp speed set to ${speed}`)
  }

  _setL1PanSpeed(speed) {
    this.l1PanSpeed = speed
    log.info(MOD, `L1 pan speed set to ${speed}`)
  }

  _setL2PanSpeed(speed) {
    this.l2PanSpeed = speed
    log.info(MOD, `L2 pan speed set to ${speed}`)
  }

  _setL2PanClamp(clamp) {
    this.l2PanClamp = clamp
    log.info(MOD, `L2 pan clamp set to ${clamp}`)
  }

  getState() {
    return {
      level: this.currentLevel,
      isTransitioning: this.isTransitioning,
      selectedProduct: this.selectedProduct?.userData?.id ?? this._instanceRef?.entry?.id ?? '—',
      camera: this.camera
    }
  }
}
