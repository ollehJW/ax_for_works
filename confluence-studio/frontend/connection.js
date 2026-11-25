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
  const connected = state === 'connected';
  el('setup').hidden = connected;
  el('workspace').hidden = !connected;
  document.title = connected ? 'Confluence Studio' : '계정 연결 · Confluence Studio';
  field.value = '';
  reveal(false);
  if (connected) {
    showCompose(false);
    spaces = result.spaces || [];
    renderSpaces();
    el('space-form').reset();
    el('space-status').textContent = '';
    el('profile-name').textContent = result.display_name;
    el('verified').textContent = '최근 확인 ' + new Date(result.last_verified_at).toLocaleString('ko-KR');
    el('workspace-title').focus();
    return;
  }
  form.hidden = !['missing', 'invalid', 'replace'].includes(state);
  el('retry').hidden = state !== 'error';
  field.setAttribute('aria-invalid', String(state === 'invalid'));
  el('form-title').textContent = ({
    invalid: 'Confluence 계정 다시 연결', replace: 'Access Token 변경',
  })[state] || 'Confluence 계정 연결';
  el('description').textContent = ({
    error: '연결 상태를 확인하지 못했습니다.',
    loading: '저장된 연결 정보를 확인하고 있습니다.',
  })[state] || '개인 Access Token을 입력해 계정을 연결하세요.';
  notice(state === 'invalid' ? '기존 토큰이 만료되었거나 유효하지 않습니다.'

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
    const response = await fetch('./api/connection', save ? {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Studio-Request': '1' },
      body: JSON.stringify({ token }), cache: 'no-store',
    } : { cache: 'no-store' });
    const result = await response.json().catch(() => ({}));
    if (response.ok) screen(result.state, result);
    else if (response.status === 401 || (!save && response.status === 403)) {
      const login = window.location.pathname.startsWith('/confluencestudio/')
        ? '/login?next=%2Fconfluencestudio%2F' : '/login';
      window.location.replace(login);
    } else if (save && response.status === 422) {
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

let spaces = [];
function renderSpaces() {
  el('spaces-empty').hidden = spaces.length > 0;
  el('space-list').replaceChildren(...spaces.map(space => {
    const item = document.createElement('li');
    item.textContent = space.name + ' (' + space.space_key + ')';
    return item;
  }));
}
el('spaces-menu').addEventListener('click', () => showCompose(false));
el('compose-menu').addEventListener('click', () => showCompose(true));
el('space-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.submitter || el('space-form').querySelector('button');
  if (button.disabled) return;
  button.disabled = true;
  el('space-status').textContent = '접근 권한을 확인하고 있습니다.';
  try {
    const response = await fetch('./api/spaces', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Studio-Request': '1' },
      body: JSON.stringify({ space_key: el('space-key').value.trim() }),
    });
    if (response.status === 401 || response.status === 409) {
      await check();
      return;
    }
    const result = await response.json();
    if (!response.ok) {
      el('space-status').textContent = result.detail || '스페이스 등록에 실패했습니다.';
      return;
    }
    spaces = spaces.filter(space => space.space_key !== result.space_key);
    spaces.push(result);
    spaces.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    renderSpaces();
    el('space-form').reset();
    el('space-status').textContent = result.name + ' 스페이스를 등록했습니다.';
  } catch {
    el('space-status').textContent = '서비스에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.';
  } finally {
    button.disabled = false;
  }
});

function showCompose(active) {
  for (const [id, current] of [['compose-menu', active], ['spaces-menu', !active]]) {
    if (current) el(id).setAttribute('aria-current', 'page');
    else el(id).removeAttribute('aria-current');
  }
  el('workspace-title').textContent = active ? '페이지 작성' : '스페이스 등록';
  el('registration-card').hidden = active;
  el('account-card').hidden = active;
  el('compose-panel').hidden = !active;
  el('tree-panel').hidden = true;
  el('page-tree').replaceChildren();
  if (active) {
    el('compose-space').replaceChildren(
      new Option(spaces.length ? '스페이스를 선택하세요' : '먼저 스페이스를 등록하세요', ''),
      ...spaces.map(space => new Option(space.name + ' (' + space.space_key + ')', space.space_key)),
    );
    el('compose-space').disabled = !spaces.length;
  }
}

function leafPage(title) {
  const leaf = document.createElement('div');
  leaf.className = 'tree-leaf';
  leaf.textContent = title;
  return leaf;
}

async function loadBranch(container, spaceKey, parentId = null, start = 0) {
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.textContent = '페이지를 불러오는 중입니다.';
  container.append(status);
  function action(label, offset) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', () => {
      button.remove();
      status.remove();
      loadBranch(container, spaceKey, parentId, offset);
    });
    container.append(button);
  }
  try {
    const response = await fetch('./api/pages', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Studio-Request': '1' },
      body: JSON.stringify({ space_key: spaceKey, parent_id: parentId, start }),
    });
    if (!container.isConnected) return;
    if (response.status === 401 || response.status === 409) {
      await check();
      return;
    }
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || '페이지 조회에 실패했습니다.');
    if (parentId && !start && !data.pages.length && data.next_start == null) {
      const branch = container.parentElement;
      if (branch?.matches('details')) {
        branch.replaceWith(leafPage(branch.querySelector('summary').textContent));
        return;
      }
    }
    if (data.pages.length || start) status.remove();
    else status.textContent = parentId ? '하위 페이지가 없습니다.' : '표시할 페이지가 없습니다.';
    for (const page of data.pages) {
      if (page.has_children === false) {
        container.append(leafPage(page.title));
        continue;
      }
      const branch = document.createElement('details');
      const title = document.createElement('summary');
      title.textContent = page.title;
      branch.append(title);
      const children = document.createElement('div');
      branch.append(children);
      branch.addEventListener('toggle', () => {
        if (branch.open && !children.childElementCount) loadBranch(children, spaceKey, page.id);
      });
      container.append(branch);
    }
    if (data.next_start != null) action('더 보기', data.next_start);
  } catch (error) {
    status.textContent = error instanceof TypeError ? '서비스에 연결할 수 없습니다.' : error.message;
    action('다시 시도', start);
  }
}
el('compose-space').addEventListener('change', event => {
  const key = event.target.value;
  const root = document.createElement('div');
  el('page-tree').replaceChildren(root);
  el('tree-panel').hidden = !key;
  if (key) loadBranch(root, key);
});
