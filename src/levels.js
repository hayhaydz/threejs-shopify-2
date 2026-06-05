import * as THREE from 'three'
import {
  LEVEL1_POS, LEVEL1_LOOKAT, LEVEL1_FOV,
  LEVEL2_POS, LEVEL2_LOOKAT, LEVEL2_FOV,
  LEVEL3_FOV, LEVEL3_ZOOM_FOV, LEVEL3_PULL_DISTANCE, lerpFOV,
  computeL1PanBounds
} from './camera.js'
import {
  getAllShelfGroups, shelfConfig,
  hideInstance, showInstance, spawnStandaloneMesh,
  getWorldPositionFromInstance, findProductByInstanceId,
  findShelfGroupForHit, getAllInstanceMeshes, sharedBoxGeo, sharedCylGeo,
  findFrontProductByPosition
} from './shelf.js'
import { createTrolley } from './trolley.js'
import { createTextPanel, updateTextPanel } from './canvas-texture.js'
import { log } from './log.js'
import { resetDOFSettings } from './debug.js'

const MOD = 'Level'

export const Level = { OVERVIEW: 1, SIDE_ON: 2, INSPECT: 3 }
const LEVEL_NAMES = { 1: 'OVERVIEW', 2: 'SIDE_ON', 3: 'INSPECT' }

const ANIM_PHASE = { NONE: 0, FORWARD: 1, TO_TARGET: 2 }
const ANIM_THRESHOLD = 0.015

let LERP_SPEED = 0.05
let PRODUCT_LERP_SPEED = 0.12

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

function createGridTileTexture() {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, size, size)
  ctx.fillStyle = 'rgba(25, 55, 95, 0.25)'
  ctx.fillRect(0, 0, size, size)
  ctx.strokeStyle = '#3388ff'
  ctx.lineWidth = 3
  ctx.strokeRect(1.5, 1.5, size - 3, size - 3)
  const texture = new THREE.CanvasTexture(canvas)
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  return texture
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
  constructor(camera, aisleSystem, input, scene, dof) {
    this.camera = camera
    this.aisleSystem = aisleSystem
    this.input = input
    this.scene = scene
    this.dof = dof
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

    this.l3SavedCameraPos = new THREE.Vector3()
    this.l3SavedLookAt = new THREE.Vector3()

    this._instanceRef = null

    this.l3AnimPhase = ANIM_PHASE.NONE
    this.l3IntermediatePos = new THREE.Vector3()
    this.l3AnimStartTime = 0
    this.l3AnimFrameCount = 0
    this.l3AnimPrevPos = new THREE.Vector3()
    this.l3Returning = false

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
    this.trolleyPath = []
    this.trolleyWaypointIndex = 0
    this.trolleyTargetAngle = 0
    scene.add(this.trolley)

    this.cart = []
    this.isDropping = false

    this.trolleySpeed = 0.25
    this.trolleyRotationSpeed = 0.15

    this.inspectionGroup = new THREE.Group()
    this.inspectionGroup.name = 'inspectionGroup'
    this.inspectionGroup.visible = false
    scene.add(this.inspectionGroup)

    this.checkoutTill = this._createCheckoutTill()
    scene.add(this.checkoutTill)
    this._nearCheckout = false

    this._setupInput()
    log.info(MOD, `Initialized — ${this.shelfGroups.length} shelf groups`)
  }

  _buildGridPositions() {
    this.gridXPositions = []
    const gridStep = 1
    const halfWidth = shelfConfig.shelfWidth / 2
    for (let x = -halfWidth; x <= halfWidth; x += gridStep) {
      this.gridXPositions.push(parseFloat(x.toFixed(1)))
    }
    const sideLaneOffset = shelfConfig.shelfWidth / 2 + 1
    this.gridXPositions.push(-sideLaneOffset)
    this.gridXPositions.push(sideLaneOffset)
    this.gridXPositions.sort((a, b) => a - b)

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

    this._buildShelfBounds()
    this._buildNavGrid()
    this._buildGridTiles()
  }

  _buildShelfBounds() {
    this.shelfBounds = []
    const numPairs = Math.ceil(shelfConfig.numShelfUnits / 2)
    for (let p = 0; p < numPairs; p++) {
      const pairZ = p * shelfConfig.aisleSpacingZ
      this.shelfBounds.push({
        xMin: -shelfConfig.shelfWidth / 2,
        xMax: shelfConfig.shelfWidth / 2,
        zMin: pairZ - shelfConfig.shelfDepth / 2,
        zMax: pairZ + shelfConfig.shelfDepth / 2
      })
      this.shelfBounds.push({
        xMin: -shelfConfig.shelfWidth / 2,
        xMax: shelfConfig.shelfWidth / 2,
        zMin: pairZ - shelfConfig.shelfDepth - shelfConfig.shelfDepth / 2,
        zMax: pairZ - shelfConfig.shelfDepth + shelfConfig.shelfDepth / 2
      })
    }
  }

  _isInsideShelf(x, z) {
    for (const b of this.shelfBounds) {
      if (x >= b.xMin && x <= b.xMax && z >= b.zMin && z <= b.zMax) return true
    }
    return false
  }

  _buildNavGrid() {
    this.navBlocked = new Set()
    for (let zi = 0; zi < this.gridZPositions.length; zi++) {
      for (let xi = 0; xi < this.gridXPositions.length; xi++) {
        if (this._isInsideShelf(this.gridXPositions[xi], this.gridZPositions[zi])) {
          this.navBlocked.add(`${xi},${zi}`)
        }
      }
    }
  }

  _buildGridTiles() {
    if (this.gridTileMesh) {
      this.scene.remove(this.gridTileMesh)
      this.gridTileMesh.geometry.dispose()
      this.gridTileMesh.material.dispose()
      if (this.gridTileMesh.material.map) this.gridTileMesh.material.map.dispose()
    }

    const tileSize = 1.0
    const geo = new THREE.PlaneGeometry(tileSize, tileSize)
    const mat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.25,
      map: createGridTileTexture(),
      depthWrite: false,
      side: THREE.DoubleSide
    })

    let count = 0
    for (let zi = 0; zi < this.gridZPositions.length; zi++) {
      for (let xi = 0; xi < this.gridXPositions.length; xi++) {
        if (!this.navBlocked.has(`${xi},${zi}`)) count++
      }
    }

    this.gridTileMesh = new THREE.InstancedMesh(geo, mat, count)
    this.gridTileMesh.name = 'gridTiles'

    const dummy = new THREE.Object3D()
    const baseColor = new THREE.Color(0xffffff)
    let idx = 0
    this.gridTileMap = {}

    for (let zi = 0; zi < this.gridZPositions.length; zi++) {
      for (let xi = 0; xi < this.gridXPositions.length; xi++) {
        const key = `${xi},${zi}`
        if (this.navBlocked.has(key)) continue
        dummy.position.set(this.gridXPositions[xi], 0.02, this.gridZPositions[zi])
        dummy.rotation.set(-Math.PI / 2, 0, 0)
        dummy.scale.set(1, 1, 1)
        dummy.updateMatrix()
        this.gridTileMesh.setMatrixAt(idx, dummy.matrix)
        this.gridTileMesh.setColorAt(idx, baseColor)
        this.gridTileMap[key] = idx
        idx++
      }
    }

    this.gridTileMesh.instanceMatrix.needsUpdate = true
    this.gridTileMesh.instanceColor.needsUpdate = true
    this.gridTileMesh.userData.isGridTile = true
    this.scene.add(this.gridTileMesh)

    this._hoveredGridKey = null
  }

  _updateGridHover(raycaster) {
    if (!this.gridTileMesh) return

    if (this._hoveredGridKey !== null) {
      const prevIdx = this.gridTileMap[this._hoveredGridKey]
      if (prevIdx !== undefined) {
        this.gridTileMesh.setColorAt(prevIdx, new THREE.Color(0xffffff))
        const dummy = new THREE.Object3D()
        const [pxi, pzi] = this._hoveredGridKey.split(',').map(Number)
        dummy.position.set(this.gridXPositions[pxi], 0.02, this.gridZPositions[pzi])
        dummy.rotation.set(-Math.PI / 2, 0, 0)
        dummy.scale.set(1, 1, 1)
        dummy.updateMatrix()
        this.gridTileMesh.setMatrixAt(prevIdx, dummy.matrix)
        this.gridTileMesh.instanceMatrix.needsUpdate = true
        this.gridTileMesh.instanceColor.needsUpdate = true
      }
      this._hoveredGridKey = null
    }

    if (this.currentLevel !== Level.OVERVIEW) return

    const hits = raycaster.intersectObject(this.gridTileMesh, false)
    if (hits.length > 0 && hits[0].instanceId !== undefined) {
      const hitId = hits[0].instanceId
      for (const [key, idx] of Object.entries(this.gridTileMap)) {
        if (idx === hitId) {
          this._hoveredGridKey = key
          this.gridTileMesh.setColorAt(idx, new THREE.Color(0x44bbff))
          const dummy = new THREE.Object3D()
          const [hxi, hzi] = key.split(',').map(Number)
          dummy.position.set(this.gridXPositions[hxi], 0.05, this.gridZPositions[hzi])
          dummy.rotation.set(-Math.PI / 2, 0, 0)
          dummy.scale.set(1.15, 1.15, 1.15)
          dummy.updateMatrix()
          this.gridTileMesh.setMatrixAt(idx, dummy.matrix)
          this.gridTileMesh.instanceMatrix.needsUpdate = true
          this.gridTileMesh.instanceColor.needsUpdate = true
          break
        }
      }
    }
  }

  _findPath(startX, startZ, endX, endZ) {
    const snapStart = this._snapToGrid(startX, startZ)
    const snapEnd = this._snapToGrid(endX, endZ)

    let si = this.gridXPositions.indexOf(snapStart.x)
    let sj = this.gridZPositions.indexOf(snapStart.z)
    let ei = this.gridXPositions.indexOf(snapEnd.x)
    let ej = this.gridZPositions.indexOf(snapEnd.z)

    if (si === -1) si = this.gridXPositions.reduce((best, v, i) => Math.abs(v - snapStart.x) < Math.abs(this.gridXPositions[best] - snapStart.x) ? i : best, 0)
    if (sj === -1) sj = this.gridZPositions.reduce((best, v, i) => Math.abs(v - snapStart.z) < Math.abs(this.gridZPositions[best] - snapStart.z) ? i : best, 0)
    if (ei === -1) ei = this.gridXPositions.reduce((best, v, i) => Math.abs(v - snapEnd.x) < Math.abs(this.gridXPositions[best] - snapEnd.x) ? i : best, 0)
    if (ej === -1) ej = this.gridZPositions.reduce((best, v, i) => Math.abs(v - snapEnd.z) < Math.abs(this.gridZPositions[best] - snapEnd.z) ? i : best, 0)

    if (this.navBlocked.has(`${ei},${ej}`)) return null
    if (si === ei && sj === ej) return [{ x: snapEnd.x, z: snapEnd.z }]

    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]]
    const visited = new Set()
    const key = (i, j) => `${i},${j}`
    visited.add(key(si, sj))
    const queue = [[si, sj, [{ x: this.gridXPositions[si], z: this.gridZPositions[sj] }]]]

    while (queue.length > 0) {
      const [ci, cj, path] = queue.shift()
      for (const [di, dj] of dirs) {
        const ni = ci + di
        const nj = cj + dj
        if (ni < 0 || ni >= this.gridXPositions.length || nj < 0 || nj >= this.gridZPositions.length) continue
        const nk = key(ni, nj)
        if (visited.has(nk)) continue
        if (this.navBlocked.has(nk)) continue
        visited.add(nk)
        const newPath = [...path, { x: this.gridXPositions[ni], z: this.gridZPositions[nj] }]
        if (ni === ei && nj === ej) return newPath
        queue.push([ni, nj, newPath])
      }
    }

    return null
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
    if (this._hoveredGridKey !== null && this.gridTileMesh) {
      const prevIdx = this.gridTileMap[this._hoveredGridKey]
      if (prevIdx !== undefined) {
        this.gridTileMesh.setColorAt(prevIdx, new THREE.Color(0xffffff))
        const dummy = new THREE.Object3D()
        const [pxi, pzi] = this._hoveredGridKey.split(',').map(Number)
        dummy.position.set(this.gridXPositions[pxi], 0.02, this.gridZPositions[pzi])
        dummy.rotation.set(-Math.PI / 2, 0, 0)
        dummy.scale.set(1, 1, 1)
        dummy.updateMatrix()
        this.gridTileMesh.setMatrixAt(prevIdx, dummy.matrix)
        this.gridTileMesh.instanceMatrix.needsUpdate = true
        this.gridTileMesh.instanceColor.needsUpdate = true
      }
      this._hoveredGridKey = null
    }
    this.hoveredShelfUnit = null
    this.hoveredProduct = null
  }

  _isOccluded(raycaster, clickZoneHit) {
    const shelfHits = raycaster.intersectObjects(this.shelfGroups, true)
    if (shelfHits.length === 0) return false
    const closestShelfHit = shelfHits[0]
    return closestShelfHit.distance < clickZoneHit.distance
  }

  _hoverL1(raycaster) {
    this._updateGridHover(raycaster)

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
    } else {
      if (this.hoveredShelfUnit) {
        this._clearHover()
      }
    }
  }

  _resolveFrontProduct(hits) {
    for (const h of hits) {
      if (h.instanceId === undefined || !h.object.userData?.isInstancedProducts) continue
      const meshType = h.object.userData.productType
      const shelfGroup = findShelfGroupForHit(h.object)
      if (!shelfGroup) continue

      const hitEntry = findProductByInstanceId(shelfGroup, meshType, h.instanceId)
      if (!hitEntry || hitEntry.isHidden) continue

      const worldPos = getWorldPositionFromInstance(shelfGroup, meshType, h.instanceId)
      if (!worldPos) continue

      const localPos = hitEntry.originalPosition
      const frontEntry = findFrontProductByPosition(
        shelfGroup, localPos.x, localPos.y, 0.02
      )
      if (!frontEntry) continue

      return { shelfGroup, frontEntry, hitEntry, worldPos }
    }
    return null
  }

  _hoverL2(raycaster) {
    if (this._hoveredGridKey !== null) {
      this._clearHover()
    }

    const instanceMeshes = this._getInstanceMeshes()
    const hits = raycaster.intersectObjects(instanceMeshes, false)

    const resolved = this._resolveFrontProduct(hits)

    if (resolved) {
      const { shelfGroup, frontEntry } = resolved
      const productKey = `${shelfGroup.userData.shelfUnitIndex}-${frontEntry.meshType}-${frontEntry.instanceId}`
      if (productKey !== this.hoveredProduct) {
        this._clearHover()
        this.hoveredProduct = productKey

        const worldPos = getWorldPositionFromInstance(shelfGroup, frontEntry.meshType, frontEntry.instanceId)
        if (worldPos) {
          const outline = createInstanceOutline(frontEntry.meshType, worldPos, frontEntry.scale)
          this.scene.add(outline)
          this.hoveredProductOutline = outline
        }
      }
    } else {
      if (this.hoveredProduct) {
        this._clearHover()
      }
    }
  }

  _hoverL3(raycaster) {
    if (!this.inspectionGroup.visible) return
    const buttons = this.inspectionGroup.children.filter(
      c => c.name === 'btn-add'
    )
    buttons.forEach(btn => btn.scale.set(1, 1, 1))
    const hits = raycaster.intersectObjects(buttons, false)
    if (hits.length > 0) {
      hits[0].object.scale.set(1.1, 1.1, 1.1)
    }
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
      if (this.currentLevel === Level.INSPECT && this.selectedProduct) {
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
          const tillHits = raycaster.intersectObjects(this.checkoutTill.children, true)
          if (tillHits.length > 0 && this.trolley.position.distanceTo(this.checkoutTill.position) < 3) {
            log.info(MOD, `CHECKOUT: ${this.cart.length} items`, this.cart.map(i => `${i.title} ${i.price}`))
          } else {
            const floorHits = raycaster.intersectObjects(this.scene.children.filter(c => c.name === 'floor'), false)
            const gridHits = this.gridTileMesh ? raycaster.intersectObject(this.gridTileMesh, false) : []
            let clickPoint = null
            if (gridHits.length > 0) {
              clickPoint = gridHits[0].point
            } else if (floorHits.length > 0) {
              clickPoint = floorHits[0].point
            }
            if (clickPoint) {
              const path = this._findPath(
                this.trolley.position.x, this.trolley.position.z,
                clickPoint.x, clickPoint.z
              )
              if (path && path.length > 0) {
                this.trolleyPath = path
                this.trolleyWaypointIndex = 0
                this.trolleyTarget.set(path[path.length - 1].x, 0, path[path.length - 1].z)
                log.info(MOD, `Trolley path: ${path.length} waypoints, target grid (${this.trolleyTarget.x.toFixed(1)}, ${this.trolleyTarget.z.toFixed(1)})`)
              } else {
                log.debug(MOD, 'No valid path to target')
              }
            } else {
              log.debug(MOD, 'L1 click — no shelf or floor hit')
            }
          }
        }
      } else if (this.currentLevel === Level.SIDE_ON) {
        const instanceMeshes = this._getInstanceMeshes()
        const hits = raycaster.intersectObjects(instanceMeshes, false)

        const resolved = this._resolveFrontProduct(hits)

        if (resolved) {
          const { shelfGroup, frontEntry, hitEntry } = resolved

          log.info(MOD, `L2→L3: clicked "${hitEntry.id}" at depth (row z=${hitEntry.originalPosition.z.toFixed(2)}), resolved to front "${frontEntry.id}" (row z=${frontEntry.originalPosition.z.toFixed(2)})`)

          const worldPos = getWorldPositionFromInstance(shelfGroup, frontEntry.meshType, frontEntry.instanceId)
          if (!worldPos) return

          hideInstance(shelfGroup, frontEntry.meshType, frontEntry.instanceId)

          const standalone = spawnStandaloneMesh(frontEntry.meshType, worldPos, frontEntry.scale, frontEntry.color)
          this.scene.add(standalone)

          this._instanceRef = {
            shelfGroup,
            meshType: frontEntry.meshType,
            instanceId: frontEntry.instanceId,
            entry: frontEntry
          }

          this._selectProduct(standalone)
        } else {
          log.info(MOD, 'L2 click — no product hit, returning to L1')
          this.panOffsetX = 0
          this.transitionTo(Level.OVERVIEW)
        }
      } else if (this.currentLevel === Level.INSPECT) {
        if (!this.selectedProduct || this.isDropping) return
        const targets = [this.selectedProduct, ...this.inspectionGroup.children]
        const hits = raycaster.intersectObjects(targets, false)
        if (hits.length > 0) {
          const clicked = hits[0].object
          if (clicked.name === 'btn-add') {
            log.info(MOD, 'L3 btn-add clicked — triggering drop')
            this._triggerDrop()
          } else {
            this.isDraggingProduct = true
          }
        } else {
          log.info(MOD, 'L3 click outside product — returning to shelf')
          this._returnToL2()
        }
      }
    }

    this.input.onEscape = () => {
      if (this.currentLevel === Level.INSPECT) {
        if (this.isDropping) return
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
    resetDOFSettings(this.dof)
    this._clearInspectionGroup()

    if (level === Level.OVERVIEW) {
      this.targetPos.copy(LEVEL1_POS)
      this.targetLookAt.copy(LEVEL1_LOOKAT)
      this.targetFOV = LEVEL1_FOV
      this.panOffsetX = 0
      if (this.gridTileMesh) this.gridTileMesh.visible = true
    } else if (level === Level.SIDE_ON) {
      this.panOffsetX = 0
      this._updateL2Targets()
      this.targetFOV = LEVEL2_FOV
      if (this.gridTileMesh) this.gridTileMesh.visible = false
      log.debug(MOD, `L2 target: pos(${this.targetPos.x.toFixed(1)},${this.targetPos.y.toFixed(1)},${this.targetPos.z.toFixed(1)}) lookAt(${this.targetLookAt.x.toFixed(1)},${this.targetLookAt.y.toFixed(1)},${this.targetLookAt.z.toFixed(1)})`)
    } else if (level === Level.INSPECT) {
    }
  }

  _updateL2Targets() {
    const camZ = this.activeAisleZ + 2.5
    this.targetPos.set(this.panOffsetX, LEVEL2_POS.y, camZ)
    this.targetLookAt.set(this.panOffsetX, LEVEL2_LOOKAT.y, this.activeAisleZ - 0.5)
  }

  _selectProduct(product) {
    this._clearHover()
    this.selectedProduct = product
    this.currentLevel = Level.INSPECT
    this.isTransitioning = true
    this.l3Returning = false

    this.l3SavedCameraPos.copy(this.camera.position)
    this.l3SavedLookAt.copy(this.currentLookAt)

    const camDir = new THREE.Vector3()
    this.camera.getWorldDirection(camDir)

    this.inspectTargetPos.copy(this.camera.position).add(camDir.clone().multiplyScalar(LEVEL3_PULL_DISTANCE))

    this.targetPos.copy(this.camera.position)
    this.targetLookAt.copy(this.currentLookAt)

    const scale = product.scale.x
    const baseFOV = scale > 1.0 ? LEVEL3_FOV + (scale - 1.0) * 10 : LEVEL3_FOV
    this.targetFOV = THREE.MathUtils.clamp(baseFOV, LEVEL3_ZOOM_FOV, LEVEL3_FOV)

    this.l3IntermediatePos.copy(product.position).add(camDir.clone().multiplyScalar(-0.5))

    this.l3AnimPhase = ANIM_PHASE.FORWARD
    this.l3AnimStartTime = performance.now()
    this.l3AnimFrameCount = 0
    this.l3AnimPrevPos.copy(product.position)

    const focusDist = this.camera.position.distanceTo(this.inspectTargetPos)

    log.info(MOD, `[_selectProduct START] scale=${scale.toFixed(2)} start=(${product.position.x.toFixed(2)},${product.position.y.toFixed(2)},${product.position.z.toFixed(2)}) intermediate=(${this.l3IntermediatePos.x.toFixed(2)},${this.l3IntermediatePos.y.toFixed(2)},${this.l3IntermediatePos.z.toFixed(2)}) target=(${this.inspectTargetPos.x.toFixed(2)},${this.inspectTargetPos.y.toFixed(2)},${this.inspectTargetPos.z.toFixed(2)}) focusDist=${focusDist.toFixed(2)} FOV=${this.targetFOV.toFixed(1)} lerpSpeed=${LERP_SPEED}`)

    this.dof.enable(focusDist)
    if (this._instanceRef?.entry) {
      this._createInspectionUI(this._instanceRef.entry)
    }
  }

  _returnToL2() {
    if (!this.selectedProduct) return
    this.isTransitioning = true
    this.currentLevel = Level.SIDE_ON
    this.l3Returning = true
    this._clearInspectionGroup()

    if (this._instanceRef) {
      const shelfGroup = this._instanceRef.shelfGroup
      const localPos = this._instanceRef.entry.originalPosition.clone()
      const worldPos = shelfGroup.localToWorld(localPos)
      this.selectedProduct.userData.originalPosition = worldPos
      this.selectedProduct.userData.originalRotation = this._instanceRef.entry.originalRotation.clone()

      const camDir = new THREE.Vector3()
      this.camera.getWorldDirection(camDir)
      this.l3IntermediatePos.copy(worldPos).add(camDir.clone().multiplyScalar(-0.3))
    }

    this.l3AnimPhase = ANIM_PHASE.FORWARD
    this.l3AnimStartTime = performance.now()
    this.l3AnimFrameCount = 0
    this.l3AnimPrevPos.copy(this.selectedProduct.position)

    this.targetPos.copy(this.l3SavedCameraPos)
    this.targetLookAt.copy(this.l3SavedLookAt)
    this.targetFOV = LEVEL2_FOV

    log.info(MOD, `[_returnToL2 START] product=(${this.selectedProduct.position.x.toFixed(2)},${this.selectedProduct.position.y.toFixed(2)},${this.selectedProduct.position.z.toFixed(2)}) intermediate=(${this.l3IntermediatePos.x.toFixed(2)},${this.l3IntermediatePos.y.toFixed(2)},${this.l3IntermediatePos.z.toFixed(2)}) target=(${this.selectedProduct.userData.originalPosition.x.toFixed(2)},${this.selectedProduct.userData.originalPosition.y.toFixed(2)},${this.selectedProduct.userData.originalPosition.z.toFixed(2)})`)

    this.dof.disable()
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

  _logAnimFrame(phase, target, dist, extraLabel) {
    const p = this.selectedProduct.position
    const delta = p.clone().sub(this.l3AnimPrevPos).length()
    const elapsed = performance.now() - this.l3AnimStartTime
    const fovDelta = this.camera.fov - this.targetFOV
    log.debug(MOD, `[L3 anim ${extraLabel}] frame=${this.l3AnimFrameCount} phase=${phase} t=${elapsed.toFixed(0)}ms pos=(${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)}) target=(${target.x.toFixed(3)},${target.y.toFixed(3)},${target.z.toFixed(3)}) dist=${dist.toFixed(4)} delta=${delta.toFixed(4)} fov=${this.camera.fov.toFixed(1)}→${this.targetFOV.toFixed(1)}(Δ${fovDelta.toFixed(1)}) lerp=${LERP_SPEED}`)
    this.l3AnimPrevPos.copy(p)
  }

  update() {
    if (this.trolleyPath.length > 0 && this.trolleyWaypointIndex < this.trolleyPath.length) {
      let remaining = this.trolleySpeed

      while (remaining > 0.001 && this.trolleyWaypointIndex < this.trolleyPath.length) {
        const wp = this.trolleyPath[this.trolleyWaypointIndex]
        const dx = wp.x - this.trolley.position.x
        const dz = wp.z - this.trolley.position.z
        const dist = Math.sqrt(dx * dx + dz * dz)

        if (dist < 0.001) {
          this.trolleyWaypointIndex++
          continue
        }

        if (dist <= remaining) {
          this.trolley.position.set(wp.x, 0, wp.z)
          remaining -= dist
          this.trolleyWaypointIndex++
        } else {
          const ratio = remaining / dist
          this.trolley.position.x += dx * ratio
          this.trolley.position.z += dz * ratio
          remaining = 0
          this.trolleyTargetAngle = Math.atan2(dx, dz)
        }
      }

      if (this.trolleyWaypointIndex >= this.trolleyPath.length) {
        this.trolleyPath = []
        this.trolleyWaypointIndex = 0
      }
    }

    const angleDiff = this.trolleyTargetAngle - this.trolley.rotation.y
    let wrapped = ((angleDiff + Math.PI) % (Math.PI * 2)) - Math.PI
    if (wrapped < -Math.PI) wrapped += Math.PI * 2
    this.trolley.rotation.y += wrapped * this.trolleyRotationSpeed

    if (this.isDropping && this.selectedProduct) {
      this.selectedProduct.position.y -= 0.3
      this.inspectionGroup.children.forEach(child => {
        if (child.material) {
          child.material.transparent = true
          child.material.opacity = Math.max(0, child.material.opacity - 0.05)
        }
      })
      if (this.selectedProduct.position.y < -10) {
        this._completeDrop()
      }
    }

    if (this.checkoutTill && this.checkoutSign) {
      const dist = this.trolley.position.distanceTo(this.checkoutTill.position)
      if (dist < 3 && !this._nearCheckout) {
        this._nearCheckout = true
        updateTextPanel(this.checkoutSign, `Checkout: ${this.cart.length} Items`)
      } else if (dist >= 3 && this._nearCheckout) {
        this._nearCheckout = false
        updateTextPanel(this.checkoutSign, 'Checkout Area')
      }
    }

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

      if (this.selectedProduct && this.currentLevel === Level.INSPECT && !this.l3Returning) {
        this.l3AnimFrameCount++
        const focusDist = this.camera.position.distanceTo(this.selectedProduct.position)
        this.dof.updateFocus(focusDist)

        if (this.l3AnimPhase === ANIM_PHASE.FORWARD) {
          const dist = this.selectedProduct.position.distanceTo(this.l3IntermediatePos)
          if (dist > ANIM_THRESHOLD) {
            this.selectedProduct.position.lerp(this.l3IntermediatePos, PRODUCT_LERP_SPEED)
            done = false
            if (this.l3AnimFrameCount <= 30 || this.l3AnimFrameCount % 5 === 0) {
              this._logAnimFrame('FWD→intermediate', this.l3IntermediatePos, dist, 'L3-pull')
            }
          } else {
            this.selectedProduct.position.copy(this.l3IntermediatePos)
            this.l3AnimPhase = ANIM_PHASE.TO_TARGET
            log.debug(MOD, `[L3 anim phase switch] FORWARD→TO_TARGET at frame ${this.l3AnimFrameCount} t=${(performance.now() - this.l3AnimStartTime).toFixed(0)}ms`)
          }
        }

        if (this.l3AnimPhase === ANIM_PHASE.TO_TARGET) {
          const dist = this.selectedProduct.position.distanceTo(this.inspectTargetPos)
          if (dist > ANIM_THRESHOLD) {
            this.selectedProduct.position.lerp(this.inspectTargetPos, PRODUCT_LERP_SPEED)
            done = false
            if (this.l3AnimFrameCount <= 30 || this.l3AnimFrameCount % 5 === 0) {
              this._logAnimFrame('TO_TARGET', this.inspectTargetPos, dist, 'L3-pull')
            }
          } else {
            this.selectedProduct.position.copy(this.inspectTargetPos)
            this.l3AnimPhase = ANIM_PHASE.NONE
            this.inspectionGroup.visible = true
            const elapsed = performance.now() - this.l3AnimStartTime
            log.info(MOD, `[L3 anim COMPLETE] frames=${this.l3AnimFrameCount} t=${elapsed.toFixed(0)}ms final=(${this.inspectTargetPos.x.toFixed(2)},${this.inspectTargetPos.y.toFixed(2)},${this.inspectTargetPos.z.toFixed(2)})`)
          }
        }

        if (this.l3AnimPhase !== ANIM_PHASE.NONE) {
          done = false
        }
      }

      if (this.selectedProduct && this.currentLevel === Level.SIDE_ON && this.l3Returning) {
        this.l3AnimFrameCount++

        if (this.l3AnimPhase === ANIM_PHASE.FORWARD) {
          const dist = this.selectedProduct.position.distanceTo(this.l3IntermediatePos)
          if (dist > ANIM_THRESHOLD) {
            this.selectedProduct.position.lerp(this.l3IntermediatePos, PRODUCT_LERP_SPEED)
            done = false
            if (this.l3AnimFrameCount <= 30 || this.l3AnimFrameCount % 5 === 0) {
              this._logAnimFrame('FWD→intermediate', this.l3IntermediatePos, dist, 'L3-return')
            }
          } else {
            this.selectedProduct.position.copy(this.l3IntermediatePos)
            this.l3AnimPhase = ANIM_PHASE.TO_TARGET
            log.debug(MOD, `[L3 return phase switch] FORWARD→TO_TARGET at frame ${this.l3AnimFrameCount} t=${(performance.now() - this.l3AnimStartTime).toFixed(0)}ms`)
          }
        }

        if (this.l3AnimPhase === ANIM_PHASE.TO_TARGET) {
          const origPos = this.selectedProduct.userData.originalPosition
          const dist = this.selectedProduct.position.distanceTo(origPos)
          if (dist > ANIM_THRESHOLD) {
            this.selectedProduct.position.lerp(origPos, PRODUCT_LERP_SPEED)
            done = false
            if (this.l3AnimFrameCount <= 30 || this.l3AnimFrameCount % 5 === 0) {
              this._logAnimFrame('TO_TARGET', origPos, dist, 'L3-return')
            }
          } else {
            this.selectedProduct.position.copy(origPos)
            this.l3AnimPhase = ANIM_PHASE.NONE
            const elapsed = performance.now() - this.l3AnimStartTime
            log.info(MOD, `[L3 return COMPLETE] frames=${this.l3AnimFrameCount} t=${elapsed.toFixed(0)}ms`)
          }
        }

        const origRot = this.selectedProduct.userData.originalRotation
        const rxDiff = Math.abs(this.selectedProduct.rotation.x - origRot.x)
        const ryDiff = Math.abs(this.selectedProduct.rotation.y - origRot.y)
        if (rxDiff > 0.01 || ryDiff > 0.01) {
          this.selectedProduct.rotation.x += (origRot.x - this.selectedProduct.rotation.x) * PRODUCT_LERP_SPEED
          this.selectedProduct.rotation.y += (origRot.y - this.selectedProduct.rotation.y) * PRODUCT_LERP_SPEED
          done = false
        } else {
          this.selectedProduct.rotation.x = origRot.x
          this.selectedProduct.rotation.y = origRot.y
        }

        if (this.l3AnimPhase !== ANIM_PHASE.NONE) {
          done = false
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
        this.l3Returning = false
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

    this.l2PanClamp = shelfConfig.shelfWidth / 2 + 1
    log.info(MOD, `L2 pan clamp updated to ${this.l2PanClamp.toFixed(1)}`)

    this._buildGridPositions()
    this._repositionCheckout()

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

  _setTrolleySpeed(speed) {
    this.trolleySpeed = speed
    log.info(MOD, `Trolley speed set to ${speed}`)
  }

  _setTrolleyRotationSpeed(speed) {
    this.trolleyRotationSpeed = speed
    log.info(MOD, `Trolley rotation speed set to ${speed}`)
  }

  _setGridOpacity(opacity) {
    if (this.gridTileMesh) {
      this.gridTileMesh.material.opacity = opacity
    }
  }

  getState() {
    return {
      level: this.currentLevel,
      isTransitioning: this.isTransitioning,
      isDropping: this.isDropping,
      cartSize: this.cart.length,
      selectedProduct: this.selectedProduct?.userData?.id ?? this._instanceRef?.entry?.id ?? '—',
      camera: this.camera
    }
  }

  _createInspectionUI(entry) {
    this._clearInspectionGroup()

    const group = this.inspectionGroup
    group.position.copy(this.inspectTargetPos)

    const toCamera = new THREE.Vector3()
      .subVectors(this.camera.position, this.inspectTargetPos)
      .normalize()
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), toCamera)

    const title = entry?.title || entry?.productType || 'Product'
    const price = entry?.price || '$0.00'

    const infoPanel = createTextPanel(`${title}\n${price}`, {
      bgColor: 'rgba(0, 0, 0, 0.85)',
      textColor: '#ffffff',
      fontSize: 36,
      width: 512,
      height: 256,
      meshWidth: 0.5,
      meshHeight: 0.3,
      borderRadius: 12
    })
    infoPanel.position.set(-0.45, 0.15, 0)
    infoPanel.name = 'info-panel'
    group.add(infoPanel)

    const addBtn = createTextPanel('Drop in Trolley', {
      bgColor: '#27ae60',
      textColor: '#ffffff',
      fontSize: 42,
      width: 512,
      height: 96,
      meshWidth: 0.45,
      meshHeight: 0.12,
      borderRadius: 12
    })
    addBtn.position.set(0, -0.35, 0.05)
    addBtn.name = 'btn-add'
    group.add(addBtn)

    group.visible = false
  }

  _clearInspectionGroup() {
    this.inspectionGroup.children.forEach(child => {
      if (child.material) {
        if (child.material.map) child.material.map.dispose()
        child.material.dispose()
      }
      if (child.geometry) child.geometry.dispose()
    })
    while (this.inspectionGroup.children.length > 0) {
      this.inspectionGroup.remove(this.inspectionGroup.children[0])
    }
    this.inspectionGroup.visible = false
  }

  _createCheckoutTill() {
    const group = new THREE.Group()
    group.name = 'checkoutTill'

    const counterGeo = new THREE.BoxGeometry(4, 1, 1.5)
    const counterMat = new THREE.MeshStandardMaterial({ color: 0x5D4E37 })
    const counter = new THREE.Mesh(counterGeo, counterMat)
    counter.position.y = 0.5
    group.add(counter)

    const frontGeo = new THREE.BoxGeometry(4, 0.8, 0.1)
    const frontMat = new THREE.MeshStandardMaterial({ color: 0x4A3F2F })
    const front = new THREE.Mesh(frontGeo, frontMat)
    front.position.set(0, 0.4, 0.75)
    group.add(front)

    const poleGeo = new THREE.CylinderGeometry(0.03, 0.03, 3, 8)
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x333333 })
    const pole = new THREE.Mesh(poleGeo, poleMat)
    pole.position.set(0, 2.5, 0)
    group.add(pole)

    this.checkoutSign = createTextPanel('Checkout Area', {
      bgColor: '#2c3e50',
      textColor: '#ffffff',
      fontSize: 40,
      width: 512,
      height: 96,
      meshWidth: 2,
      meshHeight: 0.5,
      borderRadius: 8
    })
    this.checkoutSign.position.set(0, 3, 0)
    this.checkoutSign.name = 'checkout-sign'
    group.add(this.checkoutSign)

    const numPairs = Math.ceil(shelfConfig.numShelfUnits / 2)
    const storeEndZ = (numPairs - 1) * shelfConfig.aisleSpacingZ + shelfConfig.shelfDepth / 2
    group.position.set(0, 0, storeEndZ + 5)

    log.info(MOD, `Checkout till created at z=${group.position.z.toFixed(1)}`)
    return group
  }

  _repositionCheckout() {
    if (!this.checkoutTill) return
    const numPairs = Math.ceil(shelfConfig.numShelfUnits / 2)
    const storeEndZ = (numPairs - 1) * shelfConfig.aisleSpacingZ + shelfConfig.shelfDepth / 2
    this.checkoutTill.position.set(0, 0, storeEndZ + 5)
    log.info(MOD, `Checkout till repositioned to z=${this.checkoutTill.position.z.toFixed(1)}`)
  }

  _triggerDrop() {
    if (this.isDropping) return
    this.isDropping = true

    const addBtn = this.inspectionGroup.children.find(c => c.name === 'btn-add')
    if (addBtn) addBtn.scale.set(0.9, 0.9, 0.9)

    log.info(MOD, 'Drop animation started')
  }

  _completeDrop() {
    this.isDropping = false

    const entry = this._instanceRef?.entry
    if (entry) {
      this.cart.push({
        id: entry.id,
        title: entry.title || entry.productType,
        price: entry.price || '$0.00',
        productType: entry.productType
      })
      log.info(MOD, `Added to cart: "${entry.title || entry.productType}" ${entry.price || '$0.00'} — total: ${this.cart.length} items`)
    }

    this._clearInspectionGroup()

    if (this.selectedProduct) {
      this.scene.remove(this.selectedProduct)
      this.selectedProduct = null
    }
    this._instanceRef = null

    this.dof.disable()
    this.transitionTo(Level.SIDE_ON)
  }
}
