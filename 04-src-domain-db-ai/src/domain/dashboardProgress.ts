export interface DashboardProgressInput {
  experienceCount: number
  confirmedClaimCount: number
  hasQwenConfig: boolean
  analyzedJdCount: number
}

export interface DashboardTask {
  label: string
  to: string
}

export interface DashboardProgress {
  profileCompleteness: number
  preparation: number
  tasks: DashboardTask[]
}

export interface PreparationProgressInput extends DashboardProgressInput {
  profileMaterialCount: number
  careerDirectionCount: number
  interviewResearchCount: number
  completedInterviewCount: number
}

export interface PreparationProgressItem {
  id: string
  label: string
  completed: boolean
  weight: number
  targetRoute: string
  missingReason?: string
}

export function derivePreparationProgress(
  input: PreparationProgressInput,
): {
  overallPercent: number
  items: PreparationProgressItem[]
} {
  const items: PreparationProgressItem[] = [
    {
      id: 'experience',
      label: '经历档案',
      completed: input.experienceCount > 0,
      weight: 20,
      targetRoute: '/experiences',
      missingReason:
        input.experienceCount > 0 ? undefined : '还没有保存经历',
    },
    {
      id: 'evidence',
      label: '能力证据',
      completed: input.confirmedClaimCount > 0,
      weight: 20,
      targetRoute: '/experiences',
      missingReason:
        input.confirmedClaimCount > 0 ? undefined : '还没有确认能力证据',
    },
    {
      id: 'profile',
      label: '补充资料',
      completed: input.profileMaterialCount > 0,
      weight: 10,
      targetRoute: '/experiences',
      missingReason:
        input.profileMaterialCount > 0
          ? undefined
          : '证书、语言或 AI 应用信息尚未补充',
    },
    {
      id: 'direction',
      label: '岗位方向',
      completed: input.careerDirectionCount > 0,
      weight: 10,
      targetRoute: '/role-directions',
      missingReason:
        input.careerDirectionCount > 0 ? undefined : '还没有保存岗位方向',
    },
    {
      id: 'qwen',
      label: 'DeepSeek配置',
      completed: input.hasQwenConfig,
      weight: 10,
      targetRoute: '/settings',
      missingReason: input.hasQwenConfig ? undefined : 'DeepSeek API 尚未配置',
    },
    {
      id: 'jd',
      label: 'JD 分析',
      completed: input.analyzedJdCount > 0,
      weight: 15,
      targetRoute: '/jd-lab',
      missingReason:
        input.analyzedJdCount > 0 ? undefined : '还没有完成 JD 分析',
    },
    {
      id: 'interview',
      label: '面试准备',
      completed:
        input.interviewResearchCount > 0 ||
        input.completedInterviewCount > 0,
      weight: 15,
      targetRoute: '/jd-lab',
      missingReason:
        input.interviewResearchCount > 0 ||
        input.completedInterviewCount > 0
          ? undefined
          : '还没有生成面试重点或完成模拟面试',
    },
  ]
  return {
    overallPercent: items.reduce(
      (total, item) => total + (item.completed ? item.weight : 0),
      0,
    ),
    items,
  }
}

export function deriveDashboardProgress({
  experienceCount,
  confirmedClaimCount,
  hasQwenConfig,
  analyzedJdCount,
}: DashboardProgressInput): DashboardProgress {
  const hasExperience = experienceCount > 0
  const hasConfirmedClaim = confirmedClaimCount > 0
  const hasAnalyzedJd = analyzedJdCount > 0

  const profileCompleteness =
    (hasExperience ? 30 : 0) +
    (hasConfirmedClaim ? 40 : 0) +
    (hasQwenConfig ? 15 : 0) +
    (hasAnalyzedJd ? 15 : 0)

  const preparation =
    (hasExperience ? 15 : 0) +
    (hasConfirmedClaim ? 35 : 0) +
    (hasQwenConfig ? 20 : 0) +
    (hasAnalyzedJd ? 30 : 0)

  const tasks: DashboardTask[] = []

  if (!hasExperience) {
    tasks.push({ label: '添加一段真实经历', to: '/experiences' })
  }
  if (!hasConfirmedClaim) {
    tasks.push({
      label: '确认一条能力证据',
      to: '/experiences',
    })
  }
  if (!hasQwenConfig) {
    tasks.push({ label: '配置DeepSeek助手', to: '/settings' })
  }
  if (!hasAnalyzedJd) {
    tasks.push({ label: '分析一份意向 JD', to: '/jd-lab' })
  }

  return { profileCompleteness, preparation, tasks }
}
