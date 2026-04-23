export interface Live2DModelMeta {
  uuid: string
  name: string
  model_path: string
  model_file: string
}

export interface Live2DMotionInfo {
  group: string
  no: number
  name: string
}

export interface Live2DExpressionInfo {
  name: string
}

export interface Live2DOverlayImage {
  key: string
  group: string
  path: string
}

export interface Live2DResourceManifest {
  background_path: string | null
  overlay_images: Live2DOverlayImage[]
}

export type Live2DInputEvent =
  | { kind: 'mouse_move'; x: number; y: number; display_id: string }
  | { kind: 'key_down'; code: string }
  | { kind: 'key_up'; code: string }
  | { kind: 'mouse_button_down'; button: 'Left' | 'Right' }
  | { kind: 'mouse_button_up'; button: 'Left' | 'Right' }

export type Live2DActionEvent =
  | { kind: 'trigger_motion'; group: string; no: number }
  | { kind: 'set_expression'; index: number | null }
  | { kind: 'set_param_override'; id: string; value: number | null }

export type AnimTriggerItem =
  | { type: 'expression'; index: number; name: string }
  | { type: 'motion'; group: string; no: number; name: string }

export type SpeedTierConfig = {
  mode: 'sequential' | 'random'
  items: AnimTriggerItem[]
}

export type ModelSpeedConfig = {
  slow: SpeedTierConfig
  medium: SpeedTierConfig
  fast: SpeedTierConfig
  very_fast: SpeedTierConfig
}
