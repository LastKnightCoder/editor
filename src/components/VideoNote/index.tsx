import React from "react";
import { VideoNote as VideoNoteType } from "@/types";
import SlideLayout from "./layouts/SlideLayout";
import { ThemeContext } from "./ThemeContext";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

export interface VideoNoteContextType {
  captureVideoFrame: () => Promise<string | null>;
  getCurrentTime: () => number;
  seekTo: (time: number) => void;
}

export interface VideoNoteProps {
  videoSrc: string;
  initialNotes?: VideoNoteType["notes"];
  updateNotes: (notes: VideoNoteType["notes"]) => Promise<void>;
  addSubNote: (
    note: Omit<VideoNoteType["notes"][number], "contentId">,
  ) => Promise<VideoNoteType["notes"][number] | null>;
  deleteSubNote: (noteId: string) => Promise<boolean>;
  updateSubNote: (
    note: VideoNoteType["notes"][number],
  ) => Promise<VideoNoteType["notes"][number] | null>;
  uploadResource: (file: File) => Promise<string | null>;
  theme?: "light" | "dark";
}

const VideoNote: React.FC<VideoNoteProps> = ({
  videoSrc,
  initialNotes = [],
  updateNotes,
  uploadResource,
  addSubNote,
  deleteSubNote,
  updateSubNote,
  theme = "light",
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
          updateSubNote={updateSubNote}
        />
      </DndProvider>
    </ThemeContext.Provider>
  );
};

export default VideoNote;
