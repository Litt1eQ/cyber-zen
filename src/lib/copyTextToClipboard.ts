export async function copyTextToClipboard(text: string, unsupportedMessage: string) {
  const value = String(text ?? '')
  if (!value) return

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value)
      return
    } catch {
      // fall through to legacy approach
    }
  }

  const el = document.createElement('textarea')
  el.value = value
  el.setAttribute('readonly', 'true')
  el.style.position = 'fixed'
  el.style.top = '-1000px'
  el.style.left = '-1000px'
  document.body.appendChild(el)
  try {
    el.focus()
    el.select()
    const ok = document.execCommand?.('copy')
    if (!ok) throw new Error(unsupportedMessage)
  } finally {
    document.body.removeChild(el)
  }
}

