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
  let timer;

  function showBlueprint() {
    const item = templates.find(entry => entry.page_id === el('library-picker').value);
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
    el('library-picker').replaceChildren(...options());
    if (selected) el('library-picker').value = selected;
    el('library-picker').hidden = !templates.length;
    el('library-empty').hidden = !!templates.length;
    showBlueprint();
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
    clearTimeout(timer);
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
  el('template-url').addEventListener('input', () => {
    clearSource();
    if (el('template-url').value && el('template-url').validity.valid) timer = setTimeout(load, 650);
  });
  el('library-picker').addEventListener('change', showBlueprint);
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
      el('template-status').textContent = '내 템플릿에 저장했습니다. 페이지 작성에서 사용할 수 있습니다.';
    } catch (error) {
      if (request === task) el('template-status').textContent = error.message;
    } finally {
      if (request === task) el('extract-template').disabled = false;
    }
  });
  return {
    reset(items) {
      clearSource();
      el('template-url').value = '';
      templates = items;
      render();
    },
  };
}
