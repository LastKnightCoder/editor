import React, { memo } from "react";
import { VideoNote as VideoNoteType } from "@/types";
import SlideLayout from "./layouts/SlideLayout";
import { ThemeContext } from "./ThemeContext";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

export interface VideoNoteProps {
  videoSrc: string;
  initialNotes?: VideoNoteType["notes"];
  updateNotes: (notes: VideoNoteType["notes"]) => Promise<void>;
  addSubNote: (
    note: Omit<VideoNoteType["notes"][number], "contentId">,
  ) => Promise<VideoNoteType["notes"][number] | null>;
  deleteSubNote: (noteId: string) => Promise<boolean>;
  uploadResource: (file: File) => Promise<string | null>;
  theme?: "light" | "dark";
  useLocalVideo?: boolean; // 是否使用 LocalVideo 组件，默认 true
}

const VideoNote: React.FC<VideoNoteProps> = memo(
  ({
    videoSrc,
    initialNotes = [],
    updateNotes,
    uploadResource,
    addSubNote,
    deleteSubNote,
    theme = "light",
    useLocalVideo = true,
  }) => {
    return (
      <ThemeContext.Provider value={theme}>
        <DndProvider backend={HTML5Backend}>
          <SlideLayout
            videoSrc={videoSrc}
            initialNotes={initialNotes}
            updateNotes={updateNotes}
            uploadResource={uploadResource}
            addSubNote={addSubNote}
            deleteSubNote={deleteSubNote}
            useLocalVideo={useLocalVideo}
          />
        </DndProvider>
      </ThemeContext.Provider>
    );
  },
);

VideoNote.displayName = "VideoNote";

export default VideoNote;
