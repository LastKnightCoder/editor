import { type VideoContentProvider } from "@tau/editor/extensions/media/services";

/**
 * Mobile 的视频内容源：视频插件提供的视频依赖桌面端插件，降级为提示信息。
 */
function createDegradedContent(message: string): VideoContentProvider["Content"] {
  const DegradedContent = () => (
    <div className="border-line-1 bg-page/80 text-ink-2 rounded-xl border border-dashed p-3 text-xs">
      {message}
    </div>
  );
  return DegradedContent;
}

export const mobileVideoContentProviders: VideoContentProvider[] = [
  {
    id: "online",
    match: element => typeof element.metaInfo?.type === "string",
    Content: createDegradedContent("该视频请在桌面端查看"),
  },
];
