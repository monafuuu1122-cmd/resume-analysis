import { Route, Routes } from 'react-router-dom'

import NotFoundPage from '../pages/NotFoundPage'
import MockInterviewPage from '../pages/MockInterviewPage'
import AppShell from './AppShell'
import { routeConfig } from './routeConfig'

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/jd-lab/:analysisId/interview" element={<MockInterviewPage />} />
        {routeConfig.map(({ component: Page, path }) => (
          <Route key={path} path={path} element={<Page />} />
        ))}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
