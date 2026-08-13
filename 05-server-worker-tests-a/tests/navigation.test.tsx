import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'

import App from '../src/app/App'

afterEach(cleanup)

describe('navigation', () => {
  it.each([
    ['/', 'Offer 探险日'],
    ['/experiences', '经历档案'],
    ['/capabilities', '能力星图'],
    ['/role-directions', '岗位方向'],
    ['/jd-lab', 'JD 实验室'],
    ['/settings', '服务设置'],
  ])('shows the expected heading on %s', (path, heading) => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument()
  })

  it('navigates between destinations and marks the current page', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )

    const navigation = screen.getByRole('navigation', { name: '主要导航' })
    const dashboardLink = screen.getByRole('link', { name: 'Offer 探险日' })
    const experiencesLink = screen.getByRole('link', { name: '经历档案' })

    expect(navigation).toContainElement(dashboardLink)
    expect(dashboardLink).toHaveAttribute('aria-current', 'page')
    expect(experiencesLink).not.toHaveAttribute('aria-current')

    fireEvent.click(experiencesLink)

    expect(
      screen.getByRole('heading', { name: '经历档案' }),
    ).toBeInTheDocument()
    expect(experiencesLink).toHaveAttribute('aria-current', 'page')
    expect(dashboardLink).not.toHaveAttribute('aria-current')
  })

  it.each([
    ['进入经历档案', '经历档案'],
    ['进入能力星图', '能力星图'],
    ['进入岗位方向', '岗位方向'],
    ['进入 JD 实验室', 'JD 实验室'],
  ])('opens the correct dashboard card for %s', (linkName, heading) => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('link', { name: new RegExp(linkName) }))

    expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument()
  })

  it('offers a route back to the dashboard from an unknown URL', () => {
    render(
      <MemoryRouter initialEntries={['/experience']}>
        <App />
      </MemoryRouter>,
    )

    expect(
      screen.getByRole('heading', { name: '页面走丢了' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: '返回求职驾驶舱' }),
    ).toHaveAttribute('href', '/')
  })
})
