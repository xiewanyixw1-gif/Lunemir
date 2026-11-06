import type { StoryState } from "../../lib/lunemir/types";

type StoryReadingHeaderProps = {
  title: string;
  scene: string;
  storyState: StoryState | null;
  fallbackTime: string;
  onOpenTimeline: () => void;
};

function formatStoryTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未设定";
  return date.toLocaleString("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function StoryReadingHeader({ title, scene, storyState, fallbackTime, onOpenTimeline }: StoryReadingHeaderProps) {
  const storyTime = storyState?.currentTime ?? fallbackTime;

  return (
    <header className="story-reading-header" aria-labelledby="story-reading-title">
      <p className="story-reading-overline"><span>CURRENT CHAPTER</span></p>
      <h2 id="story-reading-title">{title}</h2>
      {scene ? <p className="story-reading-scene">{scene}</p> : null}
      <div className="story-reading-context">
        <dl aria-label="当前剧情状态">
          <div>
            <dt>剧情时间</dt>
            <dd><time dateTime={storyTime}>{formatStoryTime(storyTime)}</time></dd>
          </div>
          {storyState?.location ? <div><dt>地点</dt><dd>{storyState.location}</dd></div> : null}
          {storyState?.weather ? <div><dt>环境</dt><dd>{storyState.weather}</dd></div> : null}
        </dl>
        <button type="button" onClick={onOpenTimeline} aria-label="编辑剧情时间、地点与场景">
          <span aria-hidden="true">⌁</span>
          剧情状态
        </button>
      </div>
    </header>
  );
}
