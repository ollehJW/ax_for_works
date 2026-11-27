const layoutTags = new Set(['table', 'tr', 'th', 'td', 'ul', 'ol', 'li', 'blockquote']);
const panelNames = { info: '정보', tip: '가이드', warning: '주의', note: '참고', panel: '패널',
  code: '코드', expand: '접기 영역', toc: '목차' };

function drawTemplate(blueprint) {
  // Older templates have section instructions but no source layout snapshot.
  const layout = blueprint.layout || blueprint.sections.flatMap(section => {
    const line = { type: 'line' };
    let body = line;
    if (/표로|표를|표 형식|테이블/.test(section.instruction)) {
      body = { type: 'table', children: ['th', 'td'].map(type => ({
        type: 'tr', children: Array.from({ length: 2 }, () => ({ type, children: [line] })),
      })) };
    } else if (/목록|리스트|글머리/.test(section.instruction)) {
      body = { type: 'ul', children: [1, 2].map(() => ({ type: 'li', children: [line] })) };
    }
    return [{ type: 'heading', level: 2, label: section.heading }, body];
  });
  let headingIndex = 0;
  function block(item) {
    const kind = item.type;
    const node = document.createElement(layoutTags.has(kind) ? kind : 'div');
    node.className = 'sheet-' + kind;
    if (kind === 'heading') {
      node.textContent = item.label || blueprint.sections[headingIndex]?.heading || '섹션 제목';
      node.classList.toggle('subheading', item.level > 2);
      headingIndex++;
    } else if (Object.hasOwn(panelNames, kind)) {
      const label = document.createElement('strong');
      label.textContent = panelNames[kind];
      node.append(label);
    } else if (kind === 'image') {
      node.textContent = '이미지';
    }
    if (kind === 'th' || kind === 'td') {
      node.colSpan = item.colspan || 1;
      node.rowSpan = item.rowspan || 1;
    }
    for (const child of item.children || []) node.append(block(child));
    return node;
  }
  return layout.map(block);
}

export function setupTemplates(el, syncWritingMode, goToLogin) {
  let templates = [];
  let source = null;
  let request = null;
  let currentRoute = null;

  function showBlueprint(item) {
    el('blueprint').hidden = !item;
    if (!item) return;
    const { name, purpose, sections, styles } = item.blueprint;
    el('blueprint-name').textContent = name;
    el('blueprint-purpose').textContent = purpose;
    el('sheet-caption').textContent = item.blueprint.layout ? '양식 미리보기' : '섹션 구성 미리보기';
    el('sheet-body').replaceChildren(...drawTemplate(item.blueprint));
    el('blueprint-details').open = false;
    el('blueprint-sections').replaceChildren(...sections.map(section => {
      const row = document.createElement('li');
      const title = document.createElement('strong');
      title.textContent = section.heading;
      row.append(title, section.instruction);
      return row;
    }));
    el('style-heading').hidden = !styles.length;
    el('blueprint-styles').replaceChildren(...styles.map(style => {
      const row = document.createElement('li');
      row.textContent = style;
      return row;
    }));
  }

  function render(selected) {
    const picker = el('draft-template');
    const previous = picker.value;
    const options = () => templates.map(item => new Option(item.blueprint.name, item.page_id));
    picker.replaceChildren(new Option('템플릿을 선택하세요', ''), ...options());
    picker.value = selected || previous || '';
    el('library-cards').replaceChildren(el('new-template'), ...templates.map(item => {
      const card = document.createElement('button');
      card.type = 'button';
      const name = document.createElement('strong');
      name.textContent = item.blueprint.name;
      const purpose = document.createElement('span');
      purpose.textContent = item.blueprint.purpose;
      card.append(name, purpose);
      card.addEventListener('click', () => { location.hash = 'templates/' + item.page_id; });
      return card;
    }));
    syncWritingMode();
  }

  async function post(path, payload, signal) {
    const response = await fetch('./api/templates/' + path, {
      method: 'POST', signal, headers: { 'Content-Type': 'application/json', 'X-Studio-Request': '1' },
      body: JSON.stringify(payload),
    });
    if (response.status === 401) goToLogin();
    const result = await response.json();
    if (!response.ok || result.detail) throw new Error(result.detail || '요청을 처리하지 못했습니다.');
    return result;
  }

  function clearSource() {
    showBlueprint(null);
    request?.abort();
    request = null;
    source = null;
    el('template-view').replaceChildren();
    el('template-preview').hidden = true;
    el('template-status').textContent = '';
  }

  async function load() {
    clearSource();
    const task = new AbortController();
    request = task;
    el('template-status').textContent = '페이지를 불러오는 중입니다.';
    try {
      const result = await post('preview', { url: el('template-url').value.trim() }, task.signal);
      if (task !== request) return;
      source = result;
      el('template-source-title').textContent = result.title;
      el('template-view').innerHTML = result.view; // Sanitized by the same renderer as draft previews.
      el('template-preview').hidden = false;
      el('extract-template').disabled = false;
      el('template-status').textContent = '';
    } catch (error) {
      if (task === request) el('template-status').textContent = error.message;
    }
  }
  el('template-source-form').addEventListener('submit', event => { event.preventDefault(); load(); });
  el('template-url').addEventListener('input', clearSource);
  el('new-template').addEventListener('click', () => { location.hash = 'templates/new'; });
  el('back-to-library').addEventListener('click', () => { location.hash = 'templates'; });
  el('extract-template').addEventListener('click', async () => {
    if (!source || el('extract-template').disabled) return;
    const task = new AbortController();
    request = task;
    el('extract-template').disabled = true;
    el('template-status').textContent = '문서 구조와 스타일을 추출하고 있습니다.';
    try {
      const item = await post('extract', { page_id: source.page_id, version: source.version }, task.signal);
      if (request !== task) return;
      templates = [item, ...templates.filter(entry => entry.page_id !== item.page_id)];
      render(item.page_id);
      showBlueprint(item);
      el('template-status').textContent = 'My Templates에 저장했습니다. 페이지 작성에서 사용할 수 있습니다.';
    } catch (error) {
      if (request === task) el('template-status').textContent = error.message;
    } finally {
      if (request === task) el('extract-template').disabled = false;
    }
  });
  return {
    navigate(hash) {
      if (currentRoute === hash) return;
      currentRoute = hash;
      clearSource();
      el('template-url').value = '';
      const creating = hash === '#templates/new';
      const item = templates.find(entry => hash === '#templates/' + entry.page_id);
      const working = creating || !!item;
      el('template-library').hidden = working;
      el('template-workbench').hidden = !working;
      el('template-entry').hidden = !creating;
      el('templates-title').textContent = creating ? '신규 템플릿 생성' : '템플릿 관리';
      if (item) showBlueprint(item);
    },
    reset(items) {
      currentRoute = null;
      clearSource();
      el('template-url').value = '';
      templates = items;
      render();
    },
  };
}
