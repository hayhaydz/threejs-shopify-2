import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { log } from './log.js'

const MOD = 'DOF'

export class DOFManager {
  constructor(renderer, scene, camera) {
    this.composer = new EffectComposer(renderer)
    this.enabled = false

    this.renderPass = new RenderPass(scene, camera)
    this.composer.addPass(this.renderPass)

    this.bokehPass = new BokehPass(scene, camera, {
      focus: 2.0,
      aperture: 0.00025,
      maxblur: 0.01
    })
    this.bokehPass.enabled = false
    this.composer.addPass(this.bokehPass)

    this.outputPass = new OutputPass()
    this.composer.addPass(this.outputPass)

    log.info(MOD, 'DOF manager created')
  }

  enable(focusDistance) {
    this.enabled = true
    this.bokehPass.enabled = true
    this.bokehPass.uniforms['focus'].value = focusDistance
    this.bokehPass.uniforms['aperture'].value = 0.004
    this.bokehPass.uniforms['maxblur'].value = 0.015
    log.info(MOD, `DOF enabled — focus=${focusDistance.toFixed(2)}`)
  }

  disable() {
    this.enabled = false
    this.bokehPass.enabled = false
    log.info(MOD, 'DOF disabled')
  }

  updateFocus(focusDistance) {
    if (this.enabled) {
      this.bokehPass.uniforms['focus'].value = focusDistance
    }
  }

  render() {
    this.composer.render()
  }

  resize() {
    this.composer.setSize(window.innerWidth, window.innerHeight)
  }

  updateCamera(camera) {
    this.renderPass.camera = camera
    this.bokehPass.camera = camera
  }
}
