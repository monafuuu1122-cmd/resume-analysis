type EvidenceLinkProps = {
  quote: string
  sourceArtifactId: string
}

export default function EvidenceLink({
  quote,
  sourceArtifactId,
}: EvidenceLinkProps) {
  return (
    <a className="evidence-link" href={`#artifact-${sourceArtifactId}`}>
      {quote}
    </a>
  )
}
