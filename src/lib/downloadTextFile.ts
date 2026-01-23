export function downloadTextFile({
  filename,
  text,
  mime = 'application/json',
}: {
  filename: string
  text: string
  mime?: string
}) {
  const safeName = (filename || 'download.txt').replace(/[\\/:*?"<>|]+/g, '_')
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = safeName
  a.rel = 'noopener'
  a.style.display = 'none'
  document.body.appendChild(a)
  try {
    a.click()
  } finally {
    document.body.removeChild(a)
    // Delay revocation to avoid flaky downloads in some WebView environments.
    window.setTimeout(() => {
      try {
        URL.revokeObjectURL(url)
      } catch {
        // ignore
      }
    }, 1000)
  }
}
