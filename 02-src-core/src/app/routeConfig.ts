import {
  Archive,
  ChartPolar,
  Compass,
  Flask,
  Gear,
  House,
  Lightbulb,
  type Icon,
} from '@phosphor-icons/react'
import type { ComponentType } from 'react'

import CapabilitiesPage from '../pages/CapabilitiesPage'
import DashboardPage from '../pages/DashboardPage'
import ExperiencesPage from '../pages/ExperiencesPage'
import JdLabPage from '../pages/JdLabPage'
import InterviewPreparationPage from '../pages/InterviewPreparationPage'
import RoleDirectionsPage from '../pages/RoleDirectionsPage'
import SettingsPage from '../pages/SettingsPage'

export interface AppRoute {
  path: string
  label: string
  icon: Icon
  component: ComponentType
}

export const routeConfig: AppRoute[] = [
  {
    path: '/',
    label: 'Offer 探险日',
    icon: House,
    component: DashboardPage,
  },
  {
    path: '/experiences',
    label: '经历档案',
    icon: Archive,
    component: ExperiencesPage,
  },
  {
    path: '/capabilities',
    label: '能力星图',
    icon: ChartPolar,
    component: CapabilitiesPage,
  },
  {
    path: '/role-directions',
    label: '岗位方向',
    icon: Compass,
    component: RoleDirectionsPage,
  },
  {
    path: '/interview-prep',
    label: '面试准备',
    icon: Lightbulb,
    component: InterviewPreparationPage,
  },
  {
    path: '/jd-lab',
    label: 'JD 实验室',
    icon: Flask,
    component: JdLabPage,
  },
  {
    path: '/settings',
    label: '本地设置',
    icon: Gear,
    component: SettingsPage,
  },
]
