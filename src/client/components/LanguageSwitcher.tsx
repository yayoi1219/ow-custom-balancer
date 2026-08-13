/** ヘッダーに置く言語切り替え。選択は localStorage に保存される。 */

import { LOCALE_LABELS, SUPPORTED_LOCALES, isLocale } from '../../shared/i18n';
import { useI18n } from '../hooks/useI18n';

export function LanguageSwitcher() {
  const { locale, messages, setLocale } = useI18n();

  return (
    <label className="language-switcher">
      <span className="visually-hidden">{messages.common.language}</span>
      <select
        value={locale}
        onChange={(event) => {
          const next = event.target.value;
          if (isLocale(next)) setLocale(next);
        }}
      >
        {SUPPORTED_LOCALES.map((item) => (
          <option key={item} value={item}>
            {LOCALE_LABELS[item]}
          </option>
        ))}
      </select>
    </label>
  );
}
