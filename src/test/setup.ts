import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

function createStoragePolyfill(): Storage {
  const store = new Map<string, string>()

  return {
    get length() {
      return store.size
    },
    clear() {
      store.clear()
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null
    },
    removeItem(key: string) {
      store.delete(key)
    },
    setItem(key: string, value: string) {
      store.set(key, value)
    },
  }
}

function ensureStorage(name: 'localStorage' | 'sessionStorage') {
  const current = globalThis[name]
  if (
    current
    && typeof current.clear === 'function'
    && typeof current.getItem === 'function'
    && typeof current.setItem === 'function'
  ) {
    return
  }

  Object.defineProperty(globalThis, name, {
    configurable: true,
    value: createStoragePolyfill(),
  })
}

ensureStorage('localStorage')
ensureStorage('sessionStorage')

afterEach(() => {
  cleanup()
})
