/** アプリ全体のレイアウトとルーティング。 */

import { SERVICE_NAME } from '../shared/constants';
import { LanguageSwitcher } from './components/LanguageSwitcher';
import { ToastProvider } from './components/Toast';
import { I18nProvider, useMessages } from './hooks/useI18n';
import { HomePage } from './pages/HomePage';
import { PrivacyPage } from './pages/PrivacyPage';
import { RoomPage } from './pages/RoomPage';
import { TermsPage } from './pages/TermsPage';
import { Link, useRoute } from './router';

function NotFoundPage() {
  const messages = useMessages();
  return (
    <div className="page">
      <div className="card">
        <h1>{messages.common.notFoundTitle}</h1>
        <p>{messages.common.notFoundBody}</p>
        <p className="links">
          <Link href="/">{messages.common.backToTop}</Link>
        </p>
      </div>
    </div>
  );
}

function RouteView() {
  const route = useRoute();
  switch (route.name) {
    case 'home':
      return <HomePage />;
    case 'room':
      return <RoomPage key={route.roomId} roomId={route.roomId} />;
    case 'privacy':
      return <PrivacyPage />;
    case 'terms':
      return <TermsPage />;
    default:
      return <NotFoundPage />;
  }
}

function Shell() {
  const messages = useMessages();
  return (
    <ToastProvider>
      <a className="skip-link" href="#main">
        {messages.common.skipToContent}
      </a>
      <header className="site-header">
        <Link href="/" className="site-title">
          {SERVICE_NAME}
        </Link>
        <nav aria-label={messages.common.siteLinks}>
          <Link href="/privacy">{messages.common.privacyShort}</Link>
          <Link href="/terms">{messages.common.terms}</Link>
          <LanguageSwitcher />
        </nav>
      </header>
      <main id="main">
        <RouteView />
      </main>
      <footer className="site-footer">
        <p>{messages.common.disclaimer}</p>
        <p className="footer-links">
          <Link href="/privacy">{messages.common.privacy}</Link>
          <span aria-hidden="true"> / </span>
          <Link href="/terms">{messages.common.terms}</Link>
        </p>
      </footer>
    </ToastProvider>
  );
}

export function App() {
  return (
    <I18nProvider>
      <Shell />
    </I18nProvider>
  );
}
