import 'fake-indexeddb/auto'
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { parseExtraction } from '../src/ai/parsers'
import { db } from '../src/db/database'
import type { ExperienceExtractor } from '../src/pages/ExperiencesPage'
import { ExperiencesView } from '../src/pages/ExperiencesPage'
import type { Experience, SourceArtifact } from '../src/domain/types'
import { useExperienceWorkspace } from '../src/hooks/useExperienceWorkspace'

const rawOutput =
  '我负责上线流程优化，通过自动化检查将发布准备时间缩短了 40%，并用 ChatGPT 生成首版检查清单。'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

function extractionFor(artifact: SourceArtifact, label: string) {
  return {
    evidenceSpans: [
      {
        id: `${artifact.id}-span-0`,
        sourceArtifactId: artifact.id,
        quote: artifact.content,
        start: 0,
        end: artifact.content.length,
      },
    ],
    claims: [
      {
        id: `${artifact.id}-claim-0`,
        experienceId: artifact.experienceId,
        kind: 'result' as const,
        label,
        detail: '',
        status: 'pending' as const,
        evidenceSpanIds: [`${artifact.id}-span-0`],
      },
    ],
  }
}

function createExtractor() {
  return (source: string, experienceId: string, sourceArtifactId: string) =>
    Promise.resolve(
      parseExtraction(
        source,
        {
          claims: [
            {
              kind: 'result',
              label: '缩短发布准备时间',
              detail: '通过自动化检查提升发布效率。',
              quote: '通过自动化检查将发布准备时间缩短了 40%',
            },
            {
              kind: 'ai',
              label: '用 ChatGPT 生成检查清单',
              detail: '生成首版发布检查清单。',
              quote: '用 ChatGPT 生成首版检查清单',
            },
          ],
        },
        experienceId,
        sourceArtifactId,
      ),
    )
}

async function saveExperienceAndArtifact() {
  fireEvent.change(screen.getByLabelText('组织'), {
    target: { value: '北极星工作室' },
  })
  fireEvent.change(screen.getByLabelText('角色'), {
    target: { value: '产品设计师' },
  })
  fireEvent.click(screen.getByRole('button', { name: '保存经历' }))

  await screen.findByRole('heading', {
    name: '北极星工作室 · 产品设计师',
  })

  fireEvent.change(screen.getByLabelText('材料标题'), {
    target: { value: '上线复盘' },
  })
  fireEvent.change(screen.getByLabelText('完整工作产出'), {
    target: { value: rawOutput },
  })
  fireEvent.click(screen.getByRole('button', { name: '保存原始材料' }))

  await screen.findByText('上线复盘')
}

beforeEach(async () => {
  await db.delete()
  await db.open()
})

afterEach(async () => {
  cleanup()
  vi.restoreAllMocks()
  await db.delete()
})

describe('ExperiencesView', () => {
  it('provides permanent local data migration controls', async () => {
    render(<ExperiencesView extractor={createExtractor()} />)

    expect(
      await screen.findByRole('heading', { name: '旧版数据与迁移' }),
    ).toBeInTheDocument()
    expect(
      screen.getByLabelText('导入旧网站数据包'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '导出本地数据包' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('粘贴数据包 JSON')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '粘贴并导入' })).toBeDisabled()
  })
  it('adds and removes independent profile materials', async () => {
    render(<ExperiencesView extractor={createExtractor()} />)

    fireEvent.change(screen.getByLabelText('资料类型'), {
      target: { value: 'language' },
    })
    fireEvent.change(screen.getByLabelText('名称'), {
      target: { value: '英语' },
    })
    fireEvent.change(screen.getByLabelText('具体说明'), {
      target: { value: '可进行英文工作沟通' },
    })
    fireEvent.change(screen.getByLabelText('等级 / 熟练度（可选）'), {
      target: { value: 'CET-6' },
    })
    fireEvent.click(screen.getByRole('button', { name: '保存补充资料' }))

    expect(
      await screen.findByRole('button', { name: '删除资料' }),
    ).toBeInTheDocument()
    expect(await db.profileMaterials.count()).toBe(1)

    fireEvent.click(screen.getByRole('button', { name: '删除资料' }))
    await waitFor(() =>
      expect(screen.queryByText('可进行英文工作沟通')).not.toBeInTheDocument(),
    )
    expect(await db.profileMaterials.count()).toBe(0)
  })

  it('saves a skill and tool material with optional proficiency', async () => {
    render(<ExperiencesView extractor={createExtractor()} />)

    fireEvent.change(screen.getByLabelText('资料类型'), {
      target: { value: 'skill_tool' },
    })
    fireEvent.change(screen.getByLabelText('名称'), {
      target: { value: 'Figma' },
    })
    fireEvent.change(screen.getByLabelText('具体说明'), {
      target: { value: '用于界面设计和交互原型' },
    })
    fireEvent.change(screen.getByLabelText('熟练度（可选）'), {
      target: { value: '熟练' },
    })
    fireEvent.click(screen.getByRole('button', { name: '保存补充资料' }))

    expect(await db.profileMaterials.toArray()).toEqual([
      expect.objectContaining({
        type: 'skill_tool',
        title: 'Figma',
        detail: '用于界面设计和交互原型',
        proficiency: '熟练',
      }),
    ])
  })

  it('cancels or confirms a cascading experience deletion', async () => {
    render(<ExperiencesView extractor={createExtractor()} />)
    await saveExperienceAndArtifact()
    fireEvent.click(screen.getByRole('button', { name: '提炼信息' }))
    await screen.findByText('缩短发布准备时间')
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false)
    const deleteButton = screen.getByRole('button', {
      name: '删除经历“北极星工作室 · 产品设计师”',
    })

    fireEvent.click(deleteButton)
    expect(await db.experiences.count()).toBe(1)

    confirm.mockReturnValueOnce(true)
    fireEvent.click(deleteButton)
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', {
          name: '北极星工作室 · 产品设计师',
        }),
      ).not.toBeInTheDocument(),
    )
    expect(await db.experiences.count()).toBe(0)
    expect(await db.sourceArtifacts.count()).toBe(0)
    expect(await db.evidenceSpans.count()).toBe(0)
    expect(await db.claims.count()).toBe(0)
  })

  it('does not ask ordinary users to configure a browser API key', () => {
    render(<ExperiencesView />)

    expect(screen.queryByText('请先配置DeepSeek API Key')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '经历档案' })).toBeInTheDocument()
  })

  it('surfaces initial storage hydration failures', async () => {
    let rejectHydration!: (reason: Error) => void
    const hydration = new Promise<never>((_, reject) => {
      rejectHydration = reject
    })
    vi.spyOn(db.experiences, 'orderBy').mockReturnValue({
      reverse: () => ({
        toArray: () => hydration,
      }),
    } as never)

    render(<ExperiencesView extractor={createExtractor()} />)
    fireEvent.change(screen.getByLabelText('组织'), {
      target: { value: '尚未保存的组织' },
    })
    rejectHydration(new Error('经历读取失败'))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '本地存储失败：经历读取失败',
    )
    expect(screen.getByLabelText('组织')).toHaveValue('尚未保存的组织')
  })

  it('surfaces experience read failures without losing the current form draft', async () => {
    await db.experiences.put({
      id: 'experience-existing',
      organization: '已有组织',
      role: '已有角色',
      project: '',
      startDate: '',
      endDate: '',
      createdAt: '2026-07-27T10:00:00.000Z',
      updatedAt: '2026-07-27T10:00:00.000Z',
    })
    render(<ExperiencesView extractor={createExtractor()} />)
    const experienceButton = await screen.findByRole('button', {
      name: '已有组织 · 已有角色',
    })
    fireEvent.change(screen.getByLabelText('组织'), {
      target: { value: '尚未保存的组织' },
    })
    vi.spyOn(db.sourceArtifacts, 'where').mockReturnValue({
      equals: () => ({
        toArray: () => Promise.reject(new Error('材料读取失败')),
      }),
    } as never)

    fireEvent.click(experienceButton)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '本地存储失败：材料读取失败',
    )
    expect(screen.getByLabelText('组织')).toHaveValue('尚未保存的组织')
  })

  it('keeps only the latest rapidly selected experience workspace', async () => {
    const experiences: Experience[] = [
      {
        id: 'experience-a',
        organization: '组织 A',
        role: '角色 A',
        project: '',
        startDate: '',
        endDate: '',
        createdAt: '2026-07-27T10:00:00.000Z',
        updatedAt: '2026-07-27T10:00:00.000Z',
      },
      {
        id: 'experience-b',
        organization: '组织 B',
        role: '角色 B',
        project: '',
        startDate: '',
        endDate: '',
        createdAt: '2026-07-27T11:00:00.000Z',
        updatedAt: '2026-07-27T11:00:00.000Z',
      },
    ]
    await db.experiences.bulkPut(experiences)
    const artifactA = {
      id: 'artifact-a',
      experienceId: 'experience-a',
      title: 'A 的材料',
      content: 'A content',
      createdAt: '2026-07-27T10:00:00.000Z',
    }
    const artifactB = {
      id: 'artifact-b',
      experienceId: 'experience-b',
      title: 'B 的材料',
      content: 'B content',
      createdAt: '2026-07-27T11:00:00.000Z',
    }
    const loadA = deferred<SourceArtifact[]>()
    const loadB = deferred<SourceArtifact[]>()
    vi.spyOn(db.sourceArtifacts, 'where').mockReturnValue({
      equals: (id: string) => ({
        toArray: () =>
          id === 'experience-a' ? loadA.promise : loadB.promise,
      }),
    } as never)
    render(<ExperiencesView extractor={createExtractor()} />)
    const buttonA = await screen.findByRole('button', {
      name: '组织 A · 角色 A',
    })
    const buttonB = screen.getByRole('button', { name: '组织 B · 角色 B' })

    fireEvent.click(buttonA)
    fireEvent.click(buttonB)
    expect(buttonB).toHaveAttribute('aria-pressed', 'true')
    loadB.resolve([artifactB])
    expect(await screen.findByText('B 的材料')).toBeInTheDocument()
    loadA.resolve([artifactA])

    await waitFor(() =>
      expect(screen.queryByText('A 的材料')).not.toBeInTheDocument(),
    )
    expect(screen.getByText('B 的材料')).toBeInTheDocument()
  })

  it('clears the previous workspace when the next selection fails', async () => {
    const experienceA: Experience = {
      id: 'experience-a',
      organization: '组织 A',
      role: '角色 A',
      project: '',
      startDate: '',
      endDate: '',
      createdAt: '2026-07-27T10:00:00.000Z',
      updatedAt: '2026-07-27T10:00:00.000Z',
    }
    const experienceB = {
      ...experienceA,
      id: 'experience-b',
      organization: '组织 B',
      role: '角色 B',
      updatedAt: '2026-07-27T11:00:00.000Z',
    }
    await db.experiences.bulkPut([experienceA, experienceB])
    const artifactA: SourceArtifact = {
      id: 'artifact-a',
      experienceId: experienceA.id,
      title: 'A 的旧材料',
      content: 'A content',
      createdAt: '2026-07-27T10:00:00.000Z',
    }
    vi.spyOn(db.sourceArtifacts, 'where').mockReturnValue({
      equals: (id: string) => ({
        toArray: () =>
          id === experienceA.id
            ? Promise.resolve([artifactA])
            : Promise.reject(new Error('B 读取失败')),
      }),
    } as never)
    render(<ExperiencesView extractor={createExtractor()} />)
    fireEvent.click(
      await screen.findByRole('button', { name: '组织 A · 角色 A' }),
    )
    await screen.findByText('A 的旧材料')

    fireEvent.click(screen.getByRole('button', { name: '组织 B · 角色 B' }))

    expect(screen.queryByText('A 的旧材料')).not.toBeInTheDocument()
    expect(await screen.findByRole('alert')).toHaveTextContent('B 读取失败')
  })

  it('saves raw source, extracts evidence-linked pending claims, and confirms one', async () => {
    render(<ExperiencesView extractor={createExtractor()} />)

    await saveExperienceAndArtifact()
    fireEvent.click(screen.getByRole('button', { name: '提炼信息' }))

    const claim = await screen.findByText('缩短发布准备时间')
    const card = claim.closest('article')

    expect(card).not.toBeNull()
    expect(
      within(card!).getByRole('link', {
        name: '通过自动化检查将发布准备时间缩短了 40%',
      }),
    ).toBeInTheDocument()

    fireEvent.click(within(card!).getByRole('button', { name: '确认' }))

    await waitFor(() =>
      expect(within(card!).getByText('已确认')).toBeInTheDocument(),
    )
    expect(
      (await db.claims.toArray()).find(
        ({ label }) => label === '缩短发布准备时间',
      )?.status,
    ).toBe('confirmed')
    expect((await db.sourceArtifacts.toArray())[0].content).toBe(rawOutput)
  })

  it.each(['确认', '保存修改', '拒绝'])(
    'surfaces a failed %s claim write without losing raw content or edits',
    async (action) => {
      render(<ExperiencesView extractor={createExtractor()} />)
      await saveExperienceAndArtifact()
      fireEvent.click(screen.getByRole('button', { name: '提炼信息' }))
      const resultCard = (await screen.findByText('缩短发布准备时间')).closest(
        'article',
      )

      if (action === '保存修改') {
        fireEvent.click(within(resultCard!).getByRole('button', { name: '修改' }))
        fireEvent.change(within(resultCard!).getByLabelText('信息标题'), {
          target: { value: '尚未保存的修改' },
        })
      }
      vi.spyOn(db.claims, 'put').mockRejectedValueOnce(new Error('磁盘写入失败'))

      fireEvent.click(within(resultCard!).getByRole('button', { name: action }))

      expect(await screen.findByRole('alert')).toHaveTextContent(
        '本地存储失败：磁盘写入失败',
      )
      expect(screen.getByLabelText('完整工作产出')).toHaveValue(rawOutput)
      expect(within(resultCard!).getByText('待确认')).toBeInTheDocument()
      if (action === '保存修改') {
        expect(within(resultCard!).getByLabelText('信息标题')).toHaveValue(
          '尚未保存的修改',
        )
      }
    },
  )

  it('edits a pending claim without losing evidence and can reject another claim', async () => {
    render(<ExperiencesView extractor={createExtractor()} />)

    await saveExperienceAndArtifact()
    fireEvent.click(screen.getByRole('button', { name: '提炼信息' }))

    const resultCard = (await screen.findByText('缩短发布准备时间')).closest(
      'article',
    )
    const aiCard = screen
      .getByText('用 ChatGPT 生成检查清单')
      .closest('article')

    fireEvent.click(within(resultCard!).getByRole('button', { name: '修改' }))
    fireEvent.change(within(resultCard!).getByLabelText('信息标题'), {
      target: { value: '发布准备提速 40%' },
    })
    fireEvent.change(within(resultCard!).getByLabelText('信息详情'), {
      target: { value: '自动化检查减少了发布准备工作。' },
    })
    fireEvent.click(
      within(resultCard!).getByRole('button', { name: '保存修改' }),
    )

    await waitFor(() =>
      expect(
        within(resultCard!).getByText('发布准备提速 40%'),
      ).toBeInTheDocument(),
    )
    expect(within(resultCard!).getByText('待确认')).toBeInTheDocument()
    expect(
      within(resultCard!).getByRole('link', {
        name: '通过自动化检查将发布准备时间缩短了 40%',
      }),
    ).toBeInTheDocument()
    expect(
      (await db.claims.toArray()).find(
        ({ label }) => label === '发布准备提速 40%',
      )?.status,
    ).toBe('pending')

    fireEvent.click(within(aiCard!).getByRole('button', { name: '拒绝' }))

    await waitFor(() =>
      expect(within(aiCard!).getByText('已拒绝')).toBeInTheDocument(),
    )
    expect(
      (await db.claims.toArray()).find(
        ({ label }) => label === '用 ChatGPT 生成检查清单',
      )?.status,
    ).toBe('rejected')
  })

  it('upserts repeated deterministic extraction results without duplicate cards', async () => {
    render(<ExperiencesView extractor={createExtractor()} />)
    await saveExperienceAndArtifact()
    const extractButton = screen.getByRole('button', { name: '提炼信息' })

    fireEvent.click(extractButton)
    await screen.findByText('缩短发布准备时间')
    fireEvent.click(extractButton)

    await waitFor(() =>
      expect(db.claims.count()).resolves.toBe(2),
    )
    expect(screen.getAllByText('缩短发布准备时间')).toHaveLength(1)
    expect(
      screen.getAllByRole('link', {
        name: '通过自动化检查将发布准备时间缩短了 40%',
      }),
    ).toHaveLength(1)
    expect(await db.evidenceSpans.count()).toBe(2)
  })

  it('keeps database and UI unchanged when atomic re-extraction fails', async () => {
    let label = '事务前信息'
    const extractor: ExperienceExtractor = (
      source,
      experienceId,
      sourceArtifactId,
    ) =>
      Promise.resolve(
        parseExtraction(
          source,
          {
            claims: [
              {
                kind: 'result',
                label,
                detail: '',
                quote: '通过自动化检查将发布准备时间缩短了 40%',
              },
            ],
          },
          experienceId,
          sourceArtifactId,
        ),
      )
    render(<ExperiencesView extractor={extractor} />)
    await saveExperienceAndArtifact()
    const extractButton = screen.getByRole('button', { name: '提炼信息' })
    fireEvent.click(extractButton)
    await screen.findByText('事务前信息')
    label = '不应提交的信息'
    const transactionFailure = vi
      .spyOn(db.claims, 'bulkPut')
      .mockRejectedValueOnce(new Error('事务写入失败'))

    fireEvent.click(extractButton)

    expect(await screen.findByRole('alert')).toHaveTextContent('事务写入失败')
    transactionFailure.mockRestore()
    expect(screen.getByText('事务前信息')).toBeInTheDocument()
    expect(screen.queryByText('不应提交的信息')).not.toBeInTheDocument()
    expect((await db.claims.toArray()).map(({ label: value }) => value)).toEqual([
      '事务前信息',
    ])
  })

  it('commits concurrent extractions for different artifacts', async () => {
    const experience: Experience = {
      id: 'experience-race',
      organization: '竞态组织',
      role: '竞态角色',
      project: '',
      startDate: '',
      endDate: '',
      createdAt: '2026-07-27T10:00:00.000Z',
      updatedAt: '2026-07-27T10:00:00.000Z',
    }
    const artifacts: SourceArtifact[] = [
      {
        id: 'artifact-slow',
        experienceId: experience.id,
        title: '慢材料',
        content: 'slow evidence',
        createdAt: '2026-07-27T10:00:00.000Z',
      },
      {
        id: 'artifact-fast',
        experienceId: experience.id,
        title: '快材料',
        content: 'fast evidence',
        createdAt: '2026-07-27T11:00:00.000Z',
      },
    ]
    await db.experiences.put(experience)
    await db.sourceArtifacts.bulkPut(artifacts)
    const slow = deferred<ReturnType<typeof extractionFor>>()
    const fast = deferred<ReturnType<typeof extractionFor>>()
    const extractor: ExperienceExtractor = (source) =>
      source === 'slow evidence' ? slow.promise : fast.promise
    render(<ExperiencesView extractor={extractor} />)
    fireEvent.click(
      await screen.findByRole('button', { name: '竞态组织 · 竞态角色' }),
    )
    const slowButton = within(
      (await screen.findByText('慢材料')).closest('article')!,
    ).getByRole('button', { name: '提炼信息' })
    const fastButton = within(
      screen.getByText('快材料').closest('article')!,
    ).getByRole('button', { name: '提炼信息' })

    fireEvent.click(slowButton)
    expect(slowButton).toBeDisabled()
    expect(slowButton).toHaveAttribute('aria-busy', 'true')
    fireEvent.click(fastButton)
    expect(fastButton).toBeDisabled()
    expect(slowButton).toBeDisabled()
    fast.resolve(extractionFor(artifacts[1], '快速提炼'))
    expect(await screen.findByText('快速提炼')).toBeInTheDocument()
    slow.resolve(extractionFor(artifacts[0], '慢速提炼'))

    expect(await screen.findByText('慢速提炼')).toBeInTheDocument()
    expect(
      (await db.claims.toArray()).map(({ label }) => label).sort(),
    ).toEqual(['快速提炼', '慢速提炼'].sort())
  })

  it('syncs edit drafts from the latest claim when editing begins', async () => {
    let label = '首次提炼'
    const extractor: ExperienceExtractor = (
      source,
      experienceId,
      sourceArtifactId,
    ) =>
      Promise.resolve(
        parseExtraction(
          source,
          {
            claims: [
              {
                kind: 'result',
                label,
                detail: `${label}详情`,
                quote: '通过自动化检查将发布准备时间缩短了 40%',
              },
            ],
          },
          experienceId,
          sourceArtifactId,
        ),
      )
    render(<ExperiencesView extractor={extractor} />)
    await saveExperienceAndArtifact()
    const extractButton = screen.getByRole('button', { name: '提炼信息' })
    fireEvent.click(extractButton)
    await screen.findByText('首次提炼')
    label = '再次提炼'
    fireEvent.click(extractButton)
    const latestClaim = await screen.findByText('再次提炼')
    const card = latestClaim.closest('article')

    fireEvent.click(within(card!).getByRole('button', { name: '修改' }))

    expect(within(card!).getByLabelText('信息标题')).toHaveValue('再次提炼')
    expect(within(card!).getByLabelText('信息详情')).toHaveValue(
      '再次提炼详情',
    )
  })
})

it('keeps request 2 when same-artifact extractions resolve in reverse', async () => {
  const artifact: SourceArtifact = {
    id: 'artifact-same',
    experienceId: 'experience-same',
    title: '同一材料',
    content: 'same evidence',
    createdAt: '2026-07-27T10:00:00.000Z',
  }
  const request1 = deferred<ReturnType<typeof extractionFor>>()
  const request2 = deferred<ReturnType<typeof extractionFor>>()
  let callCount = 0
  const extractor: ExperienceExtractor = () => {
    callCount += 1
    return callCount === 1 ? request1.promise : request2.promise
  }
  const { result } = renderHook(() => useExperienceWorkspace(extractor))

  act(() => {
    void result.current.extractArtifact(artifact)
    void result.current.extractArtifact(artifact)
  })
  request2.resolve(extractionFor(artifact, '第二次提炼'))
  await waitFor(() =>
    expect(result.current.claims.map(({ label }) => label)).toEqual([
      '第二次提炼',
    ]),
  )
  request1.resolve(extractionFor(artifact, '第一次提炼'))

  await waitFor(() =>
    expect(result.current.extractingArtifactIds.has(artifact.id)).toBe(false),
  )
  expect(result.current.claims.map(({ label }) => label)).toEqual([
    '第二次提炼',
  ])
  expect((await db.claims.toArray()).map(({ label }) => label)).toEqual([
    '第二次提炼',
  ])
})

it('reconciles a completed extraction after selecting A then B then A', async () => {
  const experienceA: Experience = {
    id: 'experience-a-reselected',
    organization: '组织 A',
    role: '角色 A',
    project: '',
    startDate: '',
    endDate: '',
    createdAt: '2026-07-27T10:00:00.000Z',
    updatedAt: '2026-07-27T10:00:00.000Z',
  }
  const experienceB = {
    ...experienceA,
    id: 'experience-b-between',
    organization: '组织 B',
  }
  const artifact: SourceArtifact = {
    id: 'artifact-a-reselected',
    experienceId: experienceA.id,
    title: 'A 材料',
    content: 'A completed evidence',
    createdAt: '2026-07-27T10:00:00.000Z',
  }
  const extraction = deferred<ReturnType<typeof extractionFor>>()
  const extractor: ExperienceExtractor = () => extraction.promise
  const { result } = renderHook(() => useExperienceWorkspace(extractor))

  act(() => {
    result.current.activateExperience(experienceA)
  })
  act(() => {
    void result.current.extractArtifact(artifact)
    result.current.activateExperience(experienceB)
    result.current.activateExperience(experienceA)
  })
  extraction.resolve(extractionFor(artifact, 'A 完成提炼'))

  await waitFor(() =>
    expect((db.claims.toArray())).resolves.toHaveLength(1),
  )
  expect(result.current.activeExperience?.id).toBe(experienceA.id)
  expect(result.current.claims.map(({ label }) => label)).toEqual([
    'A 完成提炼',
  ])
  expect((await db.claims.toArray()).map(({ label }) => label)).toEqual([
    'A 完成提炼',
  ])
})

it('invalidates a stale A workspace load after extraction commits', async () => {
  const experienceA: Experience = {
    id: 'experience-a-stale-load',
    organization: '组织 A',
    role: '角色 A',
    project: '',
    startDate: '',
    endDate: '',
    createdAt: '2026-07-27T10:00:00.000Z',
    updatedAt: '2026-07-27T10:00:00.000Z',
  }
  const experienceB = {
    ...experienceA,
    id: 'experience-b-stale-load',
    organization: '组织 B',
  }
  const artifact: SourceArtifact = {
    id: 'artifact-a-stale-load',
    experienceId: experienceA.id,
    title: 'A 材料',
    content: 'A stale load evidence',
    createdAt: '2026-07-27T10:00:00.000Z',
  }
  const artifact2: SourceArtifact = {
    id: 'artifact-a-existing',
    experienceId: experienceA.id,
    title: 'A 已有材料',
    content: 'A existing evidence',
    createdAt: '2026-07-27T11:00:00.000Z',
  }
  const existingSpan = {
    id: 'artifact-a-existing-span-0',
    sourceArtifactId: artifact2.id,
    quote: artifact2.content,
    start: 0,
    end: artifact2.content.length,
  }
  const existingClaim = {
    id: 'artifact-a-existing-claim-0',
    experienceId: experienceA.id,
    kind: 'result' as const,
    label: 'A2 已有提炼',
    detail: '',
    status: 'pending' as const,
    evidenceSpanIds: [existingSpan.id],
  }
  await db.sourceArtifacts.bulkPut([artifact, artifact2])
  await db.evidenceSpans.put(existingSpan)
  await db.claims.put(existingClaim)
  const extraction = deferred<ReturnType<typeof extractionFor>>()
  const staleClaims = deferred<(typeof existingClaim)[]>()
  const extractor: ExperienceExtractor = () => extraction.promise
  const { result } = renderHook(() => useExperienceWorkspace(extractor))

  act(() => {
    result.current.activateExperience(experienceA)
    void result.current.extractArtifact(artifact)
  })
  await act(async () => {
    await result.current.selectExperience(experienceB)
  })
  vi.spyOn(db.claims, 'where').mockReturnValueOnce({
    equals: () => ({ toArray: () => staleClaims.promise }),
  } as never)
  let selectA!: Promise<void>
  act(() => {
    selectA = result.current.selectExperience(experienceA)
  })
  extraction.resolve(extractionFor(artifact, 'A 新提炼'))
  await waitFor(() =>
    expect(result.current.claims.map(({ label }) => label)).toContain(
      'A 新提炼',
    ),
  )
  staleClaims.resolve([existingClaim])

  await act(async () => {
    await selectA
  })
  expect(result.current.artifacts.map(({ id }) => id).sort()).toEqual(
    [artifact.id, artifact2.id].sort(),
  )
  expect(result.current.claims.map(({ label }) => label).sort()).toEqual(
    ['A 新提炼', 'A2 已有提炼'].sort(),
  )
  expect((await db.claims.toArray()).map(({ label }) => label).sort()).toEqual(
    ['A 新提炼', 'A2 已有提炼'].sort(),
  )
})
