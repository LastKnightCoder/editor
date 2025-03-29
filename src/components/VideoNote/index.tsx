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
  onNotesChange?: (value: VideoNoteType["notes"]) => void;
  uploadResource?: (file: File) => Promise<string | null>;
  theme?: "light" | "dark";
}

const VideoNote: React.FC<VideoNoteProps> = ({
  videoSrc,
  initialNotes = [],
  onNotesChange,
  uploadResource,
  theme = "light",
}) => {
  return (
    <ThemeContext.Provider value={theme}>
      <DndProvider backend={HTML5Backend}>
        <SlideLayout
          videoSrc={videoSrc}
          initialNotes={initialNotes}
          onNotesChange={onNotesChange}
          uploadResource={uploadResource}
        />
      </DndProvider>
    </ThemeContext.Provider>
  );
};

export default VideoNote;
