export type AiPermissionMode = 'manual' | 'always';

export const DEFAULT_AI_PERMISSION_MODE: AiPermissionMode = 'manual';

export function getDefaultDocumentAiEnabled(mode: AiPermissionMode): boolean {
  return mode === 'always';
}

export function isAiAllowed(mode: AiPermissionMode, documentAiEnabled: boolean): boolean {
  return mode === 'always' || documentAiEnabled;
}

export function canAutomaticallyAnalyze(_mode: AiPermissionMode): boolean {
  return false;
}
