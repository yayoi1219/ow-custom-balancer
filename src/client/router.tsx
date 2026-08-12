/** 依存を増やさない最小限のクライアントルーター。 */

import { useCallback, useEffect, useState, type MouseEvent, type ReactNode } from 'react';

export type Route =
  | { name: 'home' }
  | { name: 'room'; roomId: string }
  | { name: 'privacy' }
  | { name: 'terms' }
  | { name: 'notfound' };

export function parseRoute(pathname: string): Route {
  const segments = pathname.split('/').filter((segment) => segment.length > 0);
  if (segments.length === 0) return { name: 'home' };
  if (segments[0] === 'privacy' && segments.length === 1) return { name: 'privacy' };
  if (segments[0] === 'terms' && segments.length === 1) return { name: 'terms' };
  if (segments[0] === 'room' && segments.length === 2) {
    return { name: 'room', roomId: decodeURIComponent(segments[1]) };
  }
  return { name: 'notfound' };
}

export function navigate(path: string): void {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.pathname));

  useEffect(() => {
    const handlePopState = (): void => {
      setRoute(parseRoute(window.location.pathname));
      window.scrollTo(0, 0);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  return route;
}

export function Link({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  const handleClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
      event.preventDefault();
      navigate(href);
    },
    [href],
  );
  return (
    <a href={href} className={className} onClick={handleClick}>
      {children}
    </a>
  );
}
