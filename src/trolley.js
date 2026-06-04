import * as THREE from 'three'
import { log } from './log.js'

const MOD = 'Trolley'

export function createTrolley() {
  const group = new THREE.Group()
  group.name = 'trolley'

  const baseGeo = new THREE.BoxGeometry(1.0, 0.4, 0.7)
  const baseMat = new THREE.MeshStandardMaterial({ color: 0xe74c3c })
  const base = new THREE.Mesh(baseGeo, baseMat)
  base.position.y = 0.2
  group.add(base)

  const handleGeo = new THREE.BoxGeometry(0.06, 0.6, 0.06)
  const handleMat = new THREE.MeshStandardMaterial({ color: 0x333333 })
  const handle = new THREE.Mesh(handleGeo, handleMat)
  handle.position.set(0, 0.7, -0.35)
  group.add(handle)

  const poleGeo = new THREE.CylinderGeometry(0.03, 0.03, 4.2, 8)
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x333333 })
  const pole = new THREE.Mesh(poleGeo, poleMat)
  pole.position.set(0, 2.8, 0)
  group.add(pole)

  const flagGeo = new THREE.BoxGeometry(0.5, 0.3, 0.04)
  const flagMat = new THREE.MeshStandardMaterial({ color: 0xe74c3c })
  const flag = new THREE.Mesh(flagGeo, flagMat)
  flag.position.set(0.27, 4.75, 0)
  group.add(flag)

  const ballGeo = new THREE.SphereGeometry(0.08, 8, 8)
  const ballMat = new THREE.MeshStandardMaterial({ color: 0xf1c40f })
  const ball = new THREE.Mesh(ballGeo, ballMat)
  ball.position.set(0, 4.95, 0)
  group.add(ball)

  log.info(MOD, 'Trolley created with flag pole')
  return group
}
