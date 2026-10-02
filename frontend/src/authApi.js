export async function authRequest(path, options = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      credentials: 'same-origin', ...options,
      headers: { 'Content-Type': 'application/json', 'X-AX-Request': '1', ...options.headers },
    });
  } catch {
    throw new Error('서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.');
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && !['/auth/login', '/auth/me'].includes(path)) window.dispatchEvent(new Event('ax-session-expired'));
    const message = typeof data?.detail === 'string' ? data.detail : Array.isArray(data?.detail)
      ? data.detail.map(e => e.msg.replace('Value error, ', '')).join(' / ')
      : '서버에 연결할 수 없습니다. 다시 시도해 주세요.';
    const error = new Error(message); error.status = response.status; throw error;
  }
  return data;
}
export const postAuth = (path, body = {}) => authRequest(path, { method: 'POST', body: JSON.stringify(body) });
