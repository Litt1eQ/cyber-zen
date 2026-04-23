import { useCallback, useEffect, useRef } from 'react'
import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { Application, Ticker } from 'pixi.js'
import { Config, CubismSetting, Live2DSprite, Priority } from 'easy-live2d'
import { COMMANDS } from '@/types/events'
import { useLive2DStore } from '@/stores/useLive2DStore'
import type { Live2DMotionInfo } from '@/types/live2d'

Config.MouseFollow = false
Config.MotionSound = false

type Live2DRendererApi = {
  load: (uuid: string, modelPath: string) => Promise<void>
  triggerTapMotion: () => Promise<void>
  triggerMotion: (group: string, no: number) => Promise<void>
  getParamRange: (id: string) => { min: number; max: number } | null
  setParam: (id: string, value: number) => void
  setExpression: (index: number | null) => void
}

export function useLive2DRenderer(canvasRef: React.RefObject<HTMLCanvasElement>): Live2DRendererApi {
  const appPromiseRef = useRef<Promise<Application | null> | null>(null)
  const spriteRef = useRef<Live2DSprite | null>(null)
  const motionsByGroupRef = useRef<Record<string, Live2DMotionInfo[]>>({})
  const tapGroupRef = useRef<string | null>(null)
  const expressionCountRef = useRef(0)
  const rendererGenerationRef = useRef(0)
  const loadGenerationRef = useRef(0)
  const setReady = useLive2DStore((state) => state.setReady)
  const resetRuntime = useLive2DStore((state) => state.resetRuntime)
  const setError = useLive2DStore((state) => state.setError)

  const destroySprite = useCallback((app: Application, sprite: Live2DSprite | null) => {
    if (!sprite) return
    if (sprite.parent === app.stage) {
      app.stage.removeChild(sprite)
    }
    sprite.destroy()
  }, [])

  const fitSprite = useCallback(() => {
    const canvas = canvasRef.current
    const sprite = spriteRef.current
    if (!canvas || !sprite) return

    const viewportWidth = Math.max(canvas.clientWidth || canvas.width || 320, 1)
    const viewportHeight = Math.max(canvas.clientHeight || canvas.height || 320, 1)
    const modelCanvas = sprite.getModelCanvasSize()

    if (modelCanvas && modelCanvas.width > 0 && modelCanvas.height > 0) {
      const scale = Math.min(viewportWidth / modelCanvas.width, viewportHeight / modelCanvas.height)
      sprite.width = modelCanvas.width * scale
      sprite.height = modelCanvas.height * scale
    } else {
      sprite.width = viewportWidth
    }

    sprite.anchor.set(0.5)
    sprite.x = viewportWidth / 2
    sprite.y = viewportHeight / 2
  }, [canvasRef])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let cancelled = false
    const rendererGeneration = rendererGenerationRef.current + 1
    rendererGenerationRef.current = rendererGeneration
    const appPromise = (async () => {
      const app = new Application()
      await app.init({
        view: canvas,
        resizeTo: window,
        backgroundAlpha: 0,
        autoDensity: true,
        resolution: Math.max(window.devicePixelRatio || 1, 1),
      })
      await waitForNextFrame()
      syncRendererSize(app, canvas)
      if (cancelled || rendererGenerationRef.current !== rendererGeneration) {
        app.destroy(false)
        return null
      }
      return app
    })()

    appPromiseRef.current = appPromise

    const observer = new ResizeObserver(() => {
      fitSprite()
    })
    observer.observe(canvas.parentElement ?? canvas)

    return () => {
      cancelled = true
      rendererGenerationRef.current += 1
      loadGenerationRef.current += 1
      observer.disconnect()
      motionsByGroupRef.current = {}
      tapGroupRef.current = null
      expressionCountRef.current = 0
      resetRuntime()
      void appPromise
        .then((app) => {
          if (!app) return
          destroySprite(app, spriteRef.current)
          spriteRef.current = null
          app.destroy(false)
        })
        .catch(() => {})
      appPromiseRef.current = null
    }
  }, [canvasRef, destroySprite, fitSprite, resetRuntime])

  const load = useCallback(async (uuid: string, modelPath: string) => {
    const appPromise = appPromiseRef.current
    if (!appPromise) return
    const rendererGeneration = rendererGenerationRef.current
    const loadGeneration = loadGenerationRef.current + 1
    loadGenerationRef.current = loadGeneration
    const isStale = () =>
      rendererGenerationRef.current !== rendererGeneration
      || loadGenerationRef.current !== loadGeneration
      || appPromiseRef.current !== appPromise

    const app = await appPromise
    if (!app || isStale()) return

    const rendererReady = await ensureRendererReady(app, canvasRef.current)
    if (isStale()) return
    if (!rendererReady) {
      const message = 'Live2D WebGL renderer did not become ready. Try reopening the main window.'
      setError(message)
      expressionCountRef.current = 0
      resetRuntime()
      throw new Error(message)
    }

    if (typeof (window as Window & { Live2DCubismCore?: unknown }).Live2DCubismCore === 'undefined') {
      const message =
        'Live2D Cubism Core is not loaded. Put live2dcubismcore.min.js under public/js and load it from index.html.'
      setError(message)
      expressionCountRef.current = 0
      resetRuntime()
      throw new Error(message)
    }

    setError(null)
    expressionCountRef.current = 0
    resetRuntime()

    const previous = spriteRef.current
    if (previous) {
      destroySprite(app, previous)
      spriteRef.current = null
    }

    let sprite: Live2DSprite | null = null
    try {
      const modelJSONText = await invoke<string>(COMMANDS.GET_LIVE2D_MODEL_JSON, { uuid })
      if (isStale()) return

      const modelJSON = JSON.parse(modelJSONText)
      const modelSetting = new CubismSetting({ modelJSON })
      modelSetting.redirectPath(({ file }) => convertFileSrc(joinModelPath(modelPath, file)))

      sprite = new Live2DSprite({
        modelSetting,
        ticker: Ticker.shared,
      })

      app.stage.addChild(sprite)
      spriteRef.current = sprite
      await sprite.ready
      if (isStale()) {
        destroySprite(app, sprite)
        if (spriteRef.current === sprite) spriteRef.current = null
        return
      }

      fitSprite()

      const motions = groupMotions(sprite.getMotions())
      const expressions = sprite.getExpressions()
      const idleGroup = resolveMotionGroup(motions, ['idle'])
      const tapGroup = resolveMotionGroup(motions, ['tap', 'hit', 'touch']) ?? idleGroup

      motionsByGroupRef.current = motions
      tapGroupRef.current = tapGroup
      expressionCountRef.current = expressions.length
      setReady(motions, expressions)

      if (idleGroup) {
        const first = motions[idleGroup]?.[0]
        if (first) {
          await sprite.startMotion({
            group: idleGroup,
            no: first.no,
            priority: Priority.Idle,
          })
        }
      }
    } catch (error) {
      destroySprite(app, sprite ?? spriteRef.current)
      if (!sprite || spriteRef.current === sprite) {
        spriteRef.current = null
      }
      motionsByGroupRef.current = {}
      tapGroupRef.current = null
      expressionCountRef.current = 0
      resetRuntime()
      if (isStale()) return
      setError(String(error))
      throw error
    }
  }, [destroySprite, fitSprite, resetRuntime, setError, setReady])

  const triggerTapMotion = useCallback(async () => {
    const sprite = spriteRef.current
    const tapGroup = tapGroupRef.current
    if (!sprite || !tapGroup) return

    const group = motionsByGroupRef.current[tapGroup]
    if (!group || group.length === 0) return
    const motion = group[Math.floor(Math.random() * group.length)]
    await sprite.startMotion({
      group: tapGroup,
      no: motion.no,
      priority: Priority.Normal,
    })
  }, [])

  const triggerMotion = useCallback(async (group: string, no: number) => {
    const sprite = spriteRef.current
    if (!sprite) return

    await sprite.startMotion({
      group,
      no,
      priority: Priority.Normal,
    })
  }, [])

  const getParamRange = useCallback((id: string) => {
    const sprite = spriteRef.current
    if (!sprite) return null

    const range = sprite.getParameterValueRangeById(id)
    if (!range) return null

    return {
      min: range.min,
      max: range.max,
    }
  }, [])

  const setParam = useCallback((id: string, value: number) => {
    const sprite = spriteRef.current
    if (!sprite) return

    const range = sprite.getParameterValueRangeById(id)
    const nextValue = range
      ? Math.min(range.max, Math.max(range.min, value))
      : value
    try {
      sprite.setParameterValueById(id, nextValue)
    } catch {
      // Some models do not expose every default Cubism parameter; skip silently.
    }
  }, [])

  const setExpression = useCallback((index: number | null) => {
    const sprite = spriteRef.current
    const expressionCount = expressionCountRef.current
    if (!sprite || expressionCount === 0) return

    if (index === null) {
      ;(sprite as Live2DSprite & { clearExpression?: () => void }).clearExpression?.()
      return
    }

    sprite.setExpression({ index: Math.min(index, expressionCount - 1) })
  }, [])

  return { load, triggerTapMotion, triggerMotion, getParamRange, setParam, setExpression }
}

function groupMotions(motions: Live2DMotionInfo[]): Record<string, Live2DMotionInfo[]> {
  const byGroup: Record<string, Live2DMotionInfo[]> = {}
  for (const motion of motions) {
    if (!byGroup[motion.group]) byGroup[motion.group] = []
    byGroup[motion.group].push(motion)
  }
  return byGroup
}

function resolveMotionGroup(
  motions: Record<string, Live2DMotionInfo[]>,
  keywords: string[],
): string | null {
  const groups = Object.keys(motions)
  const match = groups.find((group) => keywords.some((keyword) => group.toLowerCase().includes(keyword)))
  return match ?? groups[0] ?? null
}

function joinModelPath(root: string, file: string): string {
  const normalizedRoot = root.replace(/[\\/]+$/, '')
  const normalizedFile = file.replace(/^\.?[\\/]+/, '')
  if (normalizedRoot.includes('\\')) {
    return `${normalizedRoot}\\${normalizedFile.replace(/\//g, '\\')}`
  }
  return `${normalizedRoot}/${normalizedFile}`
}

function syncRendererSize(app: Application, canvas: HTMLCanvasElement): void {
  const width = Math.max(canvas.clientWidth || window.innerWidth || 1, 1)
  const height = Math.max(canvas.clientHeight || window.innerHeight || 1, 1)
  app.renderer.resize(width, height)
}

function waitForNextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve())
  })
}

async function ensureRendererReady(
  app: Application,
  canvas: HTMLCanvasElement | null,
): Promise<boolean> {
  if (!canvas) return false
  const renderer = app.renderer as Application['renderer'] & {
    gl?: WebGLRenderingContext | WebGL2RenderingContext | null
  }

  for (let attempt = 0; attempt < 60; attempt += 1) {
    syncRendererSize(app, canvas)
    const gl = renderer.gl ?? null
    const viewport = gl ? gl.getParameter(gl.VIEWPORT) : null
    const scissorBox = gl ? gl.getParameter(gl.SCISSOR_BOX) : null
    if (
      gl
      && gl.drawingBufferWidth > 0
      && gl.drawingBufferHeight > 0
      && viewport != null
      && scissorBox != null
    ) {
      return true
    }
    await waitForNextFrame()
  }

  return false
}
