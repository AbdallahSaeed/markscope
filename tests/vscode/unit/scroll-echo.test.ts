import { describe, expect, test } from 'vitest'
import { ScrollEcho } from '@/vscode/webview/scroll-echo'

describe('ScrollEcho', () => {
  test('nothing is an echo until we scroll on the host’s behalf', () => {
    expect(new ScrollEcho().isEcho(5)).toBe(false)
  })

  test('the position we set stays an echo while it is unchanged', () => {
    const echo = new ScrollEcho()
    echo.expect(40)
    expect(echo.isEcho(40)).toBe(true)
    expect(echo.isEcho(40)).toBe(true)
  })

  test('any other reading is a real scroll and ends the echo — even right after a sync', () => {
    const echo = new ScrollEcho()
    echo.expect(40)
    expect(echo.isEcho(55)).toBe(false)
    expect(echo.isEcho(40)).toBe(false) // returning to 40 later is the user's doing
  })
})
