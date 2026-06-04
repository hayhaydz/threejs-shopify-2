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
  numAisles: 4,
  productScaleMin: 0.7,
  productScaleRange: 0.7,
  skipHiddenProducts: true
}

const PRODUCT_COLORS = [
  0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6,
  0x1abc9c, 0xe67e22, 0x2980b9, 0x27ae60, 0xc0392b,
  0x8e44ad, 0xd35400, 0x16a085, 0x2c3e50, 0xf1c40f,
  0x7f8c8d, 0xe91e63, 0x00bcd4, 0x8bc34a, 0xff5722,
  0x607d8b, 0x795548, 0x009688, 0x673ab7, 0xff9800,
  0x03a9f4, 0x4caf50, 0xffc107, 0x5677fc, 0xff4081
]

let productIdCounter = 0

function createShelfUnit() {
  const { shelfWidth, shelfHeight, shelfDepth, boardThickness, numTiers } = shelfConfig
  const group = new THREE.Group()
  group.name = 'shelfUnit'

  const woodMat = new THREE.MeshStandardMaterial({ color: 0x8B7355 })

  const backGeo = new THREE.BoxGeometry(shelfWidth, shelfHeight, boardThickness)
  const back = new THREE.Mesh(backGeo, woodMat)
  back.position.set(0, shelfHeight / 2, -shelfDepth / 2 + boardThickness / 2)
  group.add(back)

  const sideGeo = new THREE.BoxGeometry(boardThickness, shelfHeight, shelfDepth)
  const left = new THREE.Mesh(sideGeo, woodMat)
  left.position.set(-shelfWidth / 2 + boardThickness / 2, shelfHeight / 2, 0)
  group.add(left)

  const right = new THREE.Mesh(sideGeo, woodMat)
  right.position.set(shelfWidth / 2 - boardThickness / 2, shelfHeight / 2, 0)
  group.add(right)

  const tierSpacing = shelfHeight / numTiers

  for (let i = 0; i <= numTiers; i++) {
    const y = i * tierSpacing
    const shelfGeo = new THREE.BoxGeometry(shelfWidth - boardThickness * 2, boardThickness, shelfDepth)
    const shelf = new THREE.Mesh(shelfGeo, woodMat)
    shelf.position.set(0, y, 0)
    shelf.name = 'shelfBoard'
    group.add(shelf)
  }

  return group
}

function populateShelf(shelfGroup) {
  const { shelfWidth, shelfHeight, shelfDepth, boardThickness, numTiers, productsPerTier, depthRows, productScaleMin, productScaleRange } = shelfConfig
  const tierSpacing = shelfHeight / numTiers
  const usableWidth = shelfWidth - boardThickness * 2 - 0.1
  const usableDepth = shelfDepth - 0.1
  const rowSpacing = usableDepth / depthRows

  for (let tier = 0; tier < numTiers; tier++) {
    const baseY = tier * tierSpacing + boardThickness
    const colSpacing = usableWidth / productsPerTier
    const startX = -usableWidth / 2 + colSpacing / 2

    for (let row = 0; row < depthRows; row++) {
      const z = -usableDepth / 2 + rowSpacing / 2 + row * rowSpacing

      for (let col = 0; col < productsPerTier; col++) {
        const colorIdx = (tier * depthRows * productsPerTier + row * productsPerTier + col) % PRODUCT_COLORS.length
        const color = PRODUCT_COLORS[colorIdx]
        const isCylinder = (tier + row + col) % 4 === 0

        let geo, halfH
        if (isCylinder) {
          const r = 0.06 + Math.random() * 0.04
          const h = 0.12 + Math.random() * 0.1
          geo = new THREE.CylinderGeometry(r, r, h, 8)
          halfH = h / 2
        } else {
          const w = 0.1 + Math.random() * 0.08
          const h = 0.12 + Math.random() * 0.1
          const d = 0.08 + Math.random() * 0.06
          geo = new THREE.BoxGeometry(w, h, d)
          halfH = h / 2
        }

        const mat = new THREE.MeshStandardMaterial({ color })
        const mesh = new THREE.Mesh(geo, mat)

        const scaleMultiplier = productScaleMin + Math.random() * productScaleRange
        mesh.scale.set(scaleMultiplier, scaleMultiplier, scaleMultiplier)
        halfH *= scaleMultiplier

        const x = startX + col * colSpacing
        mesh.position.set(x, baseY + halfH, z)

        mesh.userData = {
          id: `p${productIdCounter++}`,
          originalPosition: mesh.position.clone(),
          originalRotation: mesh.rotation.clone(),
          isProduct: true
        }

        shelfGroup.add(mesh)
      }
    }
  }
}

export function createAisleSystem() {
  const { numAisles, aisleSpacingZ, shelfDepth, aisleGap, skipHiddenProducts } = shelfConfig
  const system = new THREE.Group()
  system.name = 'aisleSystem'

  let totalProducts = 0
  let hiddenShelves = 0

  for (let a = 0; a < numAisles; a++) {
    const baseZ = a * aisleSpacingZ

    const shelfA = createShelfUnit()
    populateShelf(shelfA)
    shelfA.position.set(0, 0, baseZ)
    system.add(shelfA)

    const shelfB = createShelfUnit()
    if (skipHiddenProducts) {
      hiddenShelves++
    } else {
      populateShelf(shelfB)
    }
    shelfB.position.set(0, 0, baseZ + shelfDepth + aisleGap)
    shelfB.rotation.y = Math.PI
    system.add(shelfB)

    const countBefore = totalProducts
    totalProducts = system.children.reduce((sum, child) => {
      return sum + child.children.filter(c => c.userData.isProduct).length
    }, 0)
    const added = totalProducts - countBefore
    log.info(MOD, `Aisle ${a}: 2 shelf units at z=${baseZ.toFixed(1)}, ${added} products`)
  }

  const totalShelves = numAisles * 2
  log.info(MOD, `Created ${numAisles} aisles, ${totalShelves} shelf units, ${totalProducts} products${hiddenShelves > 0 ? ` (${hiddenShelves}/${totalShelves} shelves hidden)` : ''}`)
  return system
}

export function rebuildAisleSystem(scene, levelManager) {
  const old = scene.children.find(c => c.name === 'aisleSystem')
  if (old) {
    old.traverse(c => {
      if (c.geometry) c.geometry.dispose()
      if (c.material) {
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
  const { shelfWidth, numAisles, aisleSpacingZ, shelfDepth, aisleGap } = shelfConfig
  const floorWidth = shelfWidth * 1.5
  const floorDepth = (numAisles * aisleSpacingZ + shelfDepth * 2 + aisleGap) * 1.3
  const floorCenterZ = (numAisles * aisleSpacingZ + shelfDepth + aisleGap / 2) / 2

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
      const hasProducts = c.children.some(ch => ch.userData?.isProduct)
      if (!hasProducts) hiddenShelves++
      products += c.children.filter(ch => ch.userData?.isProduct).length
    }
  })
  return { shelves, products, hiddenShelves }
}

export function getAllShelfGroups(aisleSystem) {
  return aisleSystem.children.filter(c => c.name === 'shelfUnit')
}

export function getAllProducts(aisleSystem) {
  const products = []
  aisleSystem.traverse(child => {
    if (child.userData?.isProduct) products.push(child)
  })
  return products
}
