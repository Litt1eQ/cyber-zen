export type Live2DResourceEntry = {
  group: string
  src: string
}

export type PressedLive2DResourceMap = Record<string, { inputKey: string; src: string }>

export function buildResourceKeyCandidates(inputKey: string): string[] {
  const candidates = [inputKey]

  if (inputKey.startsWith('Digit')) {
    candidates.push(inputKey.replace(/^Digit/, 'Num'))
  }

  if (inputKey === 'Backquote') {
    candidates.push('BackQuote')
  }

  if (inputKey === 'Enter') {
    candidates.push('Return')
  }

  if (inputKey === 'ArrowLeft') candidates.push('LeftArrow')
  if (inputKey === 'ArrowRight') candidates.push('RightArrow')
  if (inputKey === 'ArrowUp') candidates.push('UpArrow')
  if (inputKey === 'ArrowDown') candidates.push('DownArrow')

  const modifierMatch = inputKey.match(/^(Control|Shift|Alt|Meta)(Left|Right)$/)
  if (modifierMatch) {
    candidates.push(modifierMatch[1])
  }

  return [...new Set(candidates)]
}

export function resolveResourceEntry(
  inputKey: string,
  supported: Record<string, Live2DResourceEntry>,
): (Live2DResourceEntry & { key: string }) | null {
  for (const candidate of buildResourceKeyCandidates(inputKey)) {
    const matched = supported[candidate]
    if (matched) {
      return {
        key: candidate,
        ...matched,
      }
    }
  }

  return null
}

export function pressResource(
  current: PressedLive2DResourceMap,
  inputKey: string,
  supported: Record<string, Live2DResourceEntry>,
): PressedLive2DResourceMap {
  const resolved = resolveResourceEntry(inputKey, supported)
  if (!resolved) return current

  return {
    ...current,
    [resolved.group]: {
      inputKey,
      src: resolved.src,
    },
  }
}

export function releaseResource(
  current: PressedLive2DResourceMap,
  inputKey: string,
): PressedLive2DResourceMap {
  const next = { ...current }

  for (const [group, entry] of Object.entries(next)) {
    if (entry.inputKey !== inputKey) continue
    delete next[group]
  }

  return next
}
