export const MESSAGE_LIST_BOTTOM_THRESHOLD_PX = 16

export function isMessageListAtBottom(
  scrollTop: number,
  clientHeight: number,
  scrollHeight: number,
): boolean {
  return scrollHeight - scrollTop - clientHeight <= MESSAGE_LIST_BOTTOM_THRESHOLD_PX
}

export function shouldAppendToCurrentMessageWindow(
  messageChatId: string,
  currentChatId: string | undefined,
  loadLatest: boolean,
): boolean {
  return messageChatId === currentChatId && loadLatest
}
