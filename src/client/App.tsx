/** アプリ全体のレイアウトとルーティング。 */

import { DISCLAIMER, SERVICE_NAME } from '../shared/constants';
import { ToastProvider } from './components/Toast';
import { HomePage } from './pages/HomePage';
import { PrivacyPage } from './pages/PrivacyPage';
import { RoomPage } from './pages/RoomPage';
import { TermsPage } from './pages/TermsPage';
import { Link, useRoute } from './router';

function NotFoundPage() {
  return (
    <div className="page">
      <div className="card">
        <h1>ページが見つかりません</h1>
        <p>URL をご確認ください。</p>
        <p className="links">
          <Link href="/">トップページへ戻る</Link>
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

export function App() {
  return (
    <ToastProvider>
      <a className="skip-link" href="#main">
        本文へスキップ
      </a>
      <header className="site-header">
        <Link href="/" className="site-title">
          {SERVICE_NAME}
        </Link>
        <nav aria-label="サイト内リンク">
          <Link href="/privacy">プライバシー</Link>
          <Link href="/terms">利用規約</Link>
        </nav>
      </header>
      <main id="main">
        <RouteView />
      </main>
      <footer className="site-footer">
        <p>{DISCLAIMER}</p>
        <p className="footer-links">
          <Link href="/privacy">プライバシーポリシー</Link>
          <span aria-hidden="true"> / </span>
          <Link href="/terms">利用規約</Link>
        </p>
      </footer>
    </ToastProvider>
  );
}
