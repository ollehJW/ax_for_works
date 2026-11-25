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
    loadPlatformAccount();
    clearSources();
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
      goToLogin();
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
  const menu = el(active ? 'compose-menu' : 'spaces-menu').textContent;
  el('workspace-title').textContent = menu;
  el('breadcrumb-menu').textContent = menu;
  document.title = menu + ' · Confluence Studio';
  el('registration-card').hidden = active;
  el('account-card').hidden = active;
  el('compose-columns').hidden = !active;
  el('tree-panel').hidden = true;
  el('page-tree').replaceChildren();
  if (active) {
    el('compose-space').replaceChildren(
      new Option(spaces.length ? '스페이스를 선택하세요' : '먼저 스페이스를 등록하세요', ''),
      ...spaces.map(space => {
        const option = new Option('', space.space_key);
        const key = document.createElement('small');
        key.textContent = space.space_key;
        option.append(document.createTextNode(space.name + ' '), key);
        return option;
      }),
    );
    el('compose-space').disabled = !spaces.length;
  }
}

function pageNode(page, spaceKey) {
  const node = document.createElement('div');
  node.className = 'page-node';
  const row = document.createElement('div');
  row.className = 'page-row';
  const label = document.createElement('label');
  const radio = document.createElement('input');
  radio.type = 'radio';
  radio.name = 'parent-page';
  radio.value = page.id;
  label.append(document.createTextNode(page.title), radio);
  row.append(label);
  node.append(row);
  if (page.has_children === false) {
    row.classList.add('tree-leaf');
    return node;
  }
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'tree-toggle';
  toggle.setAttribute('aria-label', page.title + ' 하위 페이지');
  toggle.setAttribute('aria-expanded', 'false');
  const children = document.createElement('div');
  children.className = 'page-children';
  children.hidden = true;
  row.prepend(toggle);
  node.append(children);
  toggle.addEventListener('click', () => {
    children.hidden = !children.hidden;
    toggle.setAttribute('aria-expanded', String(!children.hidden));
    if (!children.hidden && !children.childElementCount) loadBranch(children, spaceKey, page.id);
  });
  return node;
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
      const row = container.previousElementSibling;
      const toggle = row.querySelector('.tree-toggle');
      if (document.activeElement === toggle) row.querySelector('input').focus();
      toggle.remove();
      row.classList.add('tree-leaf');
      container.remove();
      return;
    }
    if (data.pages.length || start) status.remove();
    else status.textContent = '표시할 페이지가 없습니다.';
    for (const page of data.pages) container.append(pageNode(page, spaceKey));
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

function goToLogin() {
  window.location.replace(window.location.pathname.startsWith('/confluencestudio/')
    ? '/login?next=%2Fconfluencestudio%2F' : '/login');
}

async function loadPlatformAccount() {
  const name = el('account-name');
  const team = el('account-team');
  name.textContent = '계정 확인 중';
  team.textContent = '';
  try {
    const response = await fetch('/api/auth/me', { cache: 'no-store' });
    if (response.status === 401) return goToLogin();
    if (!response.ok) throw new Error();
    const user = await response.json();
    name.textContent = name.title = user.full_name || '사용자';
    team.textContent = team.title = user.team_name && user.team_name !== '미지정' ? user.team_name : '소속 팀 미지정';
  } catch {
    name.textContent = '계정 정보를 불러오지 못했습니다.';
  }
}

el('logout').addEventListener('click', async () => {
  el('logout').disabled = true;
  el('logout-status').textContent = '';
  try {
    const response = await fetch('/api/auth/logout', {
      method: 'POST', headers: { 'X-AX-Request': '1', 'Content-Type': 'application/json' }, body: '{}',
    });
    if (!response.ok && response.status !== 401) throw new Error();
    goToLogin();
  } catch {
    el('logout-status').textContent = '로그아웃하지 못했습니다. 다시 시도해 주세요.';
    el('logout').disabled = false;
  }
});

const sourceFormats = [
  { label: 'Word (.docx)', extensions: ['docx'], recommended: true, note: '문서에 넣은 그림과 스크린샷을 페이지 작성에 활용할 수 있습니다.' },
  { label: 'Markdown (.md)', extensions: ['md'], recommended: true, note: '페이지 작성에는 접근 가능한 URL로 연결된 이미지만 활용할 수 있습니다.' },
  { label: 'PDF (.pdf)', extensions: ['pdf'], recommended: true, note: 'PDF의 사진과 스크린샷을 페이지 작성에 활용할 수 있습니다.' },
  { label: 'Power Point (.pptx)', extensions: ['pptx'], note: '슬라이드에 넣은 그림과 스크린샷을 페이지 작성에 활용할 수 있습니다.' },
  { label: 'HTML (.html)', extensions: ['html', 'htm'], note: '페이지 작성에는 접근 가능한 URL로 연결된 이미지만 활용할 수 있습니다. 동적 애니메이션이나 클릭·필터 동작은 Confluence 페이지에 그대로 옮기기 어렵습니다.' },
  { label: 'Excel (.xlsx)', extensions: ['xlsx'], note: '시트에 넣은 그림을 페이지 작성에 활용할 수 있습니다. 셀 데이터로 만든 차트는 별도 처리가 필요할 수 있습니다.' },
];
let sourceFile = null;
const sourceInput = el('source-input');
sourceInput.accept = sourceFormats.flatMap(format => format.extensions.map(ext => '.' + ext)).join(',');

function showFormat(format) {
  for (const button of el('source-formats').children) {
    button.setAttribute('aria-pressed', String(button.dataset.format === format?.label));
  }
  el('source-warning').hidden = !format;
  el('source-warning').querySelector('p').textContent = format ? format.label + ' · ' + format.note : '';
}

function clearSources() {
  sourceFile = null;
  sourceInput.value = '';
  el('source-error').textContent = '';
  el('source-name').textContent = '';
  el('source-files').hidden = true;
  el('source-drop').querySelector('strong').textContent = '파일 추가';
  showFormat(null);
}

el('source-remove').addEventListener('click', clearSources);
for (const format of sourceFormats) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = format.label;
  button.title = format.extensions.map(ext => '.' + ext).join(', ') + ' 이미지 활용 안내';
  button.dataset.format = format.label;
  button.setAttribute('aria-pressed', 'false');
  if (format.recommended) {
    const badge = document.createElement('small');
    badge.textContent = '추천';
    button.append(badge);
  }
  button.addEventListener('click', () => showFormat(format));
  el('source-formats').append(button);
}
function attachSource(files) {
  if (!files.length) return;
  if (files.length > 1) {
    el('source-error').textContent = '문서 한 개만 첨부할 수 있습니다.';
    return;
  }
  const file = files[0];
  const ext = /\.([^.]+)$/.exec(file.name)?.[1].toLowerCase();
  const format = sourceFormats.find(item => item.extensions.includes(ext));
  if (!format) {
    el('source-error').textContent = '지원하지 않는 형식 · ' + file.name;
    return;
  }
  sourceFile = file;
  el('source-name').textContent = sourceFile.name;
  el('source-remove').setAttribute('aria-label', sourceFile.name + ' 삭제');
  el('source-files').hidden = false;
  el('source-drop').querySelector('strong').textContent = '파일 교체';
  el('source-error').textContent = '';
  showFormat(format);
}
sourceInput.addEventListener('change', () => {
  attachSource(sourceInput.files);
  sourceInput.value = '';
});
const drop = el('source-drop');
drop.addEventListener('click', () => sourceInput.click());
drop.addEventListener('dragover', event => { event.preventDefault(); drop.classList.add('dragging'); });
drop.addEventListener('dragleave', () => drop.classList.remove('dragging'));
drop.addEventListener('drop', event => {
  event.preventDefault();
  drop.classList.remove('dragging');
  attachSource(event.dataTransfer.files);
});
