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

export type Live2DInputEvent =
  | { kind: 'mouse_move'; x: number; y: number; display_id: string }
  | { kind: 'key_down'; code: string }
  | { kind: 'key_up'; code: string }

export type Live2DActionEvent =
  | { kind: 'trigger_motion'; group: string; no: number }
  | { kind: 'set_expression'; index: number | null }
  | { kind: 'set_param_override'; id: string; value: number | null }
