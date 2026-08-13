import { describe, expect, it } from 'vitest'

import {
  safeAIErrorMessage,
  sanitizeVisibleAIText,
} from '../src/ai/safeOutput'

describe('safe AI output', () => {
  it('does not expose schema issue arrays to users', () => {
    expect(
      safeAIErrorMessage(
        [{ code: 'custom', message: 'Official information requires an official source' }],
        '面试研究生成失败，请重试',
      ),
    ).toBe('面试研究返回内容不完整，请重新生成。')
  })

  it('removes internal evidence ids but keeps semantic parentheses', () => {
    expect(
      sanitizeVisibleAIText(
        '结合项目（claim-4）与证书（profile-material-abc），继续准备 AI（人工智能）产品岗位。',
      ),
    ).toBe('结合项目与证书，继续准备 AI（人工智能）产品岗位。')
  })
})
