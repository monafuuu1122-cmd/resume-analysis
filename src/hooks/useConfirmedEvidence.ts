import { useEffect, useState } from 'react'

import {
  loadConfirmedEvidenceSnapshot,
  type ConfirmedEvidenceSnapshot,
} from '../db/evidenceRepository'

interface ConfirmedEvidenceState {
  snapshot: ConfirmedEvidenceSnapshot | null
  loading: boolean
  error: string | null
}

export function useConfirmedEvidence(): ConfirmedEvidenceState {
  const [state, setState] = useState<ConfirmedEvidenceState>({
    snapshot: null,
    loading: true,
    error: null,
  })

  useEffect(() => {
    let active = true
    setState({ snapshot: null, loading: true, error: null })

    loadConfirmedEvidenceSnapshot()
      .then((snapshot) => {
        if (active) setState({ snapshot, loading: false, error: null })
      })
      .catch((error: unknown) => {
        if (!active) return
        const message =
          error instanceof Error ? error.message : '未知的本地存储错误'
        setState({ snapshot: null, loading: false, error: message })
      })

    return () => {
      active = false
    }
  }, [])

  return state
}
