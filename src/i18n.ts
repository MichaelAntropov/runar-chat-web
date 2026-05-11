import { createI18n } from 'vue-i18n'

import en from './locales/en.json'
import ua from './locales/ua.json'

export type AppLocale = 'en' | 'ua'

const savedLocale = localStorage.getItem('user-locale') as AppLocale | null
const locale = savedLocale || 'en'

export interface LocaleOption {
  code: AppLocale
  label: string
}

export const availableLocales: LocaleOption[] = [
  { code: 'en', label: 'English' },
  { code: 'ua', label: 'Українська' },
]

const i18n = createI18n({
  legacy: false,
  locale: locale,
  fallbackLocale: 'en',
  messages: {
    en,
    ua,
  },
})

export function setLocale(lang: AppLocale) {
  i18n.global.locale.value = lang

  localStorage.setItem('user-locale', lang)
  document.documentElement.setAttribute('lang', lang)
}

export default i18n
