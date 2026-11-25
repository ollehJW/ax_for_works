const field = document.querySelector('#token');
const visibility = document.querySelector('#visibility');
const message = document.querySelector('#message');
const invalidToken = new URLSearchParams(location.search).get('state') === 'invalid';

function showMessage(text, isError = false) {
  message.textContent = text;
  message.classList.toggle('error', isError);
  field.setAttribute('aria-invalid', String(isError));
}

function setVisibility(visible) {
  field.type = visible ? 'text' : 'password';
  visibility.textContent = visible ? '숨기기' : '표시';
  visibility.setAttribute('aria-label', visible ? '토큰 숨기기' : '토큰 표시');
  visibility.setAttribute('aria-pressed', String(visible));
}

if (invalidToken) {
  document.querySelector('#form-title').textContent = 'Confluence 계정 다시 연결';
  document.querySelector('#description').textContent = '새 Access Token을 입력해 다시 연결하세요.';
  showMessage('기존 토큰이 만료되었거나 유효하지 않습니다.', true);
}

visibility.addEventListener('click', () => setVisibility(field.type === 'password'));
field.addEventListener('input', () => showMessage(''));
document.querySelector('#token-form').addEventListener('submit', event => {
  event.preventDefault();
  if (!field.value.trim()) {
    showMessage('Access Token을 입력해 주세요.', true);
    field.focus();
    return;
  }
  field.value = '';
  setVisibility(false);
  showMessage('입력 화면 확인을 마쳤습니다. 실제 연결은 API 연동 후 사용할 수 있습니다.');
});
window.addEventListener('pagehide', () => {
  field.value = '';
  setVisibility(false);
});
