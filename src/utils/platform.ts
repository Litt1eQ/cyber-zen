export function isMac() {
  if (typeof navigator === 'undefined') return false
  return navigator.platform.toLowerCase().includes('mac')
}

export function isWindows() {
  if (typeof navigator === 'undefined') return false
  const platform = navigator.platform.toLowerCase()
  const userAgent = navigator.userAgent.toLowerCase()
  return platform.includes('win') || userAgent.includes('windows')
}

export function isLinux() {
  if (typeof navigator === 'undefined') return false
  const platform = navigator.platform.toLowerCase()
  const userAgent = navigator.userAgent.toLowerCase()
  return platform.includes('linux') || userAgent.includes('linux')
}
