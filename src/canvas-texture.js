import * as THREE from 'three'

export function createTextPanel(text, opts = {}) {
  const {
    bgColor = '#333333',
    textColor = '#ffffff',
    fontSize = 48,
    width = 512,
    height = 128,
    borderRadius = 16,
    fontFamily = 'sans-serif',
    meshWidth = 4,
    meshHeight = 1,
    transparent = true
  } = opts

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')

  _drawPanel(ctx, text, { bgColor, textColor, fontSize, width, height, borderRadius, fontFamily })

  const texture = new THREE.CanvasTexture(canvas)
  texture.minFilter = THREE.LinearFilter
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent,
    depthWrite: false,
    side: THREE.DoubleSide
  })
  const geo = new THREE.PlaneGeometry(meshWidth, meshHeight)
  const mesh = new THREE.Mesh(geo, material)
  mesh.userData.isTextPanel = true
  mesh.userData.canvas = canvas
  mesh.userData.panelOpts = { bgColor, textColor, fontSize, width, height, borderRadius, fontFamily }

  return mesh
}

export function updateTextPanel(mesh, text, opts = {}) {
  if (!mesh.userData.isTextPanel) return

  const canvas = mesh.userData.canvas
  const ctx = canvas.getContext('2d')
  const mergedOpts = { ...mesh.userData.panelOpts, ...opts }

  ctx.clearRect(0, 0, canvas.width, canvas.height)
  _drawPanel(ctx, text, mergedOpts)
  mesh.material.map.needsUpdate = true
}

function _drawPanel(ctx, text, opts) {
  const { bgColor, textColor, fontSize, width, height, borderRadius, fontFamily } = opts

  ctx.fillStyle = bgColor
  ctx.beginPath()
  ctx.roundRect(0, 0, width, height, borderRadius)
  ctx.fill()

  ctx.fillStyle = textColor
  const lines = text.split('\n')
  const lineHeight = fontSize * 1.3
  const totalHeight = lines.length * lineHeight
  const startY = (height - totalHeight) / 2 + fontSize / 2

  ctx.font = `bold ${fontSize}px ${fontFamily}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], width / 2, startY + i * lineHeight)
  }
}
