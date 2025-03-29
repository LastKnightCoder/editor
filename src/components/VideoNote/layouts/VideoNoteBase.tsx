import React, { useRef, useMemo, useState, useCallback } from "react";
import { Descendant } from "slate";
import { v4 as uuidv4 } from "uuid";
import { VideoControllerImpl } from "../VideoController";
import { createVideoNoteExtensions } from "../extensions";
import { getContentLength } from "@/utils/helper";
import { VideoNote as VideoNoteType } from "@/types";

export interface VideoNoteBaseProps {
  videoSrc: string;
  initialNotes?: VideoNoteType["notes"];
  onNotesChange?: (value: VideoNoteType["notes"]) => void;
  uploadResource?: (file: File) => Promise<string | null>;
}

export interface VideoNoteBaseReturnProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  notes: VideoNoteType["notes"];
  activeNoteId: string | null;
  expandedNoteId: string | null;
  extensions: any[];
  handleAddNote: () => void;
  handleNoteChange: (noteId: string, content: Descendant[]) => void;
  handleNoteClick: (noteId: string) => void;
  handleToggleExpand: (noteId: string) => void;
  handleDeleteNote: (noteId: string) => void;
  setActiveNoteId: (id: string | null) => void;
  formatTime: (time: number) => string;
}

export const useVideoNoteBase = ({
  initialNotes = [],
  onNotesChange,
  uploadResource,
}: VideoNoteBaseProps): VideoNoteBaseReturnProps => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(
    initialNotes[0]?.id || null,
  );
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);
  const [notes, setNotes] = useState<VideoNoteType["notes"]>(initialNotes);

  const videoController = useMemo(() => {
    return new VideoControllerImpl(() => videoRef.current, uploadResource);
  }, [uploadResource]);

  const extensions = useMemo(() => {
    return createVideoNoteExtensions(videoController);
  }, [videoController]);

  const formatTime = useCallback((time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }, []);

  const handleAddNote = useCallback(() => {
    const newNote = {
      id: uuidv4(),
      startTime: videoController.getCurrentTime(),
      content: [
        {
          type: "paragraph",
          children: [
            {
              type: "formatted",
              text: "",
            },
          ],
        },
      ] as Descendant[],
      count: 0,
    };

    const updatedNotes = [...notes, newNote];
    setNotes(updatedNotes);
    setActiveNoteId(newNote.id);

    if (onNotesChange) {
      onNotesChange(updatedNotes);
    }
  }, [notes, videoController, onNotesChange]);

  const handleNoteChange = useCallback(
    (noteId: string, content: Descendant[]) => {
      const updatedNotes = notes.map((note) => {
        if (note.id === noteId) {
          return {
            ...note,
            content,
            count: getContentLength(content),
          };
        }
        return note;
      });

      setNotes(updatedNotes);

      if (onNotesChange) {
        onNotesChange(updatedNotes);
      }
    },
    [notes, onNotesChange],
  );

  const handleNoteClick = useCallback(
    (noteId: string) => {
      const note = notes.find((n) => n.id === noteId);
      if (note) {
        videoController.seekTo(note.startTime);
        setActiveNoteId(noteId);
      }
    },
    [notes, videoController],
  );

  const handleToggleExpand = useCallback((noteId: string) => {
    setExpandedNoteId((prevId) => (prevId === noteId ? null : noteId));
  }, []);

  const handleDeleteNote = useCallback(
    (noteId: string) => {
      const updatedNotes = notes.filter((note) => note.id !== noteId);
      setNotes(updatedNotes);

      if (activeNoteId === noteId) {
        setActiveNoteId(null);
      }
      if (expandedNoteId === noteId) {
        setExpandedNoteId(null);
      }

      if (onNotesChange) {
        onNotesChange(updatedNotes);
      }
    },
    [notes, activeNoteId, expandedNoteId, onNotesChange],
  );

  return {
    videoRef,
    notes,
    activeNoteId,
    expandedNoteId,
    extensions,
    handleAddNote,
    handleNoteChange,
    handleNoteClick,
    handleToggleExpand,
    handleDeleteNote,
    setActiveNoteId,
    formatTime,
  };
};
