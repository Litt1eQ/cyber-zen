import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { en, zhCN, zhTW } from './resources'
import { resolveSupportedLocaleFromNavigator } from './locale'

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    'zh-CN': { translation: zhCN },
    'zh-TW': { translation: zhTW },
  },
  lng: resolveSupportedLocaleFromNavigator(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
})

export default i18n

