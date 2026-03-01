import { useEffect } from "react";
import toolRegistry from "@/tools";
import {
  createGetVideoNoteHighlightsTool,
  createGetVideoNoteThemeContextTool,
  createSearchVideoNoteHighlightsTool,
  createVideoNoteSearchTool,
  type VideoNoteChatContextProvider,
} from "@/tools/videoNoteSearchTool";

export const useVideoNoteChat = (
  videoNoteId: number,
  mainDbName: string,
  contextProvider: VideoNoteChatContextProvider,
) => {
  useEffect(() => {
    const sourceId = `video-note-${videoNoteId}`;
    const tools = [
      createVideoNoteSearchTool(videoNoteId, mainDbName),
      createGetVideoNoteHighlightsTool(contextProvider),
      createSearchVideoNoteHighlightsTool(contextProvider),
      createGetVideoNoteThemeContextTool(contextProvider),
    ];
    toolRegistry.registerTools(sourceId, tools, true);

    return () => {
      toolRegistry.unregisterSource(sourceId);
    };
  }, [videoNoteId, mainDbName, contextProvider]);
};

export default useVideoNoteChat;
