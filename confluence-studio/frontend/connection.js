import { setupTemplates } from './templates.js';

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
  document.title = connected ? '페이지 작성 · Confluence Studio' : '계정 연결 · Confluence Studio';
  field.value = '';
  reveal(false);
  if (el('space-dialog').open) el('space-dialog').close();
  templateLibrary.reset(connected ? result.templates || [] : []);
  resetDraft();
  if (connected) {
    showWorkspacePage();
    loadPlatformAccount();
    clearSources();
    spaces = result.spaces || [];
    renderSpaces();
    renderSpacePicker();
    el('space-form').reset();
    el('space-status').textContent = '';
    return;
  }
  form.hidden = !['missing', 'invalid'].includes(state);
  el('retry').hidden = state !== 'error';
  field.setAttribute('aria-invalid', String(state === 'invalid'));
  el('form-title').textContent = ({
    invalid: 'Confluence 계정 다시 연결',
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
window.addEventListener('pagehide', () => { field.value = ''; reveal(false); });
window.addEventListener('pageshow', () => check());

let spaces = [];
function renderSpaces() {
  el('spaces-empty').hidden = spaces.length > 0;
  const list = el('space-list');
  list.tabIndex = spaces.length > 5 ? 0 : -1;
  list.replaceChildren(...spaces.map(space => {
    const item = document.createElement('li');
    const name = document.createElement('strong');
    name.textContent = space.name;
    const key = document.createElement('small');
    key.textContent = space.space_key;
    item.title = space.name + ' (' + space.space_key + ')';
    item.append(name, key);
    return item;
  }));
}
el('space-list').addEventListener('wheel', event => {
  const list = event.currentTarget;
  if (event.ctrlKey || !event.deltaY || list.scrollHeight <= list.clientHeight) return;
  event.preventDefault();
  const rowHeight = list.firstElementChild.offsetHeight;
  list.scrollTop = (Math.round(list.scrollTop / rowHeight) + Math.sign(event.deltaY)) * rowHeight;
}, { passive: false });
function showWorkspacePage() {
  const templates = /^#templates(?:\/|$)/.test(location.hash);
  templateLibrary.navigate(location.hash);
  el('compose-page').hidden = templates;
  el('templates-page').hidden = !templates;
  const active = el(templates ? 'templates-menu' : 'compose-menu');
  el(templates ? 'compose-menu' : 'templates-menu').removeAttribute('aria-current');
  active.setAttribute('aria-current', 'page');
  el('breadcrumb-menu').textContent = active.textContent;
  document.title = active.textContent + ' · Confluence Studio';
}
window.addEventListener('hashchange', () => {
  if (!el('workspace').hidden) showWorkspacePage();
});
el('compose-menu').addEventListener('click', () => {
  if (!el('templates-page').hidden) location.hash = 'compose';
  else el('workspace-title').focus();
});
el('templates-menu').addEventListener('click', () => { location.hash = 'templates'; });
el('create-template').addEventListener('click', () => {
  location.hash = 'templates/new';
  el('templates-menu').focus();
});
el('open-space').addEventListener('click', () => {
  el('space-status').textContent = '';
  el('space-dialog').showModal();
  el('space-key').focus();
});
el('close-space').addEventListener('click', () => el('space-dialog').close());
el('space-dialog').addEventListener('close', () => el('space-form').reset());
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
    const picker = el('compose-space');
    const selected = picker.value;
    renderSpaces();
    renderSpacePicker();
    if (!el('space-dialog').open) {
      picker.value = selected;
      showSelectedSpaceName();
      return;
    }
    picker.value = result.space_key;
    picker.dispatchEvent(new Event('change'));
    el('space-dialog').close();
    picker.focus();
  } catch {
    el('space-status').textContent = '서비스에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.';
  } finally {
    button.disabled = false;
  }
});

function showSelectedSpaceName() {
  const picker = el('compose-space');
  el('selected-space-name').textContent = spaces.find(space => space.space_key === picker.value)?.name
    ?? picker.selectedOptions[0]?.textContent ?? '';
}
function renderSpacePicker() {
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
  showSelectedSpaceName();
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
  showSelectedSpaceName();
  const root = document.createElement('div');
  el('page-tree').replaceChildren(root);
  updatePublish();
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
  { name: 'Word', extensions: ['docx'], recommended: true, note: '문서에 넣은 그림과 스크린샷을 페이지 작성에 활용할 수 있습니다.' },
  { name: 'Markdown', extensions: ['md'], recommended: true, note: '이미지의 설명과 출처 URL을 페이지 작성에 활용합니다.' },
  { name: 'PDF', extensions: ['pdf'], recommended: true, note: 'PDF의 사진과 스크린샷을 페이지 작성에 활용할 수 있습니다.' },
  { name: 'Power Point', extensions: ['pptx'], note: '슬라이드에 넣은 그림과 스크린샷을 페이지 작성에 활용할 수 있습니다.' },
  { name: 'HTML', extensions: ['html', 'htm'], note: '이미지의 설명과 출처 URL을 페이지 작성에 활용합니다. 동적 애니메이션이나 클릭·필터 동작은 Confluence 페이지에 그대로 옮기기 어렵습니다.' },
  { name: 'Excel', extensions: ['xlsx'], note: '시트에 넣은 그림을 페이지 작성에 활용할 수 있습니다. 셀 데이터로 만든 차트는 별도 처리가 필요할 수 있습니다.' },
];
function formatLabel(format) {
  return format.name + ' (.' + format.extensions[0] + ')';
}
let sourceFile = null;
const sourceInput = el('source-input');
sourceInput.accept = sourceFormats.flatMap(format => format.extensions.map(ext => '.' + ext)).join(',');

function showFormat(format) {
  for (const button of el('source-formats').children) {
    button.setAttribute('aria-pressed', String(button.dataset.format === format?.extensions[0]));
  }
  el('source-zone').hidden = !format;
  el('source-warning').hidden = !format;
  el('source-warning').querySelector('p').textContent = format ? formatLabel(format) + ' · ' + format.note : '';
}

function clearSources() {
  sourceFile = null;
  sourceInput.value = '';
  el('source-error').textContent = '';
  el('source-name').textContent = '';
  el('source-files').hidden = true;
  el('source-drop').hidden = false;
  showFormat(null);
}

el('source-remove').addEventListener('click', () => {
  const selected = el('source-formats').querySelector('[aria-pressed="true"]');
  clearSources();
  selected?.focus();
});
el('source-replace').addEventListener('click', () => sourceInput.click());
for (const format of sourceFormats) {
  const button = document.createElement('button');
  button.type = 'button';
  const icon = document.createElement('img');
  icon.className = 'format-icon';
  icon.src = './icons/' + format.extensions[0] + '.svg';
  icon.alt = '';
  const caption = document.createElement('span');
  caption.className = 'format-caption';
  const name = document.createElement('strong');
  name.textContent = format.name;
  const extension = document.createElement('span');
  extension.textContent = '(.' + format.extensions[0] + ')';
  caption.append(name, extension);
  button.append(icon, caption);
  button.setAttribute('aria-controls', 'source-zone source-warning');
  button.title = format.extensions.map(ext => '.' + ext).join(', ') + ' 이미지 활용 안내';
  button.dataset.format = format.extensions[0];
  button.setAttribute('aria-pressed', 'false');
  if (format.recommended) {
    const badge = document.createElement('small');
    badge.textContent = '추천';
    caption.append(badge);
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
  el('source-name').title = sourceFile.name;
  el('source-type').textContent = ext.toUpperCase();
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = file.size;
  let unit = 0;
  while (size >= 1000 && unit < units.length - 1) {
    size /= 1000;
    unit++;
  }
  el('source-meta').textContent = '첨부됨 · ' + size.toLocaleString('ko-KR', { maximumFractionDigits: 1 }) + ' ' + units[unit];
  el('source-remove').setAttribute('aria-label', sourceFile.name + ' 삭제');
  el('source-files').hidden = false;
  el('source-drop').hidden = true;
  el('source-error').textContent = '';
  showFormat(format);
}
sourceInput.addEventListener('change', () => {
  attachSource(sourceInput.files);
  sourceInput.value = '';
});
const drop = el('source-zone');
el('source-drop').addEventListener('click', () => sourceInput.click());
drop.addEventListener('dragover', event => { event.preventDefault(); drop.classList.add('dragging'); });
drop.addEventListener('dragleave', () => drop.classList.remove('dragging'));
drop.addEventListener('drop', event => {
  event.preventDefault();
  drop.classList.remove('dragging');
  attachSource(event.dataTransfer.files);
});

let generation = null;
let rendering = null;
let draftImages = new Map();
let draftStorage = '';
let publishing = null;
let published = false;
let revision = null;
let chatHistory = [];
function showStep(step) {
  el('compose-setup').hidden = step !== 1;
  el('compose-review').hidden = step !== 2;
  el('compose-publish').hidden = step !== 3;
  const steps = ['step-one', 'step-two', 'step-three'];
  steps.forEach((id, index) => {
    const button = el(id);
    button.classList.toggle('step-complete', index + 1 < step);
    if (index + 1 === step) button.setAttribute('aria-current', 'step');
    else button.removeAttribute('aria-current');
  });
  if (step === 3) {
    if (!published) {
      el('publish-title').textContent = el('draft-title').value.trim();
      el('publish-space').textContent = el('selected-space-name').textContent;
      el('publish-parent').textContent = document.querySelector('[name="parent-page"]:checked')?.labels[0]?.textContent || '';
    }
    el('publish-heading').focus();
  }
}
el('step-one').addEventListener('click', () => showStep(1));
el('step-two').addEventListener('click', () => showStep(2));
el('step-three').addEventListener('click', () => showStep(3));
el('review-next').addEventListener('click', () => showStep(3));
el('back-to-review').addEventListener('click', () => showStep(2));
function updatePublish() {
  const hasParent = !!document.querySelector('[name="parent-page"]:checked');
  const busy = !!(publishing || generation || revision);
  el('step-one').disabled = busy;
  el('step-two').disabled = busy || !draftStorage || !hasParent;
  const canConfirm = !busy && draftStorage && hasParent && el('draft-title').value.trim();
  el('step-three').disabled = !canConfirm;
  el('review-next').disabled = !canConfirm;
  el('back-to-review').disabled = busy;
  el('compose-setup').disabled = busy;
  el('generate-draft').disabled = busy || (el('template-mode').checked && !el('draft-template').value);
  el('draft-title').disabled = busy || published;
  el('chat-message').disabled = busy || published;
  el('chat-send').disabled = busy || published || !el('chat-message').value.trim();
  const button = el('publish-draft');
  button.disabled = !canConfirm || published;
  button.title = !hasParent ? '작성할 상위 페이지를 선택하세요.' : '';
}
function syncWritingMode() {
  el('template-field').hidden = !el('template-mode').checked;
  const picker = el('draft-template');
  const hasTemplates = Array.from(picker.options).some(option => option.value);
  picker.disabled = !hasTemplates;
  el('template-picker').hidden = !hasTemplates;
  el('template-empty').hidden = hasTemplates;
  const enabled = el('use-prompt').checked;
  el('draft-request').hidden = !enabled;
  el('draft-request').disabled = !enabled;
  updatePublish();
}
el('draft-template').addEventListener('change', updatePublish);
document.querySelector('.writing-modes').addEventListener('change', syncWritingMode);

function resetChat() {
  chatHistory = [];
  el('chat-log').replaceChildren();
  el('chat-message').value = '';
  el('chat-status').textContent = '';
}
function resetDraft() {
  revision?.abort();
  revision = null;
  resetChat();
  showStep(1);
  el('compose-space').replaceChildren();
  el('tree-panel').hidden = true;
  el('page-tree').replaceChildren();
  el('free-mode').checked = true;
  syncWritingMode();
  publishing = null;
  published = false;
  draftStorage = '';
  el('publish-status').replaceChildren();
  generation?.abort();
  rendering?.abort();
  generation = rendering = null;
  draftImages.clear();
  for (const id of ['draft-request', 'draft-title']) el(id).value = '';
  el('draft-status').textContent = '';
  el('preview-status').textContent = '초안을 생성하면 문서가 여기에 표시됩니다.';
  el('view-content').replaceChildren();
  el('draft-view').hidden = true;
  updatePublish();
}
function filePayload(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('첨부 자료를 읽을 수 없습니다.'));
    reader.onload = () => resolve({ name: file.name, data: reader.result.split(',')[1] });
    reader.readAsDataURL(file);
  });
}
async function draftPost(path, body, signal) {
  const response = await fetch('./api/draft' + path, {
    method: 'POST', signal, headers: { 'Content-Type': 'application/json', 'X-Studio-Request': '1' },
    body: JSON.stringify(body),
  });
  if (response.status === 401) { goToLogin(); throw new Error('플랫폼 로그인이 필요합니다.'); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.detail) throw new Error(data.detail || '요청을 처리하지 못했습니다. 다시 시도해 주세요.');
  return data;
}
async function previewDraft(storage = draftStorage, images = draftImages) {
  rendering?.abort();
  const request = new AbortController();
  rendering = request;
  el('draft-view').hidden = true;
  el('preview-status').textContent = 'Confluence에서 미리보기를 불러오는 중입니다.';
  try {
    const result = await draftPost('/preview', {
      storage, image_names: [...images.keys()], parent_id: document.querySelector('[name="parent-page"]:checked')?.value || null,
    }, request.signal);
    if (request.signal.aborted) return;
    draftStorage = result.storage || storage;
    draftImages = images;
    for (const image of result.formulas || []) draftImages.set(image.name, image);
    for (const name of draftImages.keys()) {
      if (name.startsWith('math-') && !draftStorage.includes(name)) draftImages.delete(name);
    }
    // The server removes active content and all external references before returning rendered HTML.
    el('view-content').innerHTML = result.view;
    for (const slot of el('view-content').querySelectorAll('[data-studio-image]')) {
      const image = draftImages.get(slot.dataset.studioImage);
      if (!image) continue;
      const img = document.createElement('img');
      img.alt = image.latex || (image.locations || []).join(', ') + ' 이미지';
      if (image.latex) img.title = image.latex;
      img.src = 'data:image/' + (image.name.endsWith('.jpg') ? 'jpeg' : 'png') + ';base64,' + image.data;
      slot.replaceWith(img);
    }
    el('draft-view').hidden = false;
    el('preview-status').textContent = '';
    return true;
  } catch (error) {
    if (!request.signal.aborted) {
      el('preview-status').textContent = error.message;
      el('draft-view').hidden = !el('view-content').childElementCount;
    }
    return false;
  }
}
el('generate-draft').addEventListener('click', async () => {
  const instructions = el('use-prompt').checked ? el('draft-request').value.trim() : '';
  const file = sourceFile;
  if (!document.querySelector('[name="parent-page"]:checked')) {
    el('draft-status').textContent = '스페이스와 상위 페이지를 선택해 주세요.';
    return;
  }
  const templateId = el('template-mode').checked ? el('draft-template').value : null;
  if (!instructions && !file && !templateId) { el('draft-status').textContent = '자료를 첨부하거나 작성 방식 프롬프트를 입력해 주세요.'; return; }
  if (file && file.size > 8 * 1024 * 1024) { el('draft-status').textContent = '8 MB 이하의 문서를 첨부해 주세요.'; return; }
  const request = new AbortController();
  generation = request;
  updatePublish();
  el('draft-status').textContent = '초안을 작성하고 있습니다.';
  try {
    const source = file ? await filePayload(file) : null;
    const draft = await draftPost('', { instructions, source, template_id: templateId }, request.signal);
    if (request.signal.aborted) return;
    draftImages = new Map((draft.images || []).map(image => [image.name, image]));
    el('draft-title').value = draft.title.slice(0, 255);
    draftStorage = draft.storage;
    published = false;
    resetChat();
    el('publish-status').replaceChildren();
    el('view-content').replaceChildren();
    showStep(2);
    el('draft-status').textContent = '초안을 작성했습니다.';
    await previewDraft();
  } catch (error) {
    if (!request.signal.aborted) {
      el('draft-status').textContent = error.message;
      el('preview-status').textContent = '';
    }
  } finally {
    if (generation === request) {
      generation = null;
      updatePublish();
    }
  }
});
function chatBubble(text, user = false) {
  const entry = document.createElement('p');
  entry.className = user ? 'chat-user' : 'chat-agent';
  entry.textContent = text;
  el('chat-log').append(entry);
  entry.scrollIntoView({ block: 'nearest' });
  return entry;
}
el('chat-message').addEventListener('input', updatePublish);
el('chat-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (el('chat-send').disabled) return;
  const message = el('chat-message').value.trim();
  const request = new AbortController();
  revision = request;
  const entry = chatBubble(message, true);
  el('chat-message').value = '';
  el('chat-status').textContent = '초안을 수정하고 있습니다.';
  updatePublish();
  try {
    const result = await draftPost('/revise', {
      message, history: chatHistory.slice(-10), title: el('draft-title').value, storage: draftStorage,
      image_names: [...draftImages.keys()],
    }, request.signal);
    if (request.signal.aborted) return;
    const assets = new Map(draftImages);
    for (const image of result.formulas) assets.set(image.name, image);
    const used = new Map(result.image_names.map(name => [name, assets.get(name)]));
    if (!await previewDraft(result.storage, used)) throw new Error('수정된 문서를 표시하지 못했습니다. 다시 보내 주세요.');
    if (request.signal.aborted) return;
    el('draft-title').value = result.title;
    chatHistory.push({ message, reply: result.reply.slice(0, 4000) });
    chatBubble(result.reply);
    el('chat-status').textContent = '';
  } catch (error) {
    if (!request.signal.aborted) {
      entry.remove();
      el('chat-message').value = message;
      el('chat-status').textContent = error.message;
    }
  } finally {
    if (revision === request) {
      revision = null;
      updatePublish();
      el('chat-message').focus();
    }
  }
});
el('page-tree').addEventListener('change', updatePublish);
el('draft-title').addEventListener('input', updatePublish);
el('publish-draft').addEventListener('click', async () => {
  if (el('compose-publish').hidden || el('publish-draft').disabled) return;
  const request = new AbortController();
  publishing = request;
  updatePublish();
  el('publish-status').textContent = 'Confluence에 페이지를 작성하고 있습니다.';
  try {
    const result = await draftPost('/publish', {
      title: el('draft-title').value.trim(), storage: draftStorage,
      space_key: el('compose-space').value,
      parent_id: document.querySelector('[name="parent-page"]:checked').value,
      images: [...draftImages.values()].map(({ name, data }) => ({ name, data })),
    }, request.signal);
    if (publishing !== request) return;
    published = true;
    const link = document.createElement('a');
    link.href = result.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = '작성한 페이지 열기';
    el('publish-status').replaceChildren(result.warning || '페이지를 작성했습니다.', ' ', link);
  } catch (error) {
    if (publishing === request) el('publish-status').textContent = error.message;
  } finally {
    if (publishing === request) {
      publishing = null;
      updatePublish();
    }
  }
});

const templateLibrary = setupTemplates(el, syncWritingMode, goToLogin);
