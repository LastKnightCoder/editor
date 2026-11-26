import { videoSurfaceT } from "@/services/video-surface.binding";
import { useEffect } from "react";
import toolRegistry from "@/tools";
import {
  createGetVideoNoteTranscriptRangeTool,
  createVideoNoteSearchTool,
} from "@/tools/videoNoteSearchTool";

/** 注册页面专属工具，返回工具作用域：交给本页对话的 ChatContainer toolScope，别的对话拿不到 */
export const useVideoNoteChat = (videoNoteId: number, mainDbName: string, active = true) => {
  const sourceId = `video-note-${videoNoteId}`;
  useEffect(() => {
    if (!active) return;
    const tools = [
      createVideoNoteSearchTool(videoNoteId, mainDbName),
      createGetVideoNoteTranscriptRangeTool(videoNoteId),
    ];
    toolRegistry.registerScopedTools(sourceId, "视频笔记转录", tools, {
      getLabel: () => videoSurfaceT("tools.transcript"),
    });

    return () => {
      toolRegistry.unregisterSource(sourceId);
    };
  }, [sourceId, videoNoteId, mainDbName, active]);

  return sourceId;
};

export default useVideoNoteChat;
