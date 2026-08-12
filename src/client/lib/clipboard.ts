/**
 * クリップボードへのコピー。
 * Clipboard API が使えない環境（非セキュアコンテキスト等）向けのフォールバック付き。
 */

export async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // フォールバックへ
    }
  }
  return legacyCopy(text);
}

function legacyCopy(text: string): boolean {
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.setAttribute('aria-hidden', 'true');
    textarea.style.position = 'fixed';
    textarea.style.top = '-1000px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    const succeeded = document.execCommand('copy');
    document.body.removeChild(textarea);
    return succeeded;
  } catch {
    return false;
  }
}
