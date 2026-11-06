"use client";

import { useMemo, useState } from "react";
import type { StoryEvent, StoryState } from "../../lib/lunemir/types";

type StoryTimelineProps = {
  storyState: StoryState;
  storyEvents: StoryEvent[];
  npcStatus: "idle" | "checking" | "linked" | "cooldown" | "skipped" | "error";
  npcMessage: string;
  onClose: () => void;
  onSaveState: (values: Pick<StoryState, "currentTime" | "location" | "weather" | "scene" | "npcInitiative" | "cooldownMinutes">) => Promise<boolean>;
  onAdvanceTime: (minutes: number) => Promise<boolean>;
  onCheckNpc: () => Promise<boolean | void>;
  onRevertEvent: (eventId: string) => Promise<boolean>;
};

function toLocalDateTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

const eventLabels: Record<StoryEvent["eventType"], string> = {
  phone_message_received: "NPC 来信",
  phone_message_sent: "手机回复",
  time_advanced: "时间推进",
  story_state_changed: "状态更新",
};

export function StoryTimelineModal({ storyState, storyEvents, npcStatus, npcMessage, onClose, onSaveState, onAdvanceTime, onCheckNpc, onRevertEvent }: StoryTimelineProps) {
  const [currentTime, setCurrentTime] = useState(() => toLocalDateTime(storyState.currentTime));
  const [location, setLocation] = useState(storyState.location);
  const [weather, setWeather] = useState(storyState.weather);
  const [scene, setScene] = useState(storyState.scene);
  const [initiative, setInitiative] = useState(storyState.npcInitiative);
  const [cooldown, setCooldown] = useState(storyState.cooldownMinutes);
  const [advanceAmount, setAdvanceAmount] = useState(2);
  const [advanceUnit, setAdvanceUnit] = useState<"minutes" | "hours" | "days">("hours");
  const [busy, setBusy] = useState<"save" | "advance" | "revert" | "">("");
  const [notice, setNotice] = useState("");
  const timeline = useMemo(() => [...storyEvents].reverse(), [storyEvents]);

  async function saveState() {
    const parsedTime = new Date(currentTime);
    if (Number.isNaN(parsedTime.getTime())) {
      setNotice("请输入有效的剧情日期与时间。");
      return;
    }
    setBusy("save");
    try {
      const saved = await onSaveState({
        currentTime: parsedTime.toISOString(),
        location: location.trim(),
        weather: weather.trim(),
        scene: scene.trim(),
        npcInitiative: initiative,
        cooldownMinutes: cooldown,
      });
      if (saved) setNotice("剧情状态已保存，主聊天与手机将共享这组状态。");
    } finally {
      setBusy("");
    }
  }

  async function advanceTime() {
    const multiplier = advanceUnit === "days" ? 1440 : advanceUnit === "hours" ? 60 : 1;
    const minutes = Math.round(advanceAmount * multiplier);
    if (!Number.isFinite(minutes) || minutes < 1) {
      setNotice("推进时间必须大于 0。");
      return;
    }
    setBusy("advance");
    try {
      const saved = await onAdvanceTime(minutes);
      if (saved) {
        const next = new Date(Date.parse(storyState.currentTime) + minutes * 60_000).toISOString();
        setCurrentTime(toLocalDateTime(next));
        setNotice("时间已推进，并完成一次受冷却规则约束的 NPC 行为检查。");
      }
    } finally {
      setBusy("");
    }
  }

  async function revert(eventId: string) {
    setBusy("revert");
    try {
      const reverted = await onRevertEvent(eventId);
      if (reverted) setNotice("事件已回滚；若它改变过时间或场景，剧情状态也已恢复。");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="modal-backdrop story-timeline-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="glass-panel story-timeline" role="dialog" aria-modal="true" aria-labelledby="story-timeline-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="modal-close" type="button" onClick={onClose} aria-label="关闭剧情时间线">×</button>
        <span className="eyebrow">STORY CLOCK</span>
        <h2 id="story-timeline-title">剧情时间与事件</h2>
        <p className="story-timeline-intro">每个会话拥有独立时间、地点和 NPC 冷却。系统只在你推进时间、完成一轮对话或手动检查时运行一次，不会在后台无限生成。</p>

        <div className="story-timeline-layout">
          <div className="story-state-column">
            <section className="story-state-card">
              <header><div><span>01</span><div><strong>统一剧情状态</strong><small>主聊天、手机消息和模型上下文共用</small></div></div></header>
              <div className="story-state-fields">
                <label><span>剧情日期与时间</span><input type="datetime-local" value={currentTime} onChange={(event) => setCurrentTime(event.target.value)} /></label>
                <label><span>当前地点</span><input value={location} onChange={(event) => setLocation(event.target.value)} maxLength={120} placeholder="例如：月港旧钟塔" /></label>
                <label><span>天气 / 环境</span><input value={weather} onChange={(event) => setWeather(event.target.value)} maxLength={80} placeholder="例如：小雪 · -2°C" /></label>
                <label className="wide"><span>当前场景</span><textarea value={scene} onChange={(event) => setScene(event.target.value)} rows={4} maxLength={1200} placeholder="记录此刻明确成立的场景状态。" /></label>
                <label><span>NPC 主动性 · {initiative}</span><input type="range" min={0} max={100} value={initiative} onChange={(event) => setInitiative(Number(event.target.value))} /></label>
                <label><span>主动联系冷却（分钟）</span><input type="number" min={0} max={10080} value={cooldown} onChange={(event) => setCooldown(Number(event.target.value))} /></label>
              </div>
              <button className="primary-button story-state-save" type="button" onClick={() => void saveState()} disabled={Boolean(busy)}>{busy === "save" ? "保存中…" : "保存剧情状态"}</button>
            </section>

            <section className="story-state-card">
              <header><div><span>02</span><div><strong>推进与主动行为</strong><small>一次推进只触发一次受控检查</small></div></div></header>
              <div className="story-advance-row">
                <input type="number" min={1} max={525600} value={advanceAmount} onChange={(event) => setAdvanceAmount(Number(event.target.value))} aria-label="推进数量" />
                <select value={advanceUnit} onChange={(event) => setAdvanceUnit(event.target.value as typeof advanceUnit)} aria-label="推进单位"><option value="minutes">分钟</option><option value="hours">小时</option><option value="days">天</option></select>
                <button className="primary-button" type="button" onClick={() => void advanceTime()} disabled={Boolean(busy) || npcStatus === "checking"}>{busy === "advance" ? "推进中…" : "推进时间"}</button>
              </div>
              <div className={`npc-scheduler-state is-${npcStatus}`} role="status">
                <span>{npcStatus === "checking" ? "…" : npcStatus === "linked" ? "✓" : npcStatus === "error" ? "!" : "◇"}</span>
                <div><strong>{npcStatus === "checking" ? "正在检查 NPC 行为" : npcStatus === "cooldown" ? "处于冷却" : npcStatus === "linked" ? "已产生联动事件" : npcStatus === "skipped" ? "本次没有联系" : npcStatus === "error" ? "检查失败" : "等待触发"}</strong><small>{npcMessage || "NPC 是否联系由人物性格、最近互动、剧情时间与主动性共同决定。"}</small></div>
              </div>
              <button className="story-check-button" type="button" onClick={() => void onCheckNpc()} disabled={npcStatus === "checking"}>立即检查一次</button>
            </section>
          </div>

          <section className="story-event-card">
            <header><div><span>03</span><div><strong>事件时间线</strong><small>{timeline.length} 条本地事件 · 可追溯来源</small></div></div></header>
            <div className="story-event-list">
              {timeline.map((event) => (
                <article className={event.status === "reverted" ? "is-reverted" : ""} key={event.id}>
                  <i aria-hidden="true" />
                  <div><div><strong>{eventLabels[event.eventType]}</strong><time>{new Date(event.storyTime).toLocaleString("zh-CN")}</time></div><p>{event.content}</p>{event.metadata?.reason ? <small>{event.metadata.reason}</small> : null}<footer><span>{event.source === "ai" ? "AI 提案 · 程序确认" : event.source === "user" ? "用户操作" : "系统"}</span>{event.status === "reverted" ? <em>已回滚</em> : <button type="button" onClick={() => void revert(event.id)} disabled={Boolean(busy)}>回滚</button>}</footer></div>
                </article>
              ))}
              {timeline.length === 0 ? <p className="story-event-empty">时间线还是空的。保存剧情状态、推进时间或使用手机后，真实事件会记录在这里。</p> : null}
            </div>
          </section>
        </div>
        {notice ? <p className="story-guidance-notice" role="status">{notice}</p> : null}
      </section>
    </div>
  );
}
