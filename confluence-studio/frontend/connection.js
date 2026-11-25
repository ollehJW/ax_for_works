const el = id => document.getElementById(id);
const form = el('token-form');
const field = el('token');
const visibility = el('visibility');
const message = el('message');

function notice(text, error = false) {
  message.textContent = text;
  message.classList.toggle('error', error);
}
function reveal(visible) {
  field.type = visible ? 'text' : 'password';
  visibility.textContent = visible ? '숨기기' : '표시';
  visibility.setAttribute('aria-label', visible ? '토큰 숨기기' : '토큰 표시');
  visibility.setAttribute('aria-pressed', String(visible));
}
function screen(state, result = {}) {
  form.hidden = !['missing', 'invalid', 'replace'].includes(state);
  el('login').hidden = state !== 'login';
  el('retry').hidden = !['error', 'login'].includes(state);
  el('replace').hidden = state !== 'connected';
  field.value = '';
  reveal(false);
  field.setAttribute('aria-invalid', String(state === 'invalid'));
  el('form-title').textContent = ({
    connected: 'Confluence 연결 완료', invalid: 'Confluence 계정 다시 연결', replace: 'Access Token 변경',
  })[state] || 'Confluence 계정 연결';
  el('description').textContent = ({
    connected: result.display_name + ' 계정으로 연결되었습니다.',
    login: 'AX for Works에 로그인한 뒤 다시 확인해 주세요.',
    error: '연결 상태를 확인하지 못했습니다.',
    loading: '저장된 연결 정보를 확인하고 있습니다.',
  })[state] || '개인 Access Token을 입력해 계정을 연결하세요.';
  notice(state === 'invalid' ? '기존 토큰이 만료되었거나 유효하지 않습니다.'
    : state === 'connected' ? '최근 확인 ' + new Date(result.last_verified_at).toLocaleString('ko-KR')
    : result.detail || '', state === 'invalid' || state === 'error');
}
let busy = false;
async function check(save = false) {
  if (busy) return;
  const token = save ? field.value.trim() : '';
  if (save && !token) {
    notice('Access Token을 입력해 주세요.', true);
    field.setAttribute('aria-invalid', 'true');
    field.focus();
    return;
  }
  busy = true;
  if (save) {
    field.value = '';
    reveal(false);
    el('submit').disabled = true;
    field.disabled = true;
    notice('Confluence 사용자 정보를 확인하고 있습니다.');
  } else {
    screen('loading');
  }
  try {
    const response = await fetch('/api/connection', save ? {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Studio-Request': '1' },
      body: JSON.stringify({ token }), cache: 'no-store',
    } : { cache: 'no-store' });
    const result = await response.json().catch(() => ({}));
    if (response.ok) screen(result.state, result);
    else if (response.status === 401 || response.status === 403) screen('login', result);
    else if (save && response.status === 422) {
      screen('invalid');
      notice(result.detail || '새 토큰을 입력해 주세요.', true);
    } else screen('error', result);
  } catch {
    screen('error', { detail: '서비스에 연결할 수 없습니다. 잠시 후 다시 확인해 주세요.' });
  } finally {
    busy = false;
    field.disabled = false;
    el('submit').disabled = false;
  }
}
visibility.addEventListener('click', () => reveal(field.type === 'password'));
field.addEventListener('input', () => {
  notice('');
  field.setAttribute('aria-invalid', 'false');
});
form.addEventListener('submit', event => { event.preventDefault(); check(true); });
el('retry').addEventListener('click', () => check());
el('replace').addEventListener('click', () => { screen('replace'); field.focus(); });
window.addEventListener('pagehide', () => { field.value = ''; reveal(false); });
window.addEventListener('pageshow', () => check());
window.addEventListener('focus', () => {
  if (!el('login').hidden) check();
});
