import { type VideoContentProvider } from "@tau/editor-media/services";

/**
 * Mobile 的视频内容源：平台解析类视频降级为提示信息。
 */
function createDegradedContent(message: string): VideoContentProvider["Content"] {
  const DegradedContent = () => (
    <div className="border-line bg-input/80 text-ink-2 rounded-xl border border-dashed p-3 text-xs">
      {message}
    </div>
  );
  return DegradedContent;
}

export const mobileVideoContentProviders: VideoContentProvider[] = [
  {
    id: "bilibili",
    match: element => element.metaInfo?.type === "bilibili",
    isSourceUrl: url => /(?:bilibili\.com|b23\.tv)/i.test(url),
    Content: createDegradedContent("Bilibili 视频请在桌面端查看"),
  },
  {
    id: "youtube",
    match: element => element.metaInfo?.type === "youtube",
    isSourceUrl: url => /(?:youtube\.com\/watch\?v=|youtu\.be\/)/i.test(url),
    Content: createDegradedContent("YouTube 视频请在桌面端查看"),
  },
];
