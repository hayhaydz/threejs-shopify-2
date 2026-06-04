import * as THREE from 'three'
import { log } from './log.js'

const MOD = 'Input'

export class InputManager {
  constructor(camera, canvas) {
    this.camera = camera
    this.canvas = canvas
    this.raycaster = new THREE.Raycaster()
    this.mouse = new THREE.Vector2()

    this.onClick = null
    this.onDragStart = null
    this.onDragMove = null
    this.onDragEnd = null
    this.onEscape = null

    this.isDragging = false
    this.pointerIsDown = false
    this.dragStart = { x: 0, y: 0 }
    this.dragDelta = { x: 0, y: 0 }
    this.dragThreshold = 5

    this._pointerDownHandler = (e) => this._handlePointerDown(e)
    this._pointerMoveHandler = (e) => this._handlePointerMove(e)
    this._pointerUpHandler = (e) => this._handlePointerUp(e)
    this._keyDownHandler = (e) => this._handleKeyDown(e)

    this.canvas.addEventListener('pointerdown', this._pointerDownHandler)
    this.canvas.addEventListener('pointermove', this._pointerMoveHandler)
    this.canvas.addEventListener('pointerup', this._pointerUpHandler)
    window.addEventListener('keydown', this._keyDownHandler)

    log.info(MOD, 'InputManager initialized')
  }

  _updateMouse(event) {
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1
  }

  _handlePointerDown(event) {
    this._updateMouse(event)
    this.pointerIsDown = true
    this.isDragging = false
    this.dragStart.x = event.clientX
    this.dragStart.y = event.clientY
    this.dragDelta.x = 0
    this.dragDelta.y = 0
  }

  _handlePointerMove(event) {
    if (!this.pointerIsDown) return

    const dx = event.clientX - this.dragStart.x
    const dy = event.clientY - this.dragStart.y

    if (!this.isDragging && (Math.abs(dx) > this.dragThreshold || Math.abs(dy) > this.dragThreshold)) {
      this.isDragging = true
      log.debug(MOD, 'Drag started')
      if (this.onDragStart) {
        this._updateMouse(event)
        this.raycaster.setFromCamera(this.mouse, this.camera)
        this.onDragStart(this.raycaster, this.mouse)
      }
    }

    this.dragDelta.x = dx
    this.dragDelta.y = dy

    if (this.isDragging && this.onDragMove) {
      this._updateMouse(event)
      this.raycaster.setFromCamera(this.mouse, this.camera)
      this.onDragMove(this.dragDelta, this.isDragging, this.raycaster, this.mouse)
      this.dragStart.x = event.clientX
      this.dragStart.y = event.clientY
      this.dragDelta.x = 0
      this.dragDelta.y = 0
    }
  }

  _handlePointerUp(event) {
    this._updateMouse(event)
    this.raycaster.setFromCamera(this.mouse, this.camera)

    if (this.isDragging) {
      log.debug(MOD, 'Drag ended')
      if (this.onDragEnd) this.onDragEnd()
    } else {
      log.debug(MOD, `Click at screen(${event.clientX},${event.clientY}) NDC(${this.mouse.x.toFixed(2)},${this.mouse.y.toFixed(2)})`)
      if (this.onClick) this.onClick(this.raycaster, this.mouse)
    }

    this.pointerIsDown = false
    this.isDragging = false
    this.dragDelta.x = 0
    this.dragDelta.y = 0
  }

  _handleKeyDown(event) {
    if (event.key === 'Escape') {
      log.debug(MOD, 'Escape pressed')
      if (this.onEscape) this.onEscape()
    }
  }

  dispose() {
    this.canvas.removeEventListener('pointerdown', this._pointerDownHandler)
    this.canvas.removeEventListener('pointermove', this._pointerMoveHandler)
    this.canvas.removeEventListener('pointerup', this._pointerUpHandler)
    window.removeEventListener('keydown', this._keyDownHandler)
  }
}
