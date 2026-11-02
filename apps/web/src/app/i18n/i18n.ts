import { initReactI18next } from 'react-i18next';
import i18n from 'i18next';
import ICU from 'i18next-icu';
import { STORAGE_KEYS } from '@/core/constants';
import { translations as enTranslations } from '../locales/en/translations';

const defaultLanguage = 'en';
const savedLanguage = localStorage.getItem(STORAGE_KEYS.APP_LANGUAGE) || defaultLanguage;

const resources = {
  en: {
    translation: enTranslations
  }
};

export const availableLanguages = ['en'];

i18n
  .use(ICU)
  .use(initReactI18next)
  .init({
    resources,
    lng: savedLanguage,
    debug: true,
    fallbackLng: defaultLanguage,
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
