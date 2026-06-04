const LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 }

const COLORS = {
  DEBUG: '#888',
  INFO: '#4fc3f7',
  WARN: '#ffb74d',
  ERROR: '#ef5350'
}

let minLevel = LEVELS.DEBUG

export function setLogLevel(level) {
  minLevel = LEVELS[level] ?? LEVELS.DEBUG
}

function timestamp() {
  const d = new Date()
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  const s = String(d.getSeconds()).padStart(2, '0')
  const ms = String(d.getMilliseconds()).padStart(3, '0')
  return `${h}:${m}:${s}.${ms}`
}

function emit(level, module, message, data) {
  if (LEVELS[level] < minLevel) return
  const ts = timestamp()
  const prefix = `%c[${ts}] [${level}] [${module}]`
  const style = `color: ${COLORS[level]}; font-weight: bold;`
  if (data !== undefined) {
    console.groupCollapsed(prefix, style, message)
    console.log(data)
    console.groupEnd()
  } else {
    console.log(prefix, style, message)
  }
}

export const log = {
  debug: (mod, msg, data) => emit('DEBUG', mod, msg, data),
  info: (mod, msg, data) => emit('INFO', mod, msg, data),
  warn: (mod, msg, data) => emit('WARN', mod, msg, data),
  error: (mod, msg, data) => emit('ERROR', mod, msg, data)
}
