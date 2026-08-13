import type { Icon } from '@phosphor-icons/react'

interface StatusCardProps {
  icon: Icon
  label: string
  value: number
}

export default function StatusCard({
  icon: IconComponent,
  label,
  value,
}: StatusCardProps) {
  return (
    <article className="status-card">
      <div className="status-card-heading">
        <span className="status-icon" aria-hidden="true">
          <IconComponent size={22} weight="duotone" />
        </span>
        <span>{label}</span>
      </div>
      <strong>{value}%</strong>
      <div
        className="progress-track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
      >
        <span style={{ width: `${value}%` }} />
      </div>
    </article>
  )
}
