import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { THEMES } from './theme'

const themesDir = resolve(import.meta.dirname, '../styles/themes')
const REQUIRED_TOKENS = [
  '--bg',
  '--fg',
  '--surface',
  '--primary',
  '--primary-fg',
  '--border',
  '--danger',
  '--radius',
  '--border-w',
  '--shadow',
  '--shadow-press',
  '--blur',
  '--font-body',
  '--font-heading',
]

describe('themes', () => {
  it('every registered theme has a CSS file, and every CSS file is registered', () => {
    const files = readdirSync(themesDir).map((f) => f.replace('.css', ''))
    expect(files.sort()).toEqual([...THEMES].sort())
  })

  it.each(THEMES)('%s defines every required token', (theme) => {
    const css = readFileSync(resolve(themesDir, `${theme}.css`), 'utf8')
    const missing = REQUIRED_TOKENS.filter((token) => !css.includes(`${token}:`))
    expect(missing).toEqual([])
  })
})
