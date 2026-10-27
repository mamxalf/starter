import { applyTheme, THEMES, type Theme } from '@starter/ui'

export function ThemeSwitcher() {
  return (
    <select
      aria-label="Theme"
      className="h-8 rounded-ui border-ui bg-surface px-2 text-sm"
      defaultValue={document.documentElement.dataset.theme ?? 'minimal'}
      onChange={(e) => applyTheme(e.target.value as Theme)}
    >
      {THEMES.map((theme) => (
        <option key={theme} value={theme}>
          {theme}
        </option>
      ))}
    </select>
  )
}
