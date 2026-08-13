interface Props {
  disabled?: boolean
  onStart: () => void
}

export default function StartMockInterviewButton({ disabled, onStart }: Props) {
  return (
    <button className="mock-primary-button" disabled={disabled} type="button" onClick={onStart}>
      开始模拟面试
    </button>
  )
}
