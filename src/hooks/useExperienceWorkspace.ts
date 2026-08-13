import { useRef, useState } from 'react'

import {
  loadExperienceWorkspace,
  replaceArtifactPendingExtraction,
  type ExtractionSet,
} from '../db/experienceRepository'
import type {
  EvidenceSpan,
  Experience,
  ExtractedClaim,
  SourceArtifact,
} from '../domain/types'

export type ExperienceExtractor = (
  source: string,
  experienceId: string,
  sourceArtifactId: string,
) => ExtractionSet | Promise<ExtractionSet>

export function storageErrorMessage(storageError: unknown) {
  const detail =
    storageError instanceof Error ? storageError.message : '未知存储错误'
  return `本地存储失败：${detail}`
}

export function useExperienceWorkspace(extractor?: ExperienceExtractor) {
  const [activeExperience, setActiveExperience] = useState<Experience>()
  const [artifacts, setArtifacts] = useState<SourceArtifact[]>([])
  const [evidenceSpans, setEvidenceSpans] = useState<EvidenceSpan[]>([])
  const [claims, setClaims] = useState<ExtractedClaim[]>([])
  const [error, setError] = useState('')
  const [extractingArtifactIds, setExtractingArtifactIds] = useState(
    () => new Set<string>(),
  )
  const selectionGeneration = useRef(0)
  const activeExperienceId = useRef<string | undefined>(undefined)
  const extractionGenerations = useRef(new Map<string, number>())

  const clearDependentState = () => {
    setArtifacts([])
    setEvidenceSpans([])
    setClaims([])
  }

  const activateExperience = (experience: Experience) => {
    selectionGeneration.current += 1
    setExtractingArtifactIds(new Set())
    activeExperienceId.current = experience.id
    setActiveExperience(experience)
    clearDependentState()
    setError('')
  }

  const clearActiveExperience = () => {
    selectionGeneration.current += 1
    activeExperienceId.current = undefined
    setActiveExperience(undefined)
    setExtractingArtifactIds(new Set())
    clearDependentState()
  }

  const selectExperience = async (experience: Experience) => {
    const generation = selectionGeneration.current + 1
    selectionGeneration.current = generation
    setExtractingArtifactIds(new Set())
    activeExperienceId.current = experience.id
    setActiveExperience(experience)
    clearDependentState()
    setError('')

    try {
      const workspace = await loadExperienceWorkspace(experience.id)
      if (selectionGeneration.current !== generation) return
      setArtifacts(workspace.artifacts)
      setEvidenceSpans(workspace.evidenceSpans)
      setClaims(workspace.claims)
    } catch (storageError) {
      if (selectionGeneration.current !== generation) return
      setError(storageErrorMessage(storageError))
    }
  }

  const addArtifact = (artifact: SourceArtifact) => {
    setArtifacts((current) => [...current, artifact])
  }

  const extractArtifact = async (artifact: SourceArtifact) => {
    if (!extractor) {
      setError('请先配置DeepSeek API Key')
      return
    }

    const generation = (extractionGenerations.current.get(artifact.id) ?? 0) + 1
    extractionGenerations.current.set(artifact.id, generation)
    setExtractingArtifactIds((current) => new Set(current).add(artifact.id))
    setError('')

    try {
      const result = await extractor(
        artifact.content,
        artifact.experienceId,
        artifact.id,
      )
      if (extractionGenerations.current.get(artifact.id) !== generation) return
      await replaceArtifactPendingExtraction(artifact.id, result)
      if (extractionGenerations.current.get(artifact.id) !== generation) return
      if (
        activeExperienceId.current &&
        activeExperienceId.current !== artifact.experienceId
      ) return
      const refreshGeneration = selectionGeneration.current + 1
      selectionGeneration.current = refreshGeneration
      const workspace = await loadExperienceWorkspace(artifact.experienceId)
      if (
        extractionGenerations.current.get(artifact.id) !== generation ||
        selectionGeneration.current !== refreshGeneration ||
        (activeExperienceId.current &&
          activeExperienceId.current !== artifact.experienceId)
      ) return
      setArtifacts(workspace.artifacts)
      setClaims(workspace.claims)
      setEvidenceSpans(workspace.evidenceSpans)
    } catch (extractionError) {
      if (
        extractionGenerations.current.get(artifact.id) !== generation ||
        (activeExperienceId.current &&
          activeExperienceId.current !== artifact.experienceId)
      ) return
      setError(
        extractionError instanceof Error
          ? extractionError.message
          : '提炼信息失败',
      )
    } finally {
      if (extractionGenerations.current.get(artifact.id) === generation) {
        setExtractingArtifactIds((current) => {
          const next = new Set(current)
          next.delete(artifact.id)
          return next
        })
      }
    }
  }

  const updateClaim = (nextClaim: ExtractedClaim) => {
    setClaims((current) =>
      current.map((claim) => (claim.id === nextClaim.id ? nextClaim : claim)),
    )
  }

  return {
    activeExperience,
    activateExperience,
    addArtifact,
    artifacts,
    claims,
    clearActiveExperience,
    error,
    evidenceSpans,
    extractingArtifactIds,
    extractArtifact,
    selectExperience,
    setError,
    updateClaim,
  }
}
