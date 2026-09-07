import type { VideoContentProvider } from "@tau/editor";

/**
 * Blog（只读渲染）的视频内容源：均降级为提示信息。
 */
function createDegradedContent(message: string): VideoContentProvider["Content"] {
  const DegradedContent = () => (
    <div className="rounded border border-dashed border-gray-300 p-4 text-sm text-gray-500">
      {message}
    </div>
  );
  return DegradedContent;
}

export const blogVideoContentProviders: VideoContentProvider[] = [
  {
    id: "bilibili",
    match: element => element.metaInfo?.type === "bilibili",
    Content: createDegradedContent("Bilibili 视频在桌面端可播放"),
  },
  {
    id: "youtube",
    match: element => element.metaInfo?.type === "youtube",
    Content: createDegradedContent("YouTube 视频在桌面端可播放"),
  },
];
