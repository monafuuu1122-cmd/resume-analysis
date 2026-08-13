import { RocketLaunch } from '@phosphor-icons/react'
import { NavLink, Outlet } from 'react-router-dom'

import { routeConfig } from './routeConfig'

export default function AppShell() {
  return (
    <div className="app-shell">
      <aside className="side-rail">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <RocketLaunch size={20} weight="duotone" />
          </span>
          <span>Offer 探险</span>
        </div>

        <nav aria-label="主要导航">
          <ul className="nav-list">
            {routeConfig.map(({ icon: Icon, label, path }) => (
              <li key={path}>
                <NavLink className="nav-link" end={path === '/'} to={path}>
                  <Icon aria-hidden="true" size={22} weight="duotone" />
                  <span>{label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <main className="content-surface">
        <Outlet />
      </main>
    </div>
  )
}
