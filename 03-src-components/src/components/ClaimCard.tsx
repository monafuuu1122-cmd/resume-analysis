import { useState, type FormEvent } from 'react'

import { db } from '../db/database'
import { extractedClaimSchema } from '../domain/schemas'
import type { EvidenceSpan, ExtractedClaim } from '../domain/types'
import { storageErrorMessage } from '../hooks/useExperienceWorkspace'
import EvidenceLink from './EvidenceLink'

export const kindLabels: Record<ExtractedClaim['kind'], string> = {
  responsibility: '职责',
  action: '行动',
  result: '成果',
  capability: '能力',
  tool: '工具',
  ai: 'AI 实践',
  certificate: '证书',
}

const statusLabels: Record<ExtractedClaim['status'], string> = {
  pending: '待确认',
  confirmed: '已确认',
  rejected: '已拒绝',
}

type ClaimCardProps = {
  claim: ExtractedClaim
  evidence?: EvidenceSpan
  onStorageError: (message: string) => void
  onUpdate: (claim: ExtractedClaim) => void
}

export default function ClaimCard({
  claim,
  evidence,
  onStorageError,
  onUpdate,
}: ClaimCardProps) {
  const [editing, setEditing] = useState(false)
  const [label, setLabel] = useState('')
  const [detail, setDetail] = useState('')

  const beginEdit = () => {
    setLabel(claim.label)
    setDetail(claim.detail)
    setEditing(true)
  }

  const setStatus = async (status: ExtractedClaim['status']) => {
    try {
      const nextClaim = extractedClaimSchema.parse({ ...claim, status })
      await db.claims.put(nextClaim)
      onUpdate(nextClaim)
    } catch (storageError) {
      onStorageError(storageErrorMessage(storageError))
    }
  }

  const saveEdit = async (event: FormEvent) => {
    event.preventDefault()
    try {
      const nextClaim = extractedClaimSchema.parse({
        ...claim,
        label,
        detail,
        status: 'pending',
      })
      await db.claims.put(nextClaim)
      onUpdate(nextClaim)
      setEditing(false)
    } catch (storageError) {
      onStorageError(storageErrorMessage(storageError))
    }
  }

  return (
    <article className="claim-card">
      <div className="claim-meta">
        <span>{kindLabels[claim.kind]}</span>
        <span>{statusLabels[claim.status]}</span>
      </div>
      {editing ? (
        <form className="stack-form" onSubmit={saveEdit}>
          <label>
            信息标题
            <input
              required
              value={label}
              onChange={(event) => setLabel(event.target.value)}
            />
          </label>
          <label>
            信息详情
            <textarea
              value={detail}
              onChange={(event) => setDetail(event.target.value)}
            />
          </label>
          <button type="submit">保存修改</button>
        </form>
      ) : (
        <>
          <h3>{claim.label}</h3>
          {claim.detail && <p>{claim.detail}</p>}
        </>
      )}
      {evidence && (
        <p>
          证据：
          <EvidenceLink
            quote={evidence.quote}
            sourceArtifactId={evidence.sourceArtifactId}
          />
        </p>
      )}
      {!editing && claim.status === 'pending' && (
        <div className="button-row">
          <button type="button" onClick={() => void setStatus('confirmed')}>
            确认
          </button>
          <button type="button" onClick={beginEdit}>
            修改
          </button>
          <button type="button" onClick={() => void setStatus('rejected')}>
            拒绝
          </button>
        </div>
      )}
    </article>
  )
}
