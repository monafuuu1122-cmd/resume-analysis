import { ArrowRight, CheckCircle, Lightbulb, Target } from '@phosphor-icons/react'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'

import {
  buildCapabilitySummaries,
  type CapabilitySummary,
} from '../domain/scoring'
import { useConfirmedEvidence } from '../hooks/useConfirmedEvidence'

const CATEGORY_DEFINITIONS = [
  {
    id: 'professional',
    dimension: '专业能力',
    title: '内容策划与传播',
    keywords: ['内容', '传播', '用户', '研究', '品牌', '策划', '专业'],
    gap: '你的经历已覆盖内容策划、品牌叙事和多平台传播，但还要把内容选择与受众、渠道和业务结果连起来。',
    actions: ['整理一段“洞察—内容方案—传播结果”的案例', '说明你如何针对平台与受众调整内容'],
    strengthActions: ['准备“为什么选这个叙事/内容框架”的判断链', '把内容产出对应到阅读、曝光、互动或转化指标'],
  },
  {
    id: 'execution',
    dimension: '统筹执行',
    title: '项目统筹与交付',
    keywords: ['项目', '推进', '执行', '流程', '现场', '协调', '落地', '交付'],
    gap: '你有大型活动、直播和艺人协同经验，面试还需要把时间线、风险点和交付标准说成可复用流程。',
    actions: ['画出一次项目的关键节点、角色和风险', '准备一次现场突发情况的处置顺序'],
    strengthActions: ['把一次从0到1的项目拆成节点、角色、风险', '准备一个资源不足时仍完成交付的例子'],
  },
  {
    id: 'strategy',
    dimension: '策略思考',
    title: '品牌策略与业务判断',
    keywords: ['策略', '规划', '定位', '洞察', '方案', '判断'],
    gap: '你已经做过品牌出海和文化叙事框架，下一步要证明自己能从业务目标出发做取舍，而不只是完成表达。',
    actions: ['为一个项目补写“为什么选这个方案”', '说明你如何把文化信息转成可传播叙事'],
    strengthActions: ['写出一个策略选择的备选方案与取舍', '准备一次方案被调整后的复盘'],
  },
  {
    id: 'ai',
    dimension: 'AI 应用',
    title: 'AI 工作流与创意提效',
    keywords: ['AI', '大模型', '提示词', '自动化', '工作流', '智能'],
    gap: '你已有 AI 工具参与海报原型和版式方案的真实动作，但还缺少输入、判断、校验和效率/质量结果的完整证据。',
    actions: ['复盘一次 AI 参与视觉原型的输入—判断—校验流程', '补充节省时间、迭代次数或质量判断依据'],
    strengthActions: ['准备一个 AI 结果不可靠时的兜底方案', '说明 AI 如何改变创意迭代速度或沟通效率'],
  },
  {
    id: 'data',
    dimension: '数据与复盘',
    title: '传播数据与效果复盘',
    keywords: ['数据', '指标', '分析', '复盘', '转化', '增长', '结果'],
    gap: '你的经历有阅读、曝光、观看、互动和增长结果，面试时要补清口径、基线和具体动作之间的因果关系。',
    actions: ['核对一个结果指标的计算口径与基线', '准备一次依据数据调整内容策略'],
    strengthActions: ['解释指标与业务目标的关系', '准备一个反常数据的复盘'],
  },
  {
    id: 'collaboration',
    dimension: '沟通协作',
    title: '跨团队沟通与资源协同',
    keywords: ['沟通', '协作', '跨团队', '跨部门', '对接', '资源', '利益相关方'],
    gap: '你有品牌方、媒体、执行公司、艺人团队和文旅部门协同经验，要进一步说清如何建立共识并推动冲突解决。',
    actions: ['准备一次多方协作分歧的具体处理', '画出项目中的影响对象和沟通节奏'],
    strengthActions: ['明确你如何影响而不只是对接', '准备一次协作失败后的复盘'],
  },
] as const

const MINDSET_GUIDES = [
  {
    title: '先讲业务目标，再讲动作',
    prompt: '回答任何岗位题前，先说清楚要解决的业务问题、目标人群和成功标准。',
    check: '面试官会追问：为什么这个目标值得优先做？',
  },
  {
    title: '把个人贡献和团队成果分开',
    prompt: '用“我负责……我推动……我和团队共同……”区分角色，避免把团队结果全部归给自己。',
    check: '面试官会追问：哪一步是你独立完成的？',
  },
  {
    title: '用证据承接判断',
    prompt: '每个判断后补一个来源：用户反馈、数据变化、业务约束或协作者意见。',
    check: '面试官会追问：当时依据是什么？有没有反例？',
  },
  {
    title: '把迁移能力说成步骤',
    prompt: '遇到陌生行业时，说明你会先补什么知识、验证什么假设、如何把旧经验迁移过来。',
    check: '面试官会追问：换到新岗位，你第一周会怎么做？',
  },
] as const

function containsKeyword(summary: CapabilitySummary, keywords: readonly string[]) {
  const text = `${summary.label} ${summary.kind}`.toLocaleLowerCase('zh-CN')
  return keywords.some((keyword) =>
    text.includes(keyword.toLocaleLowerCase('zh-CN')),
  )
}

function deriveCategoryModel(
  summaries: CapabilitySummary[],
  definition: (typeof CATEGORY_DEFINITIONS)[number],
) {
  const items = summaries.filter((summary) =>
    definition.id === 'ai'
      ? summary.kind === 'ai' || containsKeyword(summary, definition.keywords)
      : containsKeyword(summary, definition.keywords),
  )
  const experienceIds = new Set(items.flatMap((item) => item.experienceIds))
  const evidenceCount = items.reduce((total, item) => total + item.evidenceCount, 0)
  const score = items.length
    ? Math.min(100, 22 + evidenceCount * 9 + experienceIds.size * 13)
    : 0
    return { ...definition, items, evidenceCount, experienceCount: experienceIds.size, score }
}

export default function InterviewPreparationPage() {
  const { error, loading, snapshot } = useConfirmedEvidence()
  const summaries = useMemo(
    () => buildCapabilitySummaries(snapshot?.claims ?? [], snapshot?.profileMaterials ?? []),
    [snapshot],
  )
  const models = useMemo(
    () => CATEGORY_DEFINITIONS.map((definition) => deriveCategoryModel(summaries, definition)),
    [summaries],
  )
  const gapCount = models.filter((model) => model.score < 60).length

  return (
    <section className="page interview-prep-page" aria-labelledby="interview-prep-title">
      <div className="page-kicker"><Lightbulb aria-hidden="true" size={20} weight="duotone" /> 进入面试前，先把证据准备成答案</div>
      <h1 id="interview-prep-title">面试准备</h1>
      <p className="page-intro">根据你已经确认的经历证据，找出要补的能力和面试时需要保持的岗位思维。</p>

      {loading && <p role="status">正在读取你的能力证据…</p>}
      {error && <p role="alert">本地存储失败：{error}</p>}

      {!loading && !error && (
        <>
          <div className="prep-summary" aria-label="面试准备摘要">
            <div><strong>{models.length}</strong><span>个岗位能力维度</span></div>
            <div><strong>{gapCount}</strong><span>个优先补证据项</span></div>
            <div><strong>{summaries.length}</strong><span>条已确认能力资产</span></div>
          </div>

          <div className="prep-layout">
            <section aria-labelledby="gaps-title">
              <div className="section-heading-row">
                <div>
                  <h2 id="gaps-title">能力缺口</h2>
                  <p className="muted-copy">缺口不是否定，而是下一轮经历整理和面试准备的清单。</p>
                </div>
                <Link className="pill-button" to="/experiences">补充经历 <ArrowRight aria-hidden="true" size={16} /></Link>
              </div>
              <div className="prep-card-grid">
                {models.map((model) => {
                  const isStrong = model.score >= 60
                  return (
                    <article className={`prep-card ${isStrong ? 'is-strong' : 'is-gap'}`} key={model.id}>
                      <div className="prep-card-heading">
                        <span className="prep-icon" aria-hidden="true">{isStrong ? <CheckCircle size={20} weight="duotone" /> : <Target size={20} weight="duotone" />}</span>
                        <div><span className="dimension-label">{model.dimension}</span><h3>{model.title}</h3><span className="status-tag">{isStrong ? '已有基础' : '优先补强'}</span></div>
                        <strong>{model.score}%</strong>
                      </div>
                      <p>{isStrong ? `已有 ${model.evidenceCount} 条证据、覆盖 ${model.experienceCount} 段经历，面试时要把方法讲清楚。` : model.items.length ? model.gap : `还没有已确认的${model.title}证据，先从一段真实经历里补出可验证的动作和结果。`}</p>
                      <ul>
                        {(isStrong ? model.strengthActions : model.actions).map((action) => <li key={action}>{action}</li>)}
                      </ul>
                    </article>
                  )
                })}
              </div>
            </section>

            <section className="mindset-section" aria-labelledby="mindset-title">
              <div className="section-heading-row">
                <div>
                  <h2 id="mindset-title">岗位思维提示</h2>
                  <p className="muted-copy">把这些提示带进每一次回答，避免只讲流程、不讲判断。</p>
                </div>
              </div>
              <div className="mindset-list">
                {MINDSET_GUIDES.map((guide, index) => (
                  <article className="mindset-card" key={guide.title}>
                    <span className="mindset-index">0{index + 1}</span>
                    <div><h3>{guide.title}</h3><p>{guide.prompt}</p><small>{guide.check}</small></div>
                  </article>
                ))}
              </div>
            </section>
          </div>
        </>
      )}
    </section>
  )
}
