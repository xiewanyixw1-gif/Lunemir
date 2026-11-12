"use client";

import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { createOutputRegexRule, normalizeOutputRenderer } from "../../lib/lunemir/output-renderer";
import { analyzePromptModules, createPromptModule } from "../../lib/lunemir/preset";
import type { OutputRegexRule, OutputRendererConfig, PresetEditorValues, PresetRecord, PromptModule } from "../../lib/lunemir/types";
import { SafeMessageContent } from "./SafeMessageContent";

type Props = {
  preset?: PresetRecord;
  onClose: () => void;
  onSave: (values: PresetEditorValues) => Promise<void> | void;
  onDuplicate?: () => Promise<void> | void;
  onExport?: () => void;
  onDelete?: () => Promise<void> | void;
};

function initialModules(preset?: PresetRecord) {
  if (preset?.modules) return preset.modules.map((module) => ({ ...module }));
  const legacy: PromptModule[] = [];
  if (preset?.systemPrompt) legacy.push({ ...createPromptModule(legacy.length), name: "System Prompt", content: preset.systemPrompt });
  if (preset?.postHistoryInstructions) legacy.push({ ...createPromptModule(legacy.length), name: "Post-History Instructions", content: preset.postHistoryInstructions, position: "post_history" });
  return legacy.length ? legacy : [createPromptModule(0)];
}

export function PresetEditorModal({ preset, onClose, onSave, onDuplicate, onExport, onDelete }: Props) {
  const startingModules = useMemo(() => initialModules(preset), [preset]);
  const [name, setName] = useState(preset?.name ?? "");
  const [modules, setModules] = useState(startingModules);
  const [activeModuleId, setActiveModuleId] = useState(startingModules[0]?.id ?? "");
  const [temperature, setTemperature] = useState(preset?.modelPatch.temperature?.toString() ?? "");
  const [maxTokens, setMaxTokens] = useState(preset?.modelPatch.maxTokens?.toString() ?? "");
  const [contextLimit, setContextLimit] = useState(preset?.modelPatch.contextLimit?.toString() ?? "");
  const [outputRenderer, setOutputRenderer] = useState(() => normalizeOutputRenderer(preset?.outputRenderer));
  const [rendererPreview, setRendererPreview] = useState("<style>\n.moon-status{display:grid;gap:8px;border:1px solid #8f7cff55;border-radius:18px;padding:14px;background:linear-gradient(145deg,#241d49dd,#0c0b20dd);color:#f5f0ff}\n.moon-status header{display:flex;justify-content:space-between;color:#b8a9ff}\n.moon-status dl{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin:0}\n.moon-status dl div{border-radius:10px;padding:8px;background:#ffffff0b}\n.moon-status dt{font-size:11px;opacity:.65}.moon-status dd{margin:3px 0 0}\n</style>\n<section class=\"moon-status\"><header><strong>月港状态</strong><span>23:40</span></header><dl><div><dt>地点</dt><dd>旧城区</dd></div><div><dt>关系</dt><dd>信任 68</dd></div></dl></section>");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const activeIndex = Math.max(0, modules.findIndex((module) => module.id === activeModuleId));
  const activeModule = modules[activeIndex];
  const warnings = analyzePromptModules(modules);

  function updateModule(patch: Partial<PromptModule>) {
    setModules((current) => current.map((module) => module.id === activeModuleId ? { ...module, ...patch } : module));
  }

  function updateRenderer(patch: Partial<OutputRendererConfig>) {
    setOutputRenderer((current) => ({ ...current, ...patch }));
  }

  function updateRegexRule(ruleId: string, patch: Partial<OutputRegexRule>) {
    setOutputRenderer((current) => ({
      ...current,
      regexRules: current.regexRules.map((rule) => rule.id === ruleId ? { ...rule, ...patch } : rule),
    }));
  }

  function addRegexRule() {
    setOutputRenderer((current) => ({
      ...current,
      regexRules: [...current.regexRules, createOutputRegexRule(current.regexRules.length)],
    }));
  }

  function removeRegexRule(ruleId: string) {
    setOutputRenderer((current) => ({
      ...current,
      regexRules: current.regexRules.filter((rule) => rule.id !== ruleId),
    }));
  }

  function addModule() {
    const newModule = createPromptModule(modules.length);
    setModules((current) => [...current, newModule]);
    setActiveModuleId(newModule.id);
  }

  function duplicateModule() {
    if (!activeModule) return;
    const duplicate = { ...activeModule, ...createPromptModule(activeIndex + 1), name: `${activeModule.name} · 副本`, content: activeModule.content, enabled: activeModule.enabled, position: activeModule.position, priority: activeModule.priority };
    const next = [...modules];
    next.splice(activeIndex + 1, 0, duplicate);
    setModules(next.map((module, index) => ({ ...module, order: index })));
    setActiveModuleId(duplicate.id);
  }

  function removeModule() {
    if (!activeModule) return;
    if (modules.length === 1) {
      setError("一个预设至少需要保留一个提示词模块。");
      return;
    }
    const next = modules.filter((module) => module.id !== activeModule.id).map((module, index) => ({ ...module, order: index }));
    setModules(next);
    setActiveModuleId(next[Math.min(activeIndex, next.length - 1)].id);
  }

  function moveModule(direction: -1 | 1) {
    const nextIndex = activeIndex + direction;
    if (!activeModule || nextIndex < 0 || nextIndex >= modules.length) return;
    const next = [...modules];
    [next[activeIndex], next[nextIndex]] = [next[nextIndex], next[activeIndex]];
    setModules(next.map((module, index) => ({ ...module, order: index })));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      setError("请填写预设名称。");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onSave({
        name: name.trim(),
        modules: modules.map((module, index) => ({
          ...module,
          name: module.name.trim() || `提示词模块 ${index + 1}`,
          content: module.content.trim(),
          priority: Number.isFinite(module.priority) ? module.priority : 0,
          order: index,
        })),
        modelPatch: {
          ...(temperature.trim() ? { temperature: Number(temperature) } : {}),
          ...(maxTokens.trim() ? { maxTokens: Number(maxTokens) } : {}),
          ...(contextLimit.trim() ? { contextLimit: Number(contextLimit) } : {}),
        },
        outputRenderer: normalizeOutputRenderer(outputRenderer),
      });
    } finally {
      setBusy(false);
    }
  }

  async function runSecondary(action?: () => Promise<void> | void) {
    if (!action || busy) return;
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="preset-editor glass-panel" role="dialog" aria-modal="true" aria-labelledby="preset-editor-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="关闭预设编辑器">×</button>
        <span className="eyebrow">PROMPT PRESET EDITOR</span>
        <h2 id="preset-editor-title">{preset ? `编辑 ${preset.name}` : "创建新预设"}</h2>
        <p className="preset-editor-intro">优先级较高的模块先注入；优先级相同时按列表顺序执行。历史后置模块会放在最近对话之后。</p>

        <form onSubmit={submit}>
          <div className="preset-meta-grid">
            <label className="preset-name"><span>预设名称 *</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required /></label>
            <label><span>Temperature</span><input type="number" min="0" max="2" step="0.1" value={temperature} onChange={(event) => setTemperature(event.target.value)} placeholder="不覆盖" /></label>
            <label><span>最大输出 Tokens</span><input type="number" min="1" step="1" value={maxTokens} onChange={(event) => setMaxTokens(event.target.value)} placeholder="不覆盖" /></label>
            <label><span>上下文窗口</span><input type="number" min="1024" step="1" value={contextLimit} onChange={(event) => setContextLimit(event.target.value)} placeholder="不覆盖" /></label>
          </div>

          <div className="preset-editor-workspace">
            <aside className="preset-module-list" aria-label="提示词模块">
              <div className="preset-module-heading"><strong>提示词模块</strong><span>{modules.filter((module) => module.enabled).length}/{modules.length} 启用</span></div>
              <div className="preset-module-scroll">
                {modules.map((module, index) => (
                  <button type="button" className={module.id === activeModuleId ? "is-active" : ""} key={module.id} onClick={() => { setActiveModuleId(module.id); setError(""); }}>
                    <i className={module.enabled ? "is-enabled" : ""} />
                    <span><strong>{module.name || `模块 ${index + 1}`}</strong><small>{module.position === "post_history" ? "历史后置" : "系统提示"} · P{module.priority}</small></span>
                  </button>
                ))}
              </div>
              <button className="preset-add-module" type="button" onClick={addModule}>＋ 新建模块</button>
            </aside>

            {activeModule && (
              <div className="preset-module-editor">
                <div className="preset-module-toolbar">
                  <span>模块 {activeIndex + 1}</span>
                  <div><button type="button" onClick={() => moveModule(-1)} disabled={activeIndex === 0} aria-label="上移模块">↑</button><button type="button" onClick={() => moveModule(1)} disabled={activeIndex === modules.length - 1} aria-label="下移模块">↓</button><button type="button" onClick={duplicateModule}>复制</button><button className="danger" type="button" onClick={removeModule}>删除</button></div>
                </div>
                <div className="preset-module-grid">
                  <label className="wide"><span>模块名称</span><input value={activeModule.name} onChange={(event) => updateModule({ name: event.target.value })} maxLength={160} /></label>
                  <label><span>插入位置</span><select value={activeModule.position} onChange={(event) => updateModule({ position: event.target.value as PromptModule["position"] })}><option value="system">系统提示词</option><option value="post_history">历史消息之后</option></select></label>
                  <label><span>优先级</span><input type="number" min={-1000} max={1000} value={activeModule.priority} onChange={(event) => updateModule({ priority: Number(event.target.value) })} /></label>
                  <label className="wide"><span>提示词内容</span><textarea value={activeModule.content} onChange={(event) => updateModule({ content: event.target.value })} rows={13} placeholder="支持 {{char}} 与 {{user}} 宏…" /></label>
                </div>
                <label className="preset-module-toggle"><input type="checkbox" checked={activeModule.enabled} onChange={(event) => updateModule({ enabled: event.target.checked })} /><span><strong>启用此模块</strong><small>关闭后不会进入模型上下文，但内容会保留。</small></span></label>
              </div>
            )}
          </div>

          <details className="preset-renderer-settings" open>
            <summary><span><strong>小剧场与输出美化</strong><small>安全渲染 Markdown、卡片和 Regex；不会执行脚本。</small></span><i>{outputRenderer.enabled ? "已启用" : "已关闭"}</i></summary>
            <div className="preset-renderer-body">
              <div className="renderer-options">
                <label className="preset-module-toggle"><input type="checkbox" checked={outputRenderer.enabled} onChange={(event) => updateRenderer({ enabled: event.target.checked })} /><span><strong>启用输出美化</strong><small>关闭后聊天区始终显示模型原文。</small></span></label>
                <label className="preset-module-toggle"><input type="checkbox" checked={outputRenderer.markdown} onChange={(event) => updateRenderer({ markdown: event.target.checked })} /><span><strong>Markdown 与安全 HTML 转换</strong><small>HTML 只转换为安全排版，不运行脚本和外链资源。</small></span></label>
                <label className="preset-module-toggle"><input type="checkbox" checked={outputRenderer.isolatedHtml} onChange={(event) => updateRenderer({ isolatedHtml: event.target.checked })} /><span><strong>隔离渲染预设 HTML/CSS</strong><small>保留预设 class 与样式，但限制在单条消息内；禁用脚本、表单和网络资源。</small></span></label>
                <label className="preset-module-toggle"><input type="checkbox" checked={outputRenderer.theater} onChange={(event) => updateRenderer({ theater: event.target.checked })} /><span><strong>识别小剧场卡片</strong><small>支持 :::theater 或 ```theater 围栏。</small></span></label>
                <label className="preset-module-toggle"><input type="checkbox" checked={outputRenderer.widgets} onChange={(event) => updateRenderer({ widgets: event.target.checked })} /><span><strong>识别状态栏与原生组件</strong><small>支持 :::status、:::widget 和 Lunemir 安全组件标签。</small></span></label>
                <label><span>小剧场样式</span><select value={outputRenderer.theaterTheme} onChange={(event) => updateRenderer({ theaterTheme: event.target.value as OutputRendererConfig["theaterTheme"] })}><option value="glass">月光毛玻璃</option><option value="minimal">极简旁白</option><option value="paper">信笺纸张</option></select></label>
              </div>

              <div className="renderer-rule-heading"><div><strong>Regex 美化规则</strong><small>按列表顺序处理 AI 原文；危险或无效表达式会自动跳过。</small></div><button type="button" onClick={addRegexRule}>＋ 添加规则</button></div>
              <div className="renderer-rule-list">
                {outputRenderer.regexRules.length === 0 ? <p className="renderer-empty">还没有 Regex 规则。普通 Markdown 和小剧场卡片仍然可用。</p> : outputRenderer.regexRules.map((rule, index) => (
                  <article className="renderer-rule" key={rule.id}>
                    <header><span>规则 {index + 1}</span><label><input type="checkbox" checked={rule.enabled} onChange={(event) => updateRegexRule(rule.id, { enabled: event.target.checked })} /> 启用</label><button className="danger" type="button" onClick={() => removeRegexRule(rule.id)}>删除</button></header>
                    <div className="renderer-rule-grid">
                      <label><span>名称</span><input value={rule.name} onChange={(event) => updateRegexRule(rule.id, { name: event.target.value })} /></label>
                      <label><span>作用范围</span><select value={rule.scope} onChange={(event) => updateRegexRule(rule.id, { scope: event.target.value as OutputRegexRule["scope"] })}><option value="assistant">仅 AI 回复</option><option value="all">全部输出</option></select></label>
                      <label className="wide"><span>查找表达式</span><input value={rule.pattern} onChange={(event) => updateRegexRule(rule.id, { pattern: event.target.value })} placeholder="例如：\\[小剧场\\]([\\s\\S]*?)\\[/小剧场\\]" spellCheck={false} /></label>
                      <label><span>Flags</span><input value={rule.flags} onChange={(event) => updateRegexRule(rule.id, { flags: event.target.value })} placeholder="gimsu" spellCheck={false} /></label>
                      <label className="wide"><span>替换内容</span><textarea value={rule.replacement} onChange={(event) => updateRegexRule(rule.id, { replacement: event.target.value })} rows={3} placeholder={":::theater 番外\n$1\n:::"} spellCheck={false} /></label>
                    </div>
                  </article>
                ))}
              </div>

              <div className="renderer-preview-grid">
                <label><span>实时预览原文</span><textarea value={rendererPreview} onChange={(event) => setRendererPreview(event.target.value)} rows={8} /></label>
                <div><span>安全渲染结果</span><div className="renderer-preview"><SafeMessageContent source={rendererPreview} config={outputRenderer} showWarnings /></div></div>
              </div>
            </div>
          </details>

          {warnings.length > 0 && <div className="preset-warnings"><strong>规则检查</strong>{warnings.map((warning) => <p key={warning}>{warning}</p>)}</div>}
          {error && <p className="character-editor-error" role="alert">{error}</p>}
          <div className="character-editor-actions">
            <div>{preset && <><button type="button" onClick={() => void runSecondary(onDuplicate)}>复制预设</button><button type="button" onClick={onExport}>导出 JSON</button><button className="danger" type="button" onClick={() => void runSecondary(onDelete)}>删除预设</button></>}</div>
            <span><button type="button" onClick={onClose}>取消</button><button className="primary-button" type="submit" disabled={busy}>{busy ? "保存中…" : "保存并应用"}</button></span>
          </div>
        </form>
      </section>
    </div>
  );
}
