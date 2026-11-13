const INTERACTIVE_MARKUP = /<script\b|\son[a-z]+\s*=|\bhref\s*=\s*["']javascript:|<(?:button|select|input|textarea)\b|\brole\s*=\s*["']tab["']|\bdata-(?:tab|target|action)\s*=/i;

export function hasInteractivePresetMarkup(value) {
  return INTERACTIVE_MARKUP.test(String(value ?? ""));
}

function splitPresetDocument(value) {
  const source = String(value ?? "").replace(/^\s*<!doctype\s+html[^>]*>/i, "").trim();
  const head = source.match(/<head\b[^>]*>([\s\S]*?)<\/head\s*>/i)?.[1] ?? "";
  const bodyMatch = source.match(/<body\b[^>]*>([\s\S]*?)<\/body\s*>/i);
  const body = bodyMatch
    ? bodyMatch[1]
    : source
        .replace(/<head\b[^>]*>[\s\S]*?<\/head\s*>/gi, "")
        .replace(/<\/?html\b[^>]*>/gi, "")
        .replace(/<\/?body\b[^>]*>/gi, "")
        .trim();
  return { head, body };
}

const SANDBOX_RUNTIME = String.raw`<script data-lunemir-sandbox-runtime>
(() => {
  const TAB_CONTROL = '[role="tab"],[data-tab],[data-target],[aria-controls],a[href^="#"],.tab,.tab-btn,.tab-button,.nav-item';
  const TAB_PANEL = '[role="tabpanel"],[data-tab-panel],.tab-content,.tab-pane,.panel-content,.tab-panel';
  const OPTION_CONTROL = '[data-text],[data-option],.option-card,.option-item-v2,.option-item,.action-option,.choice-option';

  const send = (type, detail = {}) => parent.postMessage({ type, ...detail }, '*');
  let resizeFrame = 0;
  const sendSize = () => {
    const root = document.documentElement;
    const body = document.body;
    const height = Math.max(root.scrollHeight, root.offsetHeight, body ? body.scrollHeight : 0, body ? body.offsetHeight : 0);
    send('lunemir-preset-height', { height });
  };
  const scheduleSize = () => {
    if (resizeFrame) return;
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      sendSize();
    });
  };

  const findTarget = (control, component, panels, controls) => {
    const href = control.getAttribute('href') || '';
    const key = control.dataset.target || control.getAttribute('aria-controls') || control.dataset.tab || (href.startsWith('#') ? href.slice(1) : '');
    if (key) {
      const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(key.replace(/^#/, '')) : key.replace(/[^a-zA-Z0-9_-]/g, '');
      const byId = escaped ? component.querySelector('#' + escaped) || document.getElementById(key.replace(/^#/, '')) : null;
      const byData = panels.find((panel) => panel.dataset.tabPanel === key || panel.dataset.tab === key || panel.id === key.replace(/^#/, ''));
      if (byId || byData) return byId || byData;
    }
    const index = controls.indexOf(control);
    return index >= 0 && panels[index] ? panels[index] : null;
  };

  const activateDeclarativeTab = (control) => {
    if (!(control instanceof Element) || !control.matches(TAB_CONTROL)) return false;
    const tabList = control.closest('[role="tablist"],[data-tabs],.tabs,.tab-bar,.nav-tabs,.tab-buttons,.bottom-nav,.terminal-tabs') || control.parentElement;
    if (!tabList) return false;
    const component = tabList.closest('[data-tab-component],.tabs-container,.tab-container,.terminal,.phone,.widget,.card,.panel') || tabList.parentElement || document.body;
    const controls = Array.from(tabList.querySelectorAll(TAB_CONTROL));
    const panels = Array.from(component.querySelectorAll(TAB_PANEL));
    if (controls.length < 2 || panels.length < 2) return false;
    const target = findTarget(control, component, panels, controls);
    if (!target) return false;
    controls.forEach((item) => {
      const active = item === control;
      item.classList.toggle('active', active);
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-selected', String(active));
      if (item.matches('button,[role="tab"]')) item.setAttribute('tabindex', active ? '0' : '-1');
    });
    panels.forEach((panel) => {
      const active = panel === target;
      panel.classList.toggle('active', active);
      panel.classList.toggle('is-active', active);
      panel.hidden = !active;
      panel.setAttribute('aria-hidden', String(!active));
    });
    return true;
  };

  const initializeTabs = () => {
    document.querySelectorAll('[role="tablist"],[data-tabs],.tabs,.tab-bar,.nav-tabs,.tab-buttons,.bottom-nav,.terminal-tabs').forEach((tabList) => {
      const controls = Array.from(tabList.querySelectorAll(TAB_CONTROL));
      if (controls.length < 2) return;
      const selected = controls.find((item) => item.classList.contains('active') || item.classList.contains('is-active') || item.getAttribute('aria-selected') === 'true') || controls[0];
      activateDeclarativeTab(selected);
    });
  };

  const removeStaleLoadingPlaceholders = () => {
    const loading = /^(?:(?:正在|正为你)(?:渲染|加载|读取|生成|整理)(?:回忆|记忆|内容|组件|状态|面板|数据)?(?:中)?|(?:rendering|loading|generating)(?:\s+(?:memories|memory|content|widget|status|data))?)[\s.…·!！]*$/i;
    const stale = Array.from(document.body.querySelectorAll('div,p,span,section,article,li')).filter((node) => {
      if (node.children.length > 0) return false;
      return loading.test((node.textContent || '').replace(/\s+/g, ' ').trim());
    });
    stale.forEach((node) => node.remove());
    if (stale.length > 0) send('lunemir-preset-error', { message: '模板只返回了加载占位，没有提供可渲染的状态栏或小剧场内容。' });
    scheduleSize();
  };

  const optionText = (node) => {
    if (!(node instanceof Element)) return '';
    const explicit = node.getAttribute('data-text') || node.getAttribute('data-option') || node.getAttribute('data-value');
    if (explicit) return explicit.replace(/\s+/g, ' ').trim();
    const clone = node.cloneNode(true);
    clone.querySelectorAll('.option-tag-v2,.option-tag,.tag,.badge,.index').forEach((item) => item.remove());
    return (clone.textContent || '').replace(/\s+/g, ' ').trim();
  };

  const sendSelectedOptions = (clicked) => {
    const selected = Array.from(document.querySelectorAll(
      '[data-text].selected,[data-option].selected,.option-card.selected,.option-item-v2.selected-v2,.option-item.selected,.action-option.selected,.choice-option.selected'
    ));
    const candidates = selected.length > 0 ? selected : clicked && clicked.matches(OPTION_CONTROL) ? [clicked] : [];
    const values = Array.from(new Set(candidates.map(optionText).filter(Boolean)));
    const text = values.join(' ').slice(0, 4000);
    if (text) send('lunemir-preset-action', { text });
  };

  addEventListener('load', () => { initializeTabs(); scheduleSize(); });
  addEventListener('resize', scheduleSize);
  addEventListener('error', (event) => send('lunemir-preset-error', { message: String(event.message || '交互脚本运行失败').slice(0, 240) }));
  addEventListener('unhandledrejection', (event) => send('lunemir-preset-error', { message: String(event.reason || '交互脚本运行失败').slice(0, 240) }));
  document.addEventListener('click', (event) => {
    const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
    const href = anchor ? anchor.getAttribute('href') || '' : '';
    if (href && !href.startsWith('#') && !href.toLowerCase().startsWith('javascript:')) event.preventDefault();
    const control = event.target instanceof Element ? event.target.closest(TAB_CONTROL) : null;
    const option = event.target instanceof Element ? event.target.closest(OPTION_CONTROL) : null;
    setTimeout(() => {
      if (control) activateDeclarativeTab(control);
      if (option) sendSelectedOptions(option);
      scheduleSize();
    }, 0);
  }, true);
  new MutationObserver(scheduleSize).observe(document.documentElement, { childList: true, subtree: true, attributes: true });
  if ('ResizeObserver' in window) new ResizeObserver(scheduleSize).observe(document.documentElement);
  requestAnimationFrame(() => { initializeTabs(); scheduleSize(); });
  setTimeout(scheduleSize, 80);
  setTimeout(removeStaleLoadingPlaceholders, 900);
})();
</script>`;

export function buildPresetSandboxDocument(content) {
  const { head, body } = splitPresetDocument(content);
  return `<!doctype html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; media-src data: blob:; font-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'; form-action 'none'; base-uri 'none'; navigate-to 'none';">
<style>html,body{margin:0;min-width:0;background:transparent;color:#f1edf8;overflow:hidden}*{box-sizing:border-box;max-width:100%}[hidden]{display:none!important}body{font-family:Inter,'Noto Sans SC',system-ui,sans-serif}</style>
${head}
</head><body>
${body}
${SANDBOX_RUNTIME}
</body></html>`;
}
