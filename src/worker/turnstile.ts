/**
 * Cloudflare Turnstile のサーバー側検証。
 * クライアント側の結果は信用せず、必ず siteverify を呼ぶ。
 * secret が設定されていない場合は「検証成功」とはせず設定エラーとして扱う。
 */

const SITEVERIFY_ENDPOINT = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export type TurnstileResult =
  { status: 'success' } | { status: 'failed'; errorCodes: string[] } | { status: 'misconfigured' };

interface SiteVerifyResponse {
  success?: boolean;
  'error-codes'?: string[];
}

export async function verifyTurnstile(
  secret: string | undefined,
  token: string,
  remoteIp?: string,
): Promise<TurnstileResult> {
  if (!secret) {
    // 本番で検証を無効化できないよう、未設定は必ず失敗扱いにする
    return { status: 'misconfigured' };
  }

  const body = new FormData();
  body.append('secret', secret);
  body.append('response', token);
  if (remoteIp && remoteIp !== 'local') body.append('remoteip', remoteIp);

  let response: Response;
  try {
    response = await fetch(SITEVERIFY_ENDPOINT, { method: 'POST', body });
  } catch {
    return { status: 'failed', errorCodes: ['network-error'] };
  }
  if (!response.ok) {
    return { status: 'failed', errorCodes: [`http-${response.status}`] };
  }

  let payload: SiteVerifyResponse;
  try {
    payload = (await response.json()) as SiteVerifyResponse;
  } catch {
    return { status: 'failed', errorCodes: ['invalid-response'] };
  }

  if (payload.success === true) return { status: 'success' };
  return { status: 'failed', errorCodes: payload['error-codes'] ?? ['verification-failed'] };
}
