/** プライバシーポリシー（実装内容と一致する内容を記載する）。 */

import { useEffect } from 'react';
import { SERVICE_NAME } from '../../shared/constants';
import { AUTHORITATIVE_LOCALE } from '../../shared/i18n';
import { useI18n } from '../hooks/useI18n';
import { Link } from '../router';

export function PrivacyPage() {
  const { locale, messages } = useI18n();
  const t = messages.privacy;

  useEffect(() => {
    document.title = `${t.title} - ${SERVICE_NAME}`;
  }, [t.title]);

  return (
    <div className="page">
      <article className="card prose">
        <h1>{t.title}</h1>
        {/* 翻訳の解釈差に備え、非日本語版には正本を明示する */}
        {locale !== AUTHORITATIVE_LOCALE && <p className="translation-note">{t.translationNote}</p>}
        <p>{t.intro(SERVICE_NAME)}</p>

        <h2>{t.s1Title}</h2>
        <ul>
          {t.s1Items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>{t.s1Body}</p>

        <h2>{t.s2Title}</h2>
        <p>{t.s2Body}</p>

        <h2>{t.s3Title}</h2>
        <p>{t.s3Body}</p>

        <h2>{t.s4Title}</h2>
        <p>{t.s4Body1}</p>
        <p>{t.s4Body2}</p>

        <h2>{t.s5Title}</h2>
        <p>{t.s5Body}</p>

        <h2>{t.s6Title}</h2>
        <p>{t.s6Body}</p>

        <h2>{t.s7Title}</h2>
        <p>{t.s7Body}</p>

        <h2>{t.s8Title}</h2>
        <p>{t.s8Body}</p>

        <h2>{t.s9Title}</h2>
        <p>{t.s9Body}</p>

        <p className="links">
          <Link href="/">{messages.common.backToTop}</Link>
          <span aria-hidden="true"> / </span>
          <Link href="/terms">{messages.common.terms}</Link>
        </p>
      </article>
    </div>
  );
}
