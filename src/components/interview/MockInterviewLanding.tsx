import { ArrowRight, Briefcase, UserCircle } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'

import type { InterviewResearch, JdRecord } from '../../domain/types'

interface Props {
  jd: JdRecord
  research?: InterviewResearch
  busy: boolean
  onStart: (interviewType: 'hr' | 'business') => void
}

export default function MockInterviewLanding({ jd, research, busy, onStart }: Props) {
  return (
    <>
      <header className="mock-hero">
        <p className="eyebrow">INTERVIEW STUDIO</p>
        <h1>模拟面试训练场</h1>
        <p>{jd.company} · {jd.role}</p>
        <span>你的 JD、证据档案与研究资料已自动带入，无需重复输入。</span>
        <Link className="mock-back-button" to={`/jd-lab?analysisId=${jd.id}&tab=interview`}>
          ← 返回当前 JD 分析
        </Link>
      </header>

      {!research ? (
        <aside className="mock-notice">
          <span>尚未生成企业研究；文字训练仍可继续。</span>
          <Link to={`/jd-lab?analysisId=${jd.id}&tab=interview`}>返回补充面试研究</Link>
        </aside>
      ) : null}

      <div className="mock-mode-grid">
        <article className="mock-mode-card">
          <UserCircle size={42} weight="duotone" aria-hidden="true" />
          <p className="eyebrow">MODE 01</p>
          <h2>HR 面</h2>
          <p>练习自我介绍、求职动机、企业与岗位选择，以及经历真实性核实。</p>
          <button className="mock-secondary-button" type="button" disabled={busy} onClick={() => onStart('hr')}>
            开始 HR 面 <ArrowRight aria-hidden="true" />
          </button>
        </article>
        <article className="mock-mode-card mock-mode-card-accent">
          <Briefcase size={42} weight="duotone" aria-hidden="true" />
          <p className="eyebrow">MODE 02</p>
          <h2>业务面</h2>
          <p>围绕业务理解、JD 核心能力和场景行为题逐步深挖，动态追问。</p>
          <button className="mock-primary-button" type="button" disabled={busy} onClick={() => onStart('business')}>
            开始业务面 <ArrowRight aria-hidden="true" />
          </button>
        </article>
      </div>
    </>
  )
}
