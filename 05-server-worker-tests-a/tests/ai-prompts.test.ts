import { describe, expect, it } from 'vitest'

import {
  buildCareerInspirationInput,
  careerInspirationInstruction,
} from '../src/ai/careerPrompts'
import { careerDirectionAnalysisInstruction } from '../src/ai/careerDirectionPrompts'
import { interviewResearchInstruction } from '../src/ai/interviewPrompts'

describe('AI visible-output rules', () => {
  it.each([
    careerInspirationInstruction,
    careerDirectionAnalysisInstruction,
    interviewResearchInstruction,
  ])('requires result-only prose without visible internal evidence ids', (prompt) => {
    expect(prompt).toMatch(/不(?:输出|展示).*(?:推理|分析过程)/)
    expect(prompt).toMatch(/(?:内部编号|内部证据 ID|claim)/i)
  })

  it('keeps long project metadata out of career inspiration model input', () => {
    const input = JSON.parse(buildCareerInspirationInput({
      evidenceUnits: [{
        id: 'evidence-1',
        sourceLabel: '项目',
        evidenceType: 'action',
        originalText: '完成内容策划',
        project: '完整项目档案'.repeat(1000),
        normalizedDescription: '内容策划与执行',
        capabilities: ['内容策划'],
        domains: ['传播'],
        tools: [],
        stakeholders: [],
        confidence: 'high',
      }],
    }))

    expect(input.evidenceUnits[0].project).toBeUndefined()
    expect(JSON.stringify(input).length).toBeLessThan(5000)
  })
})
