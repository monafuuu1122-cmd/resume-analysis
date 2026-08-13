import {
  ArrowUpRight,
  CheckCircle,
  ClipboardText,
  Gear,
  MagnifyingGlass,
  Path,
  Sparkle,
  X,
} from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import StatusCard from '../components/StatusCard'
import {
  loadDashboardCounts,
  type DashboardCounts,
} from '../db/dashboardRepository'
import {
  userCareerRepository,
  type CareerSnapshotCounts,
  type CareerSourceStatus,
} from '../db/userCareerRepository'
import {
  deriveDashboardProgress,
  derivePreparationProgress,
  type DashboardProgress,
} from '../domain/dashboardProgress'

const destinations = [
  {
    title: '经历档案',
    accessibleLabel: '进入经历档案',
    description: '把工作产出连同背景一起存好，让每条能力都有来处。',
    to: '/experiences',
    image: '/assets/dashboard/card-experiences.webp',
  },
  {
    title: '能力星图',
    accessibleLabel: '进入能力星图',
    description: '从已确认的证据里，看见能力、工具、AI 与证书。',
    to: '/capabilities',
    image: '/assets/dashboard/card-capabilities.webp',
  },
  {
    title: '岗位方向',
    accessibleLabel: '进入岗位方向',
    description: '用真实能力探索更匹配的方向，也看清下一步缺口。',
    to: '/role-directions',
    image: '/assets/dashboard/card-role-directions.webp',
  },
  {
    title: 'JD 实验室',
    accessibleLabel: '进入 JD 实验室',
    description: '粘贴职位描述，做适配诊断、简历改写与面试准备。',
    to: '/jd-lab',
    image: '/assets/dashboard/card-jd-lab.webp',
  },
] as const

interface ProgressState {
  progress: DashboardProgress | null
  loading: boolean
  error: 'failed' | 'timeout' | null
  sourceStatus: CareerSourceStatus | null
  recoveryCount: number
}

interface DashboardPageProps {
  countsLoader?: typeof loadDashboardCounts
  snapshotLoader?: typeof userCareerRepository.getSnapshot
  storageTimeoutMs?: number
}

function loadWithTimeout<T>(operation: Promise<T>, timeoutMs: number) {
  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error('Local storage read timed out'))
    }, timeoutMs)

    operation.then(
      (value) => {
        window.clearTimeout(timeout)
        resolve(value)
      },
      (error) => {
        window.clearTimeout(timeout)
        reject(error)
      },
    )
  })
}

function isCareerSnapshotCounts(
  counts: DashboardCounts | CareerSnapshotCounts,
): counts is DashboardCounts & CareerSnapshotCounts {
  return [
    'profileMaterialCount',
    'careerDirectionCount',
    'interviewResearchCount',
    'completedInterviewCount',
  ].every(
    (key) =>
      typeof (counts as unknown as Record<string, unknown>)[key] ===
      'number',
  )
}

const progressTaskLabels: Record<string, string> = {
  experience: '添加一段真实经历',
  evidence: '确认一条能力证据',
  qwen: '配置DeepSeek助手',
  jd: '分析一份意向 JD',
}

export default function DashboardPage({
  countsLoader,
  snapshotLoader = userCareerRepository.getSnapshot,
  storageTimeoutMs = 8_000,
}: DashboardPageProps = {}) {
  const [searchQuery, setSearchQuery] = useState('')
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [state, setState] = useState<ProgressState>({
    progress: null,
    loading: true,
    error: null,
    sourceStatus: null,
    recoveryCount: 0,
  })

  useEffect(() => {
    let active = true

    setState({
      progress: null,
      loading: true,
      error: null,
      sourceStatus: null,
      recoveryCount: 0,
    })

    const operation = countsLoader
      ? countsLoader().then((counts) => ({
          counts,
          sourceStatus: 'ready' as CareerSourceStatus,
          recoveryCount: 0,
        }))
      : snapshotLoader().then((snapshot) => ({
          counts: snapshot.counts,
          sourceStatus: snapshot.sourceStatus,
          recoveryCount: snapshot.recoveryCount,
        }))

    loadWithTimeout(operation, storageTimeoutMs)
      .then(({ counts, sourceStatus, recoveryCount }) => {
        if (!active) return
        const basicProgress = deriveDashboardProgress({
          ...counts,
          hasQwenConfig: true,
        })
        const detailedProgress = isCareerSnapshotCounts(counts)
          ? derivePreparationProgress({
              ...counts,
              hasQwenConfig: true,
            })
          : null
        const progress = detailedProgress
          ? {
              ...basicProgress,
              preparation: detailedProgress.overallPercent,
              tasks: detailedProgress.items
                .filter((item) => !item.completed)
                .slice(0, 4)
                .map((item) => ({
                  label:
                    progressTaskLabels[item.id] ??
                    item.missingReason ??
                    `补充${item.label}`,
                  to: item.targetRoute,
                })),
            }
          : basicProgress
        setState({
          progress,
          loading: false,
          error: null,
          sourceStatus,
          recoveryCount,
        })
      })
      .catch((error: unknown) => {
        if (active) {
          setState({
            progress: null,
            loading: false,
            error:
              error instanceof Error &&
              error.message === 'Local storage read timed out'
                ? 'timeout'
                : 'failed',
            sourceStatus: null,
            recoveryCount: 0,
          })
        }
      })

    return () => {
      active = false
    }
  }, [countsLoader, loadAttempt, snapshotLoader, storageTimeoutMs])

  useEffect(() => {
    const reloadWhenVisible = () => {
      if (document.visibilityState === 'visible') {
        setLoadAttempt((attempt) => attempt + 1)
      }
    }
    document.addEventListener('visibilitychange', reloadWhenVisible)
    return () =>
      document.removeEventListener('visibilitychange', reloadWhenVisible)
  }, [])

  const normalizedQuery = searchQuery.trim().toLocaleLowerCase('zh-CN')
  const visibleDestinations = normalizedQuery
    ? destinations.filter(({ title, description }) =>
        `${title} ${description}`
          .toLocaleLowerCase('zh-CN')
          .includes(normalizedQuery),
      )
    : destinations

  return (
    <section
      className="page dashboard-page"
      aria-labelledby="dashboard-title"
    >
      <div className="dashboard-layout">
        <div className="dashboard-main">
          <article className="dashboard-hero">
            <img
              src="/assets/dashboard/hero-job-journey.webp"
              alt="小动物结伴开启求职旅程"
            />
            <div className="dashboard-hero-copy">
              <p className="eyebrow">2027 届秋招 / 校招</p>
              <h1 id="dashboard-title">Offer 探险日</h1>
              <p>把每次认真做过的事，慢慢变成下一份机会的路标。</p>
            </div>
          </article>

          <div className="dashboard-section-heading">
            <div>
              <p className="eyebrow">今日路线</p>
              <h2>从哪里开始？</h2>
            </div>
            <div className="dashboard-search">
              <MagnifyingGlass size={20} weight="bold" aria-hidden="true" />
              <label className="visually-hidden" htmlFor="dashboard-search">
                搜索看板入口
              </label>
              <input
                id="dashboard-search"
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="搜索经历、能力或 JD"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="清空搜索关键词"
                >
                  <X size={18} weight="bold" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>

          {visibleDestinations.length > 0 ? (
            <div className="destination-grid">
              {visibleDestinations.map(
                ({ title, accessibleLabel, description, to, image }) => (
                  <Link
                    className="destination-card"
                    to={to}
                    key={to}
                    aria-label={`${accessibleLabel}：${description}`}
                  >
                    <img src={image} alt="" />
                    <span className="destination-copy">
                      <span>
                        <strong>{title}</strong>
                        <small>{description}</small>
                      </span>
                      <ArrowUpRight
                        className="destination-arrow"
                        size={22}
                        weight="bold"
                        aria-hidden="true"
                      />
                    </span>
                  </Link>
                ),
              )}
            </div>
          ) : (
            <div className="dashboard-search-empty" role="status">
              <p>
                <strong>没有找到匹配的入口</strong>
                <span>换个关键词，或者回到完整地图。</span>
              </p>
              <button type="button" onClick={() => setSearchQuery('')}>
                清除搜索
              </button>
            </div>
          )}
        </div>

        <aside className="dashboard-status" aria-label="求职进度">
          <div className="status-heading">
            <span className="status-heading-icon" aria-hidden="true">
              <Sparkle size={24} weight="duotone" />
            </span>
            <div>
              <p className="eyebrow">你的补给站</p>
              <h2>准备进度</h2>
            </div>
          </div>

          {state.loading && (
            <p className="status-message" role="status">
              正在读取你的准备数据
            </p>
          )}
          {state.error === 'failed' && (
            <div className="status-message" role="alert">
              <p>本地数据读取失败，请重试或查看恢复选项。</p>
              <button
                type="button"
                onClick={() => setLoadAttempt((attempt) => attempt + 1)}
              >
                重新读取
              </button>
            </div>
          )}
          {state.error === 'timeout' && (
            <div className="status-message" role="alert">
              <p>本地数据库可能被旧标签页占用，请关闭其他本站标签页后重试。</p>
              <button
                type="button"
                onClick={() => setLoadAttempt((attempt) => attempt + 1)}
              >
                重新读取本地进度
              </button>
            </div>
          )}
          {state.sourceStatus === 'empty' && (
            <p className="status-message" role="status">
              还没有准备记录，可以从经历档案开始补充。
            </p>
          )}
          {state.sourceStatus === 'partial' && (
            <p className="status-message" role="alert">
              部分本地数据暂时无法读取，已保留其余可用进度。
            </p>
          )}
          {state.recoveryCount > 0 && (
            <p className="status-message" role="status">
              有 {state.recoveryCount} 条旧数据需要在经历档案中恢复。
            </p>
          )}
          {state.progress && (
            <>
              <div className="status-card-grid">
                <StatusCard
                  icon={ClipboardText}
                  label="资料完整度"
                  value={state.progress.profileCompleteness}
                />
                <StatusCard
                  icon={Path}
                  label="求职准备度"
                  value={state.progress.preparation}
                />
              </div>

              <section className="weekly-tasks" aria-labelledby="tasks-title">
                <h3 id="tasks-title">本周小任务</h3>
                {state.progress.tasks.length > 0 ? (
                  <ul>
                    {state.progress.tasks.map((task) => (
                      <li key={`${task.to}-${task.label}`}>
                        <Link to={task.to}>
                          <span>{task.label}</span>
                          <ArrowUpRight
                            size={18}
                            weight="bold"
                            aria-hidden="true"
                          />
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="all-done">
                    <CheckCircle size={28} weight="duotone" aria-hidden="true" />
                    <p>
                      <strong>本周任务都完成啦</strong>
                      <span>带着证据出发，下一站会更稳。</span>
                    </p>
                  </div>
                )}
              </section>
            </>
          )}

          <Link className="settings-shortcut" to="/settings">
            <Gear size={20} weight="duotone" aria-hidden="true" />
            <span>
              <strong>本地设置</strong>
              <small>DeepSeek API 与模型</small>
            </span>
            <ArrowUpRight size={18} weight="bold" aria-hidden="true" />
          </Link>
        </aside>
      </div>
    </section>
  )
}
