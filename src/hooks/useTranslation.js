import { useLanguage } from '../contexts/LanguageContext';
import enTranslations from '../translations/en';
import frTranslations from '../translations/fr';
import tnTranslations from '../translations/tn';

const translations = {
  en: enTranslations,
  fr: frTranslations,
  tn: tnTranslations,
};

export const useTranslation = () => {
  const { language } = useLanguage();
  
  const t = (key, fallback = key) => {
    const translation = translations[language]?.[key];
    if (translation) {
      return translation;
    }
    // Fallback to English if translation not found
    return translations.en?.[key] || fallback;
  };
  
  return { t, language };
};

