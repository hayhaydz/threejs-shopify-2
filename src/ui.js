let dimmerEl = null
let closeBtnEl = null

function ensureDimmer() {
  if (!dimmerEl) {
    dimmerEl = document.createElement('div')
    dimmerEl.id = 'dimmer'
    document.body.appendChild(dimmerEl)
  }
  return dimmerEl
}

function ensureCloseButton() {
  if (!closeBtnEl) {
    closeBtnEl = document.createElement('button')
    closeBtnEl.id = 'close-btn'
    closeBtnEl.textContent = '✕'
    document.body.appendChild(closeBtnEl)
  }
  return closeBtnEl
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

export function showCloseButton(onClick) {
  const el = ensureCloseButton()
  el.style.display = 'block'
  el.onclick = onClick
  requestAnimationFrame(() => {
    el.classList.add('visible')
  })
}

export function hideCloseButton() {
  const el = ensureCloseButton()
  el.classList.remove('visible')
  setTimeout(() => {
    el.style.display = 'none'
  }, 300)
}
