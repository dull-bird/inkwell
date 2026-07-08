export interface ComposerControlInput {
  canChat: boolean;
  busy: boolean;
  activeTurnId: string | null;
  input: string;
}

export interface ComposerControlState {
  textareaDisabled: boolean;
  sendVisible: boolean;
  sendDisabled: boolean;
  stopVisible: boolean;
  stopDisabled: boolean;
}

export function getComposerControlState(input: ComposerControlInput): ComposerControlState {
  return {
    textareaDisabled: !input.canChat,
    sendVisible: !input.busy,
    sendDisabled: !input.canChat || input.busy || !input.input.trim(),
    stopVisible: input.busy,
    stopDisabled: !input.busy || !input.activeTurnId,
  };
}
