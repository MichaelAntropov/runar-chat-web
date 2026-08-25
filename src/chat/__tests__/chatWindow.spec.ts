import { describe, expect, it } from 'vitest'

import {
  isMessageListAtBottom,
  MESSAGE_LIST_BOTTOM_THRESHOLD_PX,
  shouldAppendToCurrentMessageWindow,
} from '@/chat/chatWindow'

describe('chat message window', () => {
  it('treats small layout and subpixel gaps as the bottom', () => {
    expect(isMessageListAtBottom(499.5, 500, 1000)).toBe(true)
    expect(
      isMessageListAtBottom(
        500 - MESSAGE_LIST_BOTTOM_THRESHOLD_PX,
        500,
        1000,
      ),
    ).toBe(true)
  })

  it('does not treat a viewport outside the bottom threshold as the bottom', () => {
    expect(
      isMessageListAtBottom(
        499 - MESSAGE_LIST_BOTTOM_THRESHOLD_PX,
        500,
        1000,
      ),
    ).toBe(false)
  })

  it('appends messages whenever the current chat is displaying its latest window', () => {
    expect(shouldAppendToCurrentMessageWindow('chat-1', 'chat-1', true)).toBe(true)
    expect(shouldAppendToCurrentMessageWindow('chat-1', 'chat-1', false)).toBe(false)
    expect(shouldAppendToCurrentMessageWindow('chat-1', 'chat-2', true)).toBe(false)
  })
})
