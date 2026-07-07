export interface ChatScrollState {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
}

const DEFAULT_BOTTOM_THRESHOLD = 80;

export function distanceFromBottom(state: ChatScrollState): number {
  return Math.max(0, state.scrollHeight - state.scrollTop - state.clientHeight);
}

export function shouldStickToBottom(
  state: ChatScrollState,
  threshold = DEFAULT_BOTTOM_THRESHOLD,
): boolean {
  return distanceFromBottom(state) <= threshold;
}

export function shouldShowJumpToLatest(
  state: ChatScrollState,
  threshold = DEFAULT_BOTTOM_THRESHOLD,
): boolean {
  return !shouldStickToBottom(state, threshold);
}
