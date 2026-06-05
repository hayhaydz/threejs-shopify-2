let dimmerEl = null

function ensureDimmer() {
  if (!dimmerEl) {
    dimmerEl = document.createElement('div')
    dimmerEl.id = 'dimmer'
    document.body.appendChild(dimmerEl)
  }
  return dimmerEl
}

export function showDimmer() {
  const el = ensureDimmer()
  el.style.pointerEvents = 'auto'
  requestAnimationFrame(() => {
    el.classList.add('visible')
  })
}

export function hideDimmer() {
  const el = ensureDimmer()
  el.classList.remove('visible')
  el.style.pointerEvents = 'none'
}
