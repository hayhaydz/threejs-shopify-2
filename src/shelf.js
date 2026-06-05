import * as THREE from 'three'
import { log } from './log.js'

const MOD = 'Shelf'

export const shelfConfig = {
  shelfWidth: 18,
  shelfHeight: 3.5,
  shelfDepth: 1.0,
  boardThickness: 0.04,
  numTiers: 6,
  productsPerTier: 48,
  depthRows: 6,
  aisleGap: 3.6,
  aisleSpacingZ: 5.6,
  numShelfUnits: 8,
  productScaleMin: 0.7,
  productScaleRange: 0.7,
  skipHiddenProducts: true,
  showClickZones: false
}

const PRODUCT_TYPES = [
  { name: 'cereal',  color: 0xe74c3c, shape: 'box' },
  { name: 'soup',    color: 0xf39c12, shape: 'cyl' },
  { name: 'pasta',   color: 0x2ecc71, shape: 'box' },
  { name: 'sauce',   color: 0x3498db, shape: 'cyl' },
  { name: 'rice',    color: 0x9b59b6, shape: 'box' },
  { name: 'beans',   color: 0xe67e22, shape: 'cyl' },
  { name: 'flour',   color: 0xf1c40f, shape: 'box' },
  { name: 'olives',  color: 0x1abc9c, shape: 'cyl' },
  { name: 'coffee',  color: 0x795548, shape: 'box' },
  { name: 'tuna',    color: 0x009688, shape: 'cyl' }
]

export const sharedBoxGeo = new THREE.BoxGeometry(0.14, 0.17, 0.11)
export const sharedCylGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.17, 8)
const sharedWoodMat = new THREE.MeshStandardMaterial({ color: 0x8B7355 })
const sharedProductMat = new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.0 })

let productIdCounter = 0

function createShelfUnit() {
  const { shelfWidth, shelfHeight, shelfDepth, boardThickness, numTiers } = shelfConfig
  const group = new THREE.Group()
  group.name = 'shelfUnit'

  const backGeo = new THREE.BoxGeometry(shelfWidth, shelfHeight, boardThickness)
  const back = new THREE.Mesh(backGeo, sharedWoodMat)
  back.position.set(0, shelfHeight / 2, -shelfDepth / 2 + boardThickness / 2)
  group.add(back)

  const sideGeo = new THREE.BoxGeometry(boardThickness, shelfHeight, shelfDepth)
  const left = new THREE.Mesh(sideGeo, sharedWoodMat)
  left.position.set(-shelfWidth / 2 + boardThickness / 2, shelfHeight / 2, 0)
  group.add(left)

  const right = new THREE.Mesh(sideGeo, sharedWoodMat)
  right.position.set(shelfWidth / 2 - boardThickness / 2, shelfHeight / 2, 0)
  group.add(right)

  const spanBetweenFaces = shelfHeight - boardThickness
  const tierSpacing = spanBetweenFaces / numTiers

  for (let i = 0; i <= numTiers; i++) {
    const y = boardThickness / 2 + i * tierSpacing
    const shelfGeo = new THREE.BoxGeometry(shelfWidth - boardThickness * 2, boardThickness, shelfDepth)
    const shelf = new THREE.Mesh(shelfGeo, sharedWoodMat)
    shelf.position.set(0, y, 0)
    shelf.name = 'shelfBoard'
    group.add(shelf)
  }

  return group
}

function populateShelf(shelfGroup) {
  const { shelfWidth, shelfHeight, shelfDepth, boardThickness, numTiers, productsPerTier, depthRows, productScaleMin, productScaleRange } = shelfConfig
  const spanBetweenFaces = shelfHeight - boardThickness
  const tierSpacing = spanBetweenFaces / numTiers
  const usableWidth = shelfWidth - boardThickness * 2 - 0.1
  const usableDepth = shelfDepth - 0.1
  const rowSpacing = usableDepth / depthRows

  const totalSlots = numTiers * depthRows * productsPerTier
  let boxCount = 0
  let cylCount = 0

  const slotData = new Array(totalSlots)
  let idx = 0

  const typeCounts = {}
  PRODUCT_TYPES.forEach(t => typeCounts[t.name] = 0)

  for (let tier = 0; tier < numTiers; tier++) {
    const boardTopY = boardThickness + tier * tierSpacing
    const colSpacing = usableWidth / productsPerTier
    const startX = -usableWidth / 2 + colSpacing / 2

    const tierProducts = []

    for (let col = 0; col < productsPerTier; col++) {
      const productType = PRODUCT_TYPES[Math.floor(Math.random() * PRODUCT_TYPES.length)]
      const x = startX + col * colSpacing
      const scaleMultiplier = productScaleMin + Math.random() * productScaleRange
      typeCounts[productType.name]++

      for (let row = 0; row < depthRows; row++) {
        const isCylinder = productType.shape === 'cyl'
        const z = -usableDepth / 2 + rowSpacing / 2 + row * rowSpacing
        const halfH = 0.17 / 2
        const y = boardTopY + halfH * scaleMultiplier

        if (isCylinder) {
          slotData[idx] = { type: 'cyl', boxIdx: cylCount, x, y, z, scaleMultiplier, color: productType.color, productType: productType.name }
          cylCount++
        } else {
          slotData[idx] = { type: 'box', boxIdx: boxCount, x, y, z, scaleMultiplier, color: productType.color, productType: productType.name }
          boxCount++
        }
        idx++
      }

      tierProducts.push(`${col}:${productType.name}(${productType.shape},scale=${scaleMultiplier.toFixed(2)})`)
    }

    log.debug(MOD, `Tier ${tier} products (first 10 of ${productsPerTier}): ${tierProducts.slice(0, 10).join(', ')}`)
  }

  log.info(MOD, `Product type distribution: ${Object.entries(typeCounts).map(([k, v]) => `${k}=${v}`).join(', ')}`)
  log.info(MOD, `Instance counts: ${boxCount} boxes, ${cylCount} cylinders, ${totalSlots} total slots`)

  const registry = []
  const dummy = new THREE.Object3D()

  if (boxCount > 0) {
    const boxInstances = new THREE.InstancedMesh(sharedBoxGeo, sharedProductMat, boxCount)
    boxInstances.name = 'boxInstances'
    boxInstances.userData = { isInstancedProducts: true, productType: 'box' }

    let bIdx = 0
    for (let i = 0; i < totalSlots; i++) {
      const s = slotData[i]
      if (s.type !== 'box') continue

      dummy.position.set(s.x, s.y, s.z)
      dummy.scale.set(s.scaleMultiplier, s.scaleMultiplier, s.scaleMultiplier)
      dummy.rotation.set(0, 0, 0)
      dummy.updateMatrix()
      boxInstances.setMatrixAt(bIdx, dummy.matrix)
      boxInstances.setColorAt(bIdx, new THREE.Color(s.color))

      if (bIdx < 3) {
        log.debug(MOD, `Box instance ${bIdx}: type=${s.productType} color=0x${s.color.toString(16).padStart(6, '0')} pos=(${s.x.toFixed(2)},${s.y.toFixed(2)},${s.z.toFixed(2)}) scale=${s.scaleMultiplier.toFixed(2)}`)
      }

      registry.push({
        id: `p${productIdCounter++}`,
        meshType: 'box',
        instanceId: bIdx,
        originalPosition: new THREE.Vector3(s.x, s.y, s.z),
        originalRotation: new THREE.Euler(0, 0, 0),
        scale: s.scaleMultiplier,
        color: s.color,
        productType: s.productType,
        isHidden: false
      })
      bIdx++
    }

    boxInstances.instanceMatrix.needsUpdate = true
    boxInstances.instanceColor.needsUpdate = true
    boxInstances.userData.registry = registry.filter(r => r.meshType === 'box')
    shelfGroup.add(boxInstances)
  }

  if (cylCount > 0) {
    const cylInstances = new THREE.InstancedMesh(sharedCylGeo, sharedProductMat, cylCount)
    cylInstances.name = 'cylInstances'
    cylInstances.userData = { isInstancedProducts: true, productType: 'cyl' }

    const cylRegistry = []
    let cIdx = 0
    for (let i = 0; i < totalSlots; i++) {
      const s = slotData[i]
      if (s.type !== 'cyl') continue

      dummy.position.set(s.x, s.y, s.z)
      dummy.scale.set(s.scaleMultiplier, s.scaleMultiplier, s.scaleMultiplier)
      dummy.rotation.set(0, 0, 0)
      dummy.updateMatrix()
      cylInstances.setMatrixAt(cIdx, dummy.matrix)
      cylInstances.setColorAt(cIdx, new THREE.Color(s.color))

      if (cIdx < 3) {
        log.debug(MOD, `Cyl instance ${cIdx}: type=${s.productType} color=0x${s.color.toString(16).padStart(6, '0')} pos=(${s.x.toFixed(2)},${s.y.toFixed(2)},${s.z.toFixed(2)}) scale=${s.scaleMultiplier.toFixed(2)}`)
      }

      cylRegistry.push({
        id: `p${cylCount > 0 ? productIdCounter++ : productIdCounter++}`,
        meshType: 'cyl',
        instanceId: cIdx,
        originalPosition: new THREE.Vector3(s.x, s.y, s.z),
        originalRotation: new THREE.Euler(0, 0, 0),
        scale: s.scaleMultiplier,
        color: s.color,
        productType: s.productType,
        isHidden: false
      })
      cIdx++
    }

    cylInstances.instanceMatrix.needsUpdate = true
    cylInstances.instanceColor.needsUpdate = true
    cylInstances.userData.registry = cylRegistry
    registry.push(...cylRegistry)
    shelfGroup.add(cylInstances)
  }

  shelfGroup.userData.productRegistry = registry
  shelfGroup.userData.totalProducts = registry.length
}

export function getInstanceMesh(shelfGroup, type) {
  return shelfGroup.children.find(c => c.userData?.isInstancedProducts && c.userData.productType === type)
}

export function hideInstance(shelfGroup, meshType, instanceId) {
  const mesh = getInstanceMesh(shelfGroup, meshType)
  if (!mesh) return
  const dummy = new THREE.Object3D()
  dummy.position.set(0, -1000, 0)
  dummy.scale.set(0, 0, 0)
  dummy.updateMatrix()
  mesh.setMatrixAt(instanceId, dummy.matrix)
  mesh.instanceMatrix.needsUpdate = true

  const entry = mesh.userData.registry.find(r => r.instanceId === instanceId && r.meshType === meshType)
  if (entry) entry.isHidden = true
}

export function showInstance(shelfGroup, meshType, instanceId) {
  const mesh = getInstanceMesh(shelfGroup, meshType)
  if (!mesh) return
  const entry = mesh.userData.registry.find(r => r.instanceId === instanceId && r.meshType === meshType)
  if (!entry) return

  const dummy = new THREE.Object3D()
  dummy.position.copy(entry.originalPosition)
  dummy.rotation.copy(entry.originalRotation)
  dummy.scale.set(entry.scale, entry.scale, entry.scale)
  dummy.updateMatrix()
  mesh.setMatrixAt(instanceId, dummy.matrix)
  mesh.instanceMatrix.needsUpdate = true
  entry.isHidden = false
}

export function spawnStandaloneMesh(meshType, position, scale, color) {
  const geo = meshType === 'cyl' ? sharedCylGeo : sharedBoxGeo
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.0 })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.copy(position)
  mesh.scale.set(scale, scale, scale)
  mesh.userData = {
    isProduct: true,
    originalPosition: position.clone(),
    originalRotation: new THREE.Euler(0, 0, 0)
  }
  return mesh
}

export function getWorldPositionFromInstance(shelfGroup, meshType, instanceId) {
  const mesh = getInstanceMesh(shelfGroup, meshType)
  if (!mesh) return null
  const matrix = new THREE.Matrix4()
  mesh.getMatrixAt(instanceId, matrix)
  const pos = new THREE.Vector3()
  pos.setFromMatrixPosition(matrix)
  shelfGroup.localToWorld(pos)
  return pos
}

export function findProductByInstanceId(shelfGroup, meshType, instanceId) {
  const mesh = getInstanceMesh(shelfGroup, meshType)
  if (!mesh) return null
  return mesh.userData.registry.find(r => r.instanceId === instanceId) || null
}

export function findShelfGroupForHit(hitObject) {
  let current = hitObject
  while (current) {
    if (current.name === 'shelfUnit') return current
    current = current.parent
  }
  return null
}

function getPairZ(pairIndex, aisleSpacingZ) {
  return pairIndex * aisleSpacingZ
}

export function createAisleSystem() {
  const { numShelfUnits, aisleSpacingZ, shelfDepth, aisleGap, skipHiddenProducts, shelfWidth, shelfHeight, showClickZones } = shelfConfig
  const system = new THREE.Group()
  system.name = 'aisleSystem'

  let totalProducts = 0
  let hiddenShelves = 0
  const numPairs = Math.ceil(numShelfUnits / 2)

  const minSpacing = shelfDepth * 2 + aisleGap
  if (aisleSpacingZ < minSpacing) {
    log.warn(MOD, `aisleSpacingZ (${aisleSpacingZ}) < min required (${minSpacing.toFixed(1)})`)
  }

  const layoutMap = []

  for (let i = 0; i < numShelfUnits; i++) {
    const isFacingCamera = (i % 2 === 0)
    const pairIndex = Math.floor(i / 2)
    const pairZ = getPairZ(pairIndex, aisleSpacingZ)

    const unit = createShelfUnit()
    unit.userData.shelfUnitIndex = i
    unit.userData.facesCamera = isFacingCamera

    if (isFacingCamera) {
      populateShelf(unit)
      unit.position.set(0, 0, pairZ)

      const clickPlaneGeo = new THREE.PlaneGeometry(shelfWidth, shelfHeight)
      const clickPlaneMat = new THREE.MeshBasicMaterial({
        visible: showClickZones,
        color: 0x00ff00,
        transparent: true,
        opacity: 0.15,
        side: THREE.FrontSide
      })
      const clickPlane = new THREE.Mesh(clickPlaneGeo, clickPlaneMat)
      clickPlane.position.set(0, shelfHeight / 2, shelfDepth / 2)
      clickPlane.userData = { clickZone: true, shelfUnitIndex: i }
      clickPlane.name = 'clickZone'
      unit.add(clickPlane)

      const unitZmin = pairZ - shelfDepth / 2
      const unitZmax = pairZ + shelfDepth / 2

      log.debug(MOD, `Unit ${i} (faces +Z)`, {
        pos: `(${unit.position.x}, ${unit.position.y}, ${unit.position.z})`,
        zRange: `[${unitZmin.toFixed(2)}, ${unitZmax.toFixed(2)}]`
      })

      layoutMap.push({ unitIndex: i, pairIndex, zMin: unitZmin, zMax: unitZmax })
    } else {
      const unitZ = pairZ - shelfDepth
      unit.position.set(0, 0, unitZ)
      unit.rotation.y = Math.PI

      if (skipHiddenProducts) {
        hiddenShelves++
      } else {
        populateShelf(unit)
      }

      const unitZmin = unitZ - shelfDepth / 2
      const unitZmax = unitZ + shelfDepth / 2

      log.debug(MOD, `Unit ${i} (rotated, faces -Z)`, {
        pos: `(${unit.position.x}, ${unit.position.y}, ${unit.position.z})`,
        zRange: `[${unitZmin.toFixed(2)}, ${unitZmax.toFixed(2)}]`
      })

      const prevEntry = layoutMap[layoutMap.length - 1]
      if (prevEntry) {
        const backToBackGap = prevEntry.zMin - unitZmax
        if (backToBackGap < 0) {
          log.warn(MOD, `OVERLAP: unit ${prevEntry.unitIndex} and unit ${i} overlap by ${Math.abs(backToBackGap).toFixed(2)}m`)
        }
      }

      layoutMap.push({ unitIndex: i, pairIndex, zMin: unitZmin, zMax: unitZmax })
    }

    system.add(unit)

    if (i > 0 && i % 2 === 0) {
      const currentPairIndex = Math.floor(i / 2)
      const prevBackEntry = layoutMap.find(e => e.unitIndex === i - 1)
      const prevFrontEntry = layoutMap.find(e => e.unitIndex === i - 2)
      if (prevBackEntry && prevFrontEntry) {
        const walkwayGap = prevBackEntry.zMin - prevFrontEntry.zMax
        if (walkwayGap >= 0) {
          if (walkwayGap < 0.5) {
            log.warn(MOD, `TIGHT: walkway between pair ${currentPairIndex - 1} and ${currentPairIndex} is only ${walkwayGap.toFixed(2)}m`)
          } else {
            log.debug(MOD, `Walkway between pair ${currentPairIndex - 1} and ${currentPairIndex}: ${walkwayGap.toFixed(2)}m`)
          }
        }
      }
    }

    const countBefore = totalProducts
    totalProducts = system.children.reduce((sum, child) => {
      return sum + (child.userData.totalProducts || 0)
    }, 0)
    const added = totalProducts - countBefore
    log.info(MOD, `Unit ${i}: z=${unit.position.z.toFixed(1)} faces=${isFacingCamera ? '+Z' : '-Z'} ${added} products`)
  }

  log.info(MOD, 'Store Layout Summary', {
    config: { numShelfUnits, aisleSpacingZ, shelfDepth, aisleGap },
    totalShelfUnits: numShelfUnits,
    totalProducts,
    hiddenShelves
  })

  log.info(MOD, `Created ${numShelfUnits} shelf units, ${totalProducts} products (instanced)${hiddenShelves > 0 ? ` (${hiddenShelves}/${numShelfUnits} hidden)` : ''}`)
  return system
}

export function rebuildAisleSystem(scene, levelManager) {
  const old = scene.children.find(c => c.name === 'aisleSystem')
  if (old) {
    old.traverse(c => {
      if (c.isInstancedMesh) {
        c.dispose()
      } else if (c.geometry) {
        c.geometry.dispose()
      }
      if (c.material && c.material !== sharedWoodMat && c.material !== sharedProductMat) {
        if (Array.isArray(c.material)) c.material.forEach(m => m.dispose())
        else c.material.dispose()
      }
    })
    scene.remove(old)
  }

  productIdCounter = 0

  const aisleSystem = createAisleSystem()
  scene.add(aisleSystem)

  if (levelManager) {
    levelManager.rebuildReferences(aisleSystem)
  }

  resizeFloor(scene)

  const stats = getStoreStats(aisleSystem)
  log.info(MOD, `Rebuilt store: ${stats.shelves} shelves, ${stats.products} products, ${stats.hiddenShelves} hidden`)

  return { aisleSystem, stats }
}

export function resizeFloor(scene) {
  const { shelfWidth, numShelfUnits, aisleSpacingZ, shelfDepth } = shelfConfig
  const numPairs = Math.ceil(numShelfUnits / 2)
  const floorWidth = shelfWidth * 1.5
  const storeZstart = -shelfDepth * 1.5
  const storeZend = (numPairs - 1) * aisleSpacingZ + shelfDepth / 2
  const floorDepth = (storeZend - storeZstart) * 1.3
  const floorCenterZ = (storeZstart + storeZend) / 2

  const floor = scene.children.find(c => c.name === 'floor')
  if (floor) {
    floor.geometry.dispose()
    floor.geometry = new THREE.PlaneGeometry(floorWidth, floorDepth)
    floor.position.set(0, 0, floorCenterZ)
    log.info(MOD, `Floor resized to ${floorWidth.toFixed(1)}x${floorDepth.toFixed(1)}, center z=${floorCenterZ.toFixed(1)}`)
  }
}

export function getStoreStats(aisleSystem) {
  let products = 0
  let shelves = 0
  let hiddenShelves = 0
  aisleSystem.children.forEach(c => {
    if (c.name === 'shelfUnit') {
      shelves++
      const count = c.userData.totalProducts || 0
      if (count === 0) hiddenShelves++
      products += count
    }
  })
  return { shelves, products, hiddenShelves }
}

export function getAllShelfGroups(aisleSystem) {
  return aisleSystem.children.filter(c => c.name === 'shelfUnit')
}

export function getAllProducts(aisleSystem) {
  const products = []
  aisleSystem.children.forEach(shelfGroup => {
    if (shelfGroup.name !== 'shelfUnit') return
    const registry = shelfGroup.userData.productRegistry
    if (registry) {
      registry.forEach(entry => {
        products.push({
          ...entry,
          shelfGroup
        })
      })
    }
  })
  return products
}

export function getAllInstanceMeshes(aisleSystem) {
  const meshes = []
  aisleSystem.traverse(c => {
    if (c.userData?.isInstancedProducts) meshes.push(c)
  })
  return meshes
}
