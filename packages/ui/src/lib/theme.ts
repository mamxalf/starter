export const THEMES = ['minimal', 'brutal', 'glass', 'voxel'] as const
export type Theme = (typeof THEMES)[number]
export type Mode = 'light' | 'dark'

const STORAGE_KEY = 'ui.theme'

/** Applies a theme by setting data attributes on <html>. Adding a theme = one CSS file + one entry above. */
export function applyTheme(theme: Theme, mode: Mode = 'light'): void {
  const root = document.documentElement
  root.dataset.theme = theme
  root.dataset.mode = mode
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme, mode }))
  } catch {
    // storage unavailable (private mode): theme still applies for this page
  }
}

export function restoreTheme(fallback: Theme = 'minimal'): { theme: Theme; mode: Mode } {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as {
      theme?: Theme
      mode?: Mode
    } | null
    if (saved?.theme && THEMES.includes(saved.theme)) {
      applyTheme(saved.theme, saved.mode ?? 'light')
      return { theme: saved.theme, mode: saved.mode ?? 'light' }
    }
  } catch {
    // ignore corrupt or unavailable storage
  }
  applyTheme(fallback)
  return { theme: fallback, mode: 'light' }
}
