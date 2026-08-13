import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const tokensCss = readFileSync(resolve('src/styles/tokens.css'), 'utf8')
const globalCss = readFileSync(resolve('src/styles/global.css'), 'utf8')

describe('design tokens', () => {
  it.each([
    ['--peach-bg', '#fbe2d1'],
    ['--surface', '#fffdf8'],
    ['--coral', '#efaa8e'],
    ['--sage', '#e4eedf'],
    ['--wheat', '#f6e6bb'],
    ['--mist', '#e3eded'],
    ['--ink', '#554b48'],
    ['--muted', '#96847c'],
    ['--radius-xl', '32px'],
    ['--radius-lg', '22px'],
  ])('declares %s as %s', (name, value) => {
    expect(tokensCss).toMatch(
      new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:\\s*${value}`),
    )
  })
})

describe('rail contrast', () => {
  it.each(['.brand', '.nav-link'])(
    'places %s text on the light surface',
    (selector) => {
      const escapedSelector = selector.replace(
        /[.*+?^${}()|[\]\\]/g,
        '\\$&',
      )

      expect(globalCss).toMatch(
        new RegExp(
          `${escapedSelector}\\s*\\{[^}]*background\\s*:\\s*var\\(--surface\\)`,
          's',
        ),
      )
    },
  )
})

it('visibly styles the selected experience control', () => {
  expect(globalCss).toMatch(
    /\.experience-list button\[aria-pressed='true'\]\s*\{[^}]+background\s*:/s,
  )
})

it('keeps the dashboard search keyboard focus visible', () => {
  expect(globalCss).toMatch(
    /\.dashboard-search:focus-within\s*\{[^}]*outline\s*:\s*3px solid var\(--ink\)[^}]*outline-offset\s*:\s*3px/s,
  )
})

it('keeps the desktop hero title on a readable horizontal line', () => {
  expect(globalCss).toMatch(
    /\.dashboard-hero-copy h1\s*\{[^}]*max-width\s*:\s*none[^}]*font-size\s*:\s*clamp\(2\.35rem,\s*3vw,\s*3rem\)[^}]*white-space\s*:\s*nowrap/s,
  )
})
