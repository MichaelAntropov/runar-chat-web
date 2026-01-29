import { ref } from 'vue'

type Theme = 'light' | 'dark'

const currentTheme = ref<Theme>('light')

export function useTheme() {
  const setTheme = (theme: Theme) => {
    currentTheme.value = theme
    document.documentElement.setAttribute('data-bs-theme', theme)
    localStorage.setItem('theme', theme)
  }

  const initTheme = () => {
    const storedTheme = localStorage.getItem('theme') as Theme | null

    if (storedTheme) {
      setTheme(storedTheme)
    } else {
      setTheme('light')
    }
  }

  return {
    currentTheme,
    setTheme,
    initTheme,
  }
}
