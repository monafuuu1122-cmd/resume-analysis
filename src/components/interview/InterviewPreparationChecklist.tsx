import type { PreparationChecklistItem } from '../../domain/types'

export default function InterviewPreparationChecklist({
  items,
  onToggle,
}: {
  items: PreparationChecklistItem[]
  onToggle: (id: string) => void
}) {
  return (
    <section className="preparation-checklist" aria-labelledby="preparation-checklist-title">
      <h4 id="preparation-checklist-title">准备清单</h4>
      {items.length === 0 ? <p className="interview-empty">暂无准备清单。</p> : (
        <ul>{items.map((item) => (
          <li key={item.id}><label><input type="checkbox" checked={item.completed} onChange={() => onToggle(item.id)} />{item.label}</label></li>
        ))}</ul>
      )}
    </section>
  )
}
