import { useEffect } from "react";
import toolRegistry from "@/tools";
import {
  createGetVideoNoteTranscriptRangeTool,
  createVideoNoteSearchTool,
} from "@/tools/videoNoteSearchTool";

export const useVideoNoteChat = (videoNoteId: number, mainDbName: string) => {
  useEffect(() => {
    const sourceId = `video-note-${videoNoteId}`;
    const tools = [
      createVideoNoteSearchTool(videoNoteId, mainDbName),
      createGetVideoNoteTranscriptRangeTool(videoNoteId),
    ];
    toolRegistry.registerTools(sourceId, tools, true);

    return () => {
      toolRegistry.unregisterSource(sourceId);
    };
  }, [videoNoteId, mainDbName]);
};

export default useVideoNoteChat;
