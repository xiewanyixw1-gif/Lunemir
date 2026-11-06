import { DEFAULT_APPEARANCE } from "../../lib/lunemir/defaults";
import type { AppearanceSettings } from "../../lib/lunemir/types";
import { GlassPanel } from "./GlassPanel";

type NumericAppearanceKey =
  | "glassOpacity"
  | "glassBlur"
  | "glassBorderOpacity"
  | "glassHighlight"
  | "glassShadow"
  | "backgroundBrightness"
  | "backgroundBlur"
  | "backgroundOverlay"
  | "backgroundVignette"
  | "backgroundScale"
  | "backgroundPositionX"
  | "backgroundPositionY"
  | "avatarSize"
  | "avatarGap"
  | "fontSize"
  | "fontWeight"
  | "lineHeight"
  | "paragraphSpacing"
  | "messageMaxWidth";

type RangeControlProps = {
  label: string;
  field: NumericAppearanceKey;
  value: AppearanceSettings;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onPreview: (next: AppearanceSettings) => void;
  onSave: (next: AppearanceSettings) => void;
};

function RangeControl({ label, field, value, min, max, step = 1, suffix = "", onPreview, onSave }: RangeControlProps) {
  const current = value[field];
  const nextValue = (raw: string) => ({ ...value, [field]: Number(raw) });
  return (
    <label className="appearance-range">
      <span>{label}<b>{current}{suffix}</b></span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={current}
        onChange={(event) => onPreview(nextValue(event.target.value))}
        onPointerUp={(event) => onSave(nextValue(event.currentTarget.value))}
        onKeyUp={(event) => onSave(nextValue(event.currentTarget.value))}
        onBlur={(event) => onSave(nextValue(event.currentTarget.value))}
      />
    </label>
  );
}

function ChoiceGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string; description?: string }>;
  onChange: (next: T) => void;
}) {
  return (
    <div className="appearance-choice">
      <span>{label}</span>
      <div className="segmented-control">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={value === option.value ? "is-active" : ""}
            onClick={() => onChange(option.value)}
            title={option.description}
          >{option.label}</button>
        ))}
      </div>
    </div>
  );
}

const themes: Array<{ id: AppearanceSettings["theme"]; name: string; colors: string[] }> = [
  { id: "moon", name: "Moon Glass", colors: ["#171329", "#a78be6", "#8c86d4"] },
  { id: "aurora", name: "Aurora Mist", colors: ["#0c2329", "#65cbb4", "#7897cf"] },
  { id: "rose", name: "Rose Nocturne", colors: ["#281523", "#d784ae", "#9583c9"] },
];

export function ChatAppearancePanel({
  value,
  onPreview,
  onSave,
  onUploadBackground,
}: {
  value: AppearanceSettings;
  onPreview: (next: AppearanceSettings) => void;
  onSave: (next: AppearanceSettings) => void;
  onUploadBackground: (file: File) => void;
}) {
  const savePatch = <K extends keyof AppearanceSettings>(field: K, next: AppearanceSettings[K]) => {
    onSave({ ...value, [field]: next });
  };
  const rangeProps = { value, onPreview, onSave };
  const applyRoleScreen = () => onSave({
    ...value,
    backgroundMode: "character",
    readingStyle: "cinematic",
    messageStyle: "novel-flow",
    glassScope: "chrome-only",
    glassMode: "full",
    backgroundBrightness: 72,
    backgroundOverlay: 46,
    backgroundVignette: 58,
    avatarLayout: "header",
    showCharacterAvatar: true,
    showUserAvatar: false,
    showCharacterName: true,
    showUserName: true,
    showTimestamp: false,
    fontFamily: "serif",
    fontSize: 18,
    lineHeight: 1.95,
  });

  return (
    <div className="appearance-workspace">
      <div className="view-heading appearance-heading">
        <div><span className="eyebrow">CHAT APPEARANCE</span><h2>Moon Glass 外观</h2><p className="view-description">所有选项都会真实应用到聊天并保存在当前设备。返回聊天即可查看完整效果。</p></div>
        <div className="appearance-heading-actions"><span className="subtle-label">实时预览 · 自动保存</span><button type="button" onClick={applyRoleScreen}>应用角色映幕</button><button type="button" onClick={() => onSave(DEFAULT_APPEARANCE)}>恢复默认</button></div>
      </div>

      <GlassPanel as="section" className="appearance-section">
        <header><div><span className="eyebrow">THEME</span><h3>主题与背景</h3></div></header>
        <div className="theme-grid compact">
          {themes.map((theme) => (
            <button key={theme.id} type="button" className={value.theme === theme.id ? "theme-card is-selected" : "theme-card"} onClick={() => savePatch("theme", theme.id)}>
              <span className="theme-preview">{theme.colors.map((color) => <i key={color} style={{ background: color }} />)}</span>
              <span><strong>{theme.name}</strong><small>{value.theme === theme.id ? "正在使用" : "应用主题"}</small></span>
            </button>
          ))}
        </div>
        <div className="appearance-grid three">
          <ChoiceGroup label="聊天背景" value={value.backgroundMode} options={[{ value: "character", label: "角色卡图片" }, { value: "gradient", label: "默认渐变" }, { value: "custom", label: "自定义" }]} onChange={(next) => savePatch("backgroundMode", next)} />
          <ChoiceGroup label="图片适配" value={value.backgroundFit} options={[{ value: "cover", label: "铺满" }, { value: "contain", label: "完整显示" }]} onChange={(next) => savePatch("backgroundFit", next)} />
          <label className={value.backgroundMode === "custom" ? "background-upload is-active" : "background-upload"}>上传背景<input type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) onUploadBackground(file); event.currentTarget.value = ""; }} /></label>
        </div>
        <div className="appearance-ranges four">
          <RangeControl {...rangeProps} label="背景亮度" field="backgroundBrightness" min={20} max={150} suffix="%" />
          <RangeControl {...rangeProps} label="背景模糊" field="backgroundBlur" min={0} max={30} suffix="px" />
          <RangeControl {...rangeProps} label="暗幕强度" field="backgroundOverlay" min={0} max={100} suffix="%" />
          <RangeControl {...rangeProps} label="暗角强度" field="backgroundVignette" min={0} max={100} suffix="%" />
          <RangeControl {...rangeProps} label="背景缩放" field="backgroundScale" min={70} max={180} suffix="%" />
          <RangeControl {...rangeProps} label="水平位置" field="backgroundPositionX" min={0} max={100} suffix="%" />
          <RangeControl {...rangeProps} label="垂直位置" field="backgroundPositionY" min={0} max={100} suffix="%" />
        </div>
      </GlassPanel>

      <GlassPanel as="section" className="appearance-section">
        <header><div><span className="eyebrow">LAYOUT</span><h3>阅读与消息布局</h3></div></header>
        <div className="appearance-grid two">
          <ChoiceGroup label="阅读风格" value={value.readingStyle} options={[{ value: "cinematic", label: "电影感" }, { value: "editorial", label: "编辑部" }, { value: "reader-glass", label: "阅读玻璃" }]} onChange={(next) => savePatch("readingStyle", next)} />
          <ChoiceGroup label="消息样式" value={value.messageStyle} options={[{ value: "bubble", label: "轻气泡" }, { value: "soft-card", label: "玻璃卡片" }, { value: "novel-flow", label: "小说流" }]} onChange={(next) => savePatch("messageStyle", next)} />
        </div>
        <ChoiceGroup label="头像与正文位置" value={value.avatarLayout} options={[{ value: "header", label: "头像在上" }, { value: "side", label: "头像侧边" }]} onChange={(next) => savePatch("avatarLayout", next)} />
        <div className="appearance-ranges four">
          <RangeControl {...rangeProps} label="正文字号" field="fontSize" min={14} max={24} suffix="px" />
          <RangeControl {...rangeProps} label="正文粗细" field="fontWeight" min={300} max={700} step={100} />
          <RangeControl {...rangeProps} label="正文行高" field="lineHeight" min={1.4} max={2.4} step={0.05} />
          <RangeControl {...rangeProps} label="段落间距" field="paragraphSpacing" min={0} max={32} suffix="px" />
          <RangeControl {...rangeProps} label="桌面阅读宽度" field="messageMaxWidth" min={520} max={1080} step={20} suffix="px" />
        </div>
        <div className="appearance-grid two">
          <ChoiceGroup label="正文字体" value={value.fontFamily} options={[{ value: "serif", label: "小说衬线" }, { value: "sans", label: "现代无衬线" }, { value: "system", label: "跟随系统" }]} onChange={(next) => savePatch("fontFamily", next)} />
          <div className="appearance-toggles" aria-label="消息信息显示">
            <button type="button" className={value.showTimestamp ? "is-active" : ""} onClick={() => savePatch("showTimestamp", !value.showTimestamp)}>时间</button>
            <button type="button" className={value.showCharacterName ? "is-active" : ""} onClick={() => savePatch("showCharacterName", !value.showCharacterName)}>角色名</button>
            <button type="button" className={value.showUserName ? "is-active" : ""} onClick={() => savePatch("showUserName", !value.showUserName)}>人设名</button>
          </div>
        </div>
      </GlassPanel>

      <GlassPanel as="section" className="appearance-section">
        <header><div><span className="eyebrow">GLASS</span><h3>毛玻璃范围与质感</h3></div></header>
        <ChoiceGroup label="覆盖范围" value={value.glassScope} options={[{ value: "fullscreen", label: "全屏" }, { value: "messages", label: "消息框" }, { value: "chrome-only", label: "仅界面" }, { value: "none", label: "关闭" }]} onChange={(next) => savePatch("glassScope", next)} />
        <div className="appearance-ranges four">
          <RangeControl {...rangeProps} label="玻璃不透明度" field="glassOpacity" min={0} max={100} suffix="%" />
          <RangeControl {...rangeProps} label="模糊强度" field="glassBlur" min={0} max={40} suffix="px" />
          <RangeControl {...rangeProps} label="描边强度" field="glassBorderOpacity" min={0} max={100} suffix="%" />
          <RangeControl {...rangeProps} label="内部高光" field="glassHighlight" min={0} max={100} suffix="%" />
          <RangeControl {...rangeProps} label="阴影强度" field="glassShadow" min={0} max={100} suffix="%" />
        </div>
      </GlassPanel>

      <GlassPanel as="section" className="appearance-section">
        <header><div><span className="eyebrow">AVATARS</span><h3>头像</h3></div><small className="appearance-section-note">角色与用户头像都可以独立关闭</small></header>
        <div className="appearance-grid two">
          <div className="appearance-toggles">
            <button type="button" className={value.showCharacterAvatar ? "is-active" : ""} onClick={() => savePatch("showCharacterAvatar", !value.showCharacterAvatar)}>角色头像</button>
            <button type="button" className={value.showUserAvatar ? "is-active" : ""} onClick={() => savePatch("showUserAvatar", !value.showUserAvatar)}>用户头像</button>
          </div>
          <ChoiceGroup label="头像形状" value={value.avatarShape} options={[{ value: "circle", label: "圆形" }, { value: "rounded", label: "圆角" }, { value: "square", label: "方形" }]} onChange={(next) => savePatch("avatarShape", next)} />
        </div>
        <div className="appearance-ranges four">
          <RangeControl {...rangeProps} label="头像尺寸" field="avatarSize" min={28} max={64} suffix="px" />
          <RangeControl {...rangeProps} label="头像间距" field="avatarGap" min={4} max={24} suffix="px" />
        </div>
      </GlassPanel>
    </div>
  );
}
