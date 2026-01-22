export async function copyPngToClipboard(blob: Blob, unsupportedMessage: string) {
  const ClipboardItemCtor = (window as unknown as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem
  if (!ClipboardItemCtor || !navigator.clipboard?.write) {
    throw new Error(unsupportedMessage)
  }
  const item = new ClipboardItemCtor({ [blob.type || 'image/png']: blob })
  await navigator.clipboard.write([item])
}

