import { invoke } from "@/electron";
import { VideoNote, TranscriptSegment } from "@/types";
import type { VideoCaptions } from "@tau/plugins";

export const importVideoNoteCaptions = (
  id: number,
  expectedUpdateTime: number,
  captions: VideoCaptions
): Promise<VideoNote | null> =>
  invoke("import-video-note-captions", { id, expectedUpdateTime, captions });

export const createEmptyVideoNote = async (
  metaInfo: VideoNote["metaInfo"]
): Promise<VideoNote | null> => {
  try {
    const result = await invoke<VideoNote | null>("create-empty-video-note", metaInfo);
    return result;
  } catch (error) {
    console.error(error);
    return null;
  }
};

export const updateVideoNote = async (note: {
  id: number;
  metaInfo?: VideoNote["metaInfo"];
}): Promise<VideoNote | null> => {
  try {
    const result = await invoke<VideoNote | null>("update-video-note", note);
    return result;
  } catch (error) {
    console.error(error);
    return null;
  }
};

export const deleteVideoNote = async (id: number): Promise<number | null> => {
  try {
    const result = await invoke<number>("delete-video-note", id);
    return result;
  } catch (error) {
    console.error(error);
    return null;
  }
};

export const getVideoNoteById = async (id: number): Promise<VideoNote | null> => {
  try {
    const result = await invoke<VideoNote | null>("get-video-note-by-id", id);
    return result;
  } catch (error) {
    console.error(error);
    return null;
  }
};

export const getAllVideoNotes = async (): Promise<VideoNote[]> => {
  try {
    const result = await invoke<VideoNote[]>("get-all-video-notes");
    return result;
  } catch (error) {
    console.error(error);
    return [];
  }
};

export const updateVideoNoteDescription = async (
  id: number,
  description: string
): Promise<VideoNote | null> => {
  try {
    const result = await invoke<VideoNote | null>("update-video-note-description", {
      id,
      description,
    });
    return result;
  } catch (error) {
    console.error(error);
    return null;
  }
};

export const updateVideoNoteTranscript = async (
  id: number,
  transcript: string,
  transcriptSegments?: TranscriptSegment[],
  transcriptWordSegments?: TranscriptSegment[]
): Promise<VideoNote | null> => {
  try {
    const result = await invoke<VideoNote | null>("update-video-note-transcript", {
      id,
      transcript,
      transcriptSegments,
      transcriptWordSegments,
    });
    return result;
  } catch (error) {
    console.error(error);
    return null;
  }
};

export const updateVideoNoteHighlights = async (
  id: number,
  highlights: VideoNote["highlights"]
): Promise<VideoNote | null> => {
  try {
    const result = await invoke<VideoNote | null>("update-video-note-highlights", {
      id,
      highlights,
    });
    return result;
  } catch (error) {
    console.error(error);
    return null;
  }
};

export const updateVideoNoteInsights = async (
  id: number,
  insights: VideoNote["insights"]
): Promise<VideoNote | null> => {
  try {
    const result = await invoke<VideoNote | null>("update-video-note-insights", {
      id,
      insights,
    });
    return result;
  } catch (error) {
    console.error(error);
    return null;
  }
};
