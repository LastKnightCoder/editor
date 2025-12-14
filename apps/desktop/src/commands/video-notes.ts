import { invoke } from "@/electron";
import { VideoNote, TranscriptSegment } from "@/types";

export const createEmptyVideoNote = async (
  metaInfo: VideoNote["metaInfo"],
): Promise<VideoNote | null> => {
  try {
    const result = await invoke("create-empty-video-note", metaInfo);
    return result;
  } catch (error) {
    console.error(error);
    return null;
  }
};

export const updateVideoNote = async (
  note: { id: number; metaInfo?: VideoNote["metaInfo"] },
): Promise<VideoNote | null> => {
  try {
    const result = await invoke("update-video-note", note);
    return result;
  } catch (error) {
    console.error(error);
    return null;
  }
};

export const deleteVideoNote = async (id: number): Promise<number | null> => {
  try {
    const result = await invoke("delete-video-note", id);
    return result;
  } catch (error) {
    console.error(error);
    return null;
  }
};

export const getVideoNoteById = async (
  id: number,
): Promise<VideoNote | null> => {
  try {
    const result = await invoke("get-video-note-by-id", id);
    return result;
  } catch (error) {
    console.error(error);
    return null;
  }
};

export const getAllVideoNotes = async (): Promise<VideoNote[]> => {
  try {
    const result = await invoke("get-all-video-notes");
    return result;
  } catch (error) {
    console.error(error);
    return [];
  }
};

export const updateVideoNoteDescription = async (
  id: number,
  description: string,
): Promise<VideoNote | null> => {
  try {
    const result = await invoke("update-video-note-description", {
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
  transcriptWordSegments?: TranscriptSegment[],
): Promise<VideoNote | null> => {
  try {
    const result = await invoke("update-video-note-transcript", {
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
