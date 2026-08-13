import { useEffect, useState } from 'react'

interface Props {
  active: boolean
  answered: number
}

export default function InterviewProgress({ active, answered }: Props) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!active) return
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [active])
  const minutes = String(Math.floor(elapsed / 60)).padStart(2, '0')
  const seconds = String(elapsed % 60).padStart(2, '0')
  return (
    <div className="interview-progress" aria-label="面试进度">
      <span>已回答 {answered} 题</span><span>{minutes}:{seconds}</span>
    </div>
  )
}
