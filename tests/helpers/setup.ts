import { beforeEach } from 'vitest'
import { installChromeFake } from './chrome-fake'

beforeEach(() => {
  installChromeFake()
})
