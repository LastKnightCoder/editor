import { type VideoContentProvider } from "@tau/editor-media/services";

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
    id: "online",
    match: element => typeof element.metaInfo?.type === "string",
    Content: createDegradedContent("该视频请在桌面端播放"),
  },
];
