import type { SourceArtifact } from '../domain/types'

type ArtifactPanelProps = {
  artifacts: SourceArtifact[]
  extractingArtifactIds: ReadonlySet<string>
  onExtract: (artifact: SourceArtifact) => void
}

export default function ArtifactPanel({
  artifacts,
  extractingArtifactIds,
  onExtract,
}: ArtifactPanelProps) {
  return (
    <div className="artifact-list">
      {artifacts.map((artifact) => {
        const busy = extractingArtifactIds.has(artifact.id)
        return (
          <article
            className="source-artifact"
            id={`artifact-${artifact.id}`}
            key={artifact.id}
          >
            <h3>{artifact.title}</h3>
            <p className="raw-source">{artifact.content}</p>
            <button
              aria-busy={busy}
              disabled={busy}
              type="button"
              onClick={() => onExtract(artifact)}
            >
              提炼信息
            </button>
          </article>
        )
      })}
    </div>
  )
}
