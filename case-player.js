'use strict';

function mountCaseReplay({applyFrame, showPath}) {
  const element = id => document.getElementById(id);
  const list = element('case-list');
  const input = element('case-file');
  const playButton = element('play');
  const rewindButton = element('rewind');
  const slider = element('case-progress');
  const percentage = element('progress-value');
  const stage = element('branch-stage');
  const warning = element('case-warning');
  const marks = element('stage-marks');
  const violationTrack = element('violation-track');
  const violationMarker = element('violation-marker');
  const violationPercent = new Intl.NumberFormat('zh-CN', {style: 'percent', maximumFractionDigits: 6});
  const message = element('file-message');
  const branchFilter = element('branch-filter');
  const typeCodes = new Map();
  const selectedTypes = new Set();

  let activeButton = null;
  let importedCases = [];
  let importedEntry = null;
  let mode = null;
  let selected = null;
  let plan = null;
  let progress = 0;
  let animation = null;
  let lastTime = 0;
  let loadSequence = 0;
  const playbackMs = 20000;

  function pause() {
    if (animation !== null) cancelAnimationFrame(animation);
    animation = null;
    playButton.textContent = '播放退针';
  }

  function renderFrame(restart = false) {
    const q = plan ? plan.at(progress) : selected?.q;
    applyFrame(q, selected?.center, progress, restart);
    slider.value = String(progress);
    percentage.textContent = Math.floor(progress * 1000) / 10 + '%';
    stage.textContent = plan ? stageAt(plan.branch, progress) : '';
  }

  function seek(next) {
    if (!plan) return;
    pause();
    progress = next;
    renderFrame();
  }

  function tick(now) {
    const elapsed = Math.max(0, Math.min(100, now - lastTime));
    lastTime = now;
    progress = Math.min(1, progress + elapsed / playbackMs);
    renderFrame();
    if (progress === 1) pause();
    else animation = requestAnimationFrame(tick);
  }

  function togglePlayback() {
    if (!plan) return;
    if (animation !== null) {
      pause();
      return;
    }
    if (progress === 1) {
      progress = 0;
      renderFrame();
    }
    lastTime = performance.now();
    playButton.textContent = '暂停';
    animation = requestAnimationFrame(tick);
  }

  function caseIssue(entry) {
    if (!entry.computedBranch) return `当前页面无法回放算法 ${entry.algorithm}。`;
    if (entry.branch !== null && entry.branch !== entry.computedBranch) {
      return `CSV 标记为 ${entry.branch} 分支，按电机初态计算得到 ${entry.computedBranch} 分支。请核对 CSV。`;
    }
    return '';
  }

  function renderViolation(violation) {
    violationTrack.hidden = !violation;
    violationMarker.disabled = !violation || !plan;
    if (!violation) return;

    const percent = violationPercent.format(violation.u);
    violationMarker.style.setProperty('--mark', violation.u * 100 + '%');
    violationMarker.setAttribute('aria-label', '跳转到 ' + percent + ' 违规点');
    violationMarker.title = 'CSV 违规点 · ' + percent;
  }

  function loadInitialState(entry, restart = true) {
    pause();
    selected = entry;
    const issue = entry ? caseIssue(entry) : '';
    plan = entry && !issue ? makePlan(entry.q) : null;
    progress = 0;

    element('selected-case').textContent = entry?.id ?? (mode === 'manual' ? '手动初态' : '未选择案例');
    element('algorithm-name').textContent = entry?.algorithm ?? '—';
    element('computed-branch').textContent = entry?.computedBranch ?? '—';
    warning.textContent = issue;
    warning.hidden = !issue;
    for (const control of [playButton, rewindButton, slider]) control.disabled = !plan;

    const breakpoints = plan ? branchBreakpoints(plan.branch) : [];
    marks.replaceChildren(...breakpoints.map(at => {
      const mark = document.createElement('span');
      mark.style.setProperty('--mark', at * 100 + '%');
      return mark;
    }));
    const violation = entry?.violation;
    renderViolation(violation);
    renderFrame(restart);
    showPath(plan, violation ? [...breakpoints, violation.u] : breakpoints);
  }

  function selectCase(entry, button) {
    activeButton?.setAttribute('aria-pressed', 'false');
    button?.setAttribute('aria-pressed', 'true');
    activeButton = button;
    importedEntry = entry;
    if (mode === 'cases') loadInitialState(importedEntry);
  }

  function renderCaseList() {
    const branch = branchFilter.value;
    const cases = importedCases.filter(entry =>
      (!branch || (entry.branch ?? entry.computedBranch) === branch) &&
      (!selectedTypes.size || entry.violationTypes.some(type => selectedTypes.has(type)))
    );
    const next = cases.includes(importedEntry) ? importedEntry : cases[0] ?? null;
    let nextButton = null;
    const fragment = document.createDocumentFragment();
    for (const entry of cases) {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'case-option';
      button.dataset.caseId = entry.id;
      button.setAttribute('aria-pressed', String(entry === next));
      const identity = document.createElement('span');
      identity.className = 'case-identity';
      const id = document.createElement('span');
      id.className = 'case-id';
      id.textContent = entry.id;
      identity.append(id);
      const codes = entry.violationTypes.map(type => typeCodes.get(type)).sort((a, b) => a - b);
      if (codes.length) {
        const types = document.createElement('span');
        types.className = 'case-codes';
        types.textContent = codes.join(' · ');
        identity.append(types);
      }
      const branch = document.createElement('span');
      branch.className = 'case-branch';
      branch.textContent = entry.branch ?? '—';
      const issue = caseIssue(entry);
      const fileBranch = entry.branch === null ? 'CSV 未提供分支' : `CSV 分支 ${entry.branch}`;
      const typeLabel = codes.length ? `，违规类型 ${codes.join('、')}` : '';
      button.setAttribute('aria-label', `${entry.id}，${fileBranch}${typeLabel}${issue ? '。' + issue : ''}`);
      if (issue) {
        branch.classList.add('case-issue');
        branch.textContent += ' !';
      }
      button.append(identity, branch);
      button.addEventListener('click', () => selectCase(entry, button));
      item.append(button);
      fragment.append(item);
      if (entry === next) nextButton = button;
    }
    list.replaceChildren(fragment);
    list.scrollTop = 0;
    element('case-list-heading').hidden = cases.length === 0;
    element('case-empty').hidden = !importedCases.length || cases.length > 0;
    element('case-count').textContent = cases.length === importedCases.length ?
      cases.length + ' 例' : `${cases.length} / ${importedCases.length} 例`;
    const selectionCount = selectedTypes.size ? ` · 已选 ${selectedTypes.size}` : '';
    element('type-filter-summary').textContent = `违规类型 · ${typeCodes.size} 种${selectionCount}`;
    if (next === importedEntry) activeButton = nextButton;
    else selectCase(next, nextButton);
  }

  function loadCases(cases) {
    importedCases = cases;
    selectedTypes.clear();
    typeCodes.clear();
    branchFilter.value = '';
    for (const entry of cases) {
      for (const type of entry.violationTypes) {
        if (!typeCodes.has(type)) typeCodes.set(type, typeCodes.size + 1);
      }
    }
    const options = document.createDocumentFragment();
    for (const [type, code] of typeCodes) {
      const label = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = String(code);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) selectedTypes.add(type);
        else selectedTypes.delete(type);
        renderCaseList();
      });
      const text = document.createElement('span');
      text.textContent = `${code}：${type}`;
      label.append(checkbox, text);
      options.append(label);
    }
    if (!typeCodes.size) {
      const empty = document.createElement('p');
      empty.textContent = 'CSV 未提供违规类型。';
      options.append(empty);
    }
    element('type-filter-options').replaceChildren(options);
    element('case-filters').hidden = cases.length === 0;
    renderCaseList();
  }

  function status(text, isError = false) {
    message.setAttribute('role', isError ? 'alert' : 'status');
    message.classList.toggle('is-error', isError);
    message.textContent = text;
    message.hidden = !text;
  }

  const readManualState = mountManualInput(() => {
    if (mode === 'manual') loadInitialState(readManualState(), false);
  });
  const tabs = document.querySelectorAll('.mode-nav a');

  function syncMode() {
    const next = location.hash === '#manual' ? 'manual' : 'cases';
    if (mode === next) return;
    mode = next;
    for (const tab of tabs) {
      if (tab.hash === '#' + mode) tab.setAttribute('aria-current', 'page');
      else tab.removeAttribute('aria-current');
    }
    const manual = mode === 'manual';
    element('manual-panel').hidden = !manual;
    element('cases-panel').hidden = manual;
    element('scene-prompt').textContent = manual ? '请输入有效的初态与球心' : '导入 CSV 后查看退针轨迹';
    loadInitialState(manual ? readManualState() : importedEntry);
  }

  element('import-file').addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    const file = input.files[0];
    input.value = '';
    if (!file) return;
    const sequence = ++loadSequence;
    status('正在读取 CSV…');
    try {
      if (file.size > 16 * 1024 * 1024) throw new Error('文件超过 16 MB，请拆分后导入');
      const text = await file.text();
      if (sequence !== loadSequence) return;
      const cases = parseCases(text);
      loadCases(cases);
      element('file-name').textContent = file.name;
      element('file-name').hidden = false;
      status(cases.length ? '' : 'CSV 只有表头，当前没有案例。');
    } catch (error) {
      if (sequence === loadSequence) status('导入失败。' + error.message, true);
    }
  });
  playButton.addEventListener('click', togglePlayback);
  rewindButton.addEventListener('click', () => seek(0));
  slider.addEventListener('input', () => seek(slider.valueAsNumber));
  branchFilter.addEventListener('change', renderCaseList);
  violationMarker.addEventListener('click', () => seek(selected.violation.u));
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  window.addEventListener('hashchange', syncMode);
  const example = readManualState();
  loadCases([{...example, id: '示例案例', branch: example.computedBranch, violation: null, violationTypes: []}]);
  status('当前为内置示例，导入 CSV 后将显示文件中的案例。');
  syncMode();
  return renderFrame;
}
