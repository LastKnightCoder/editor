import type { VideoContentProvider } from "@tau/editor/src";

/**
 * Mobile 的视频内容源：平台解析类视频降级为提示信息。
 */
function createDegradedContent(message: string): VideoContentProvider["Content"] {
  const DegradedContent = () => (
    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 p-3 text-xs text-slate-500">
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
