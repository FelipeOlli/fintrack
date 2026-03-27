let revision = 0
const listeners = new Set<() => void>()

export function subscribeDash(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function getDashRevision() {
  return revision
}

export function bumpDash() {
  revision += 1
  listeners.forEach((l) => l())
}
