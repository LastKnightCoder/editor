import { invoke } from "@/electron";
import { AudioNote, TranscriptSegment } from "@/types";

export const createEmptyAudioNote = async (
  metaInfo: AudioNote["metaInfo"]
): Promise<AudioNote | null> => {
  try {
    const result = await invoke<AudioNote | null>("create-empty-audio-note", metaInfo);
    return result;
  } catch (error) {
    console.error(error);
    return null;
  }
};

export const updateAudioNote = async (note: {
  id: number;
  metaInfo?: AudioNote["metaInfo"];
}): Promise<AudioNote | null> => {
  try {
    const result = await invoke<AudioNote | null>("update-audio-note", note);
    return result;
  } catch (error) {
    console.error(error);
    return null;
  }
};

export const deleteAudioNote = async (id: number): Promise<number | null> => {
  try {
    const result = await invoke<number>("delete-audio-note", id);
    return result;
  } catch (error) {
    console.error(error);
    return null;
  }
};

export const getAudioNoteById = async (id: number): Promise<AudioNote | null> => {
  try {
    const result = await invoke<AudioNote | null>("get-audio-note-by-id", id);
    return result;
  } catch (error) {
    console.error(error);
    return null;
  }
};

export const getAllAudioNotes = async (): Promise<AudioNote[]> => {
  try {
    const result = await invoke<AudioNote[]>("get-all-audio-notes");
    return result;
  } catch (error) {
    console.error(error);
    return [];
  }
};

export const updateAudioNoteDescription = async (
  id: number,
  description: string
): Promise<AudioNote | null> => {
  try {
    const result = await invoke<AudioNote | null>("update-audio-note-description", {
      id,
      description,
    });
    return result;
  } catch (error) {
    console.error(error);
    return null;
  }
};

export const updateAudioNoteTranscript = async (
  id: number,
  transcript: string,
  transcriptSegments?: TranscriptSegment[],
  transcriptWordSegments?: TranscriptSegment[]
): Promise<AudioNote | null> => {
  try {
    const result = await invoke<AudioNote | null>("update-audio-note-transcript", {
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

export const updateAudioNoteSummary = async (
  id: number,
  summary: string
): Promise<AudioNote | null> => {
  try {
    const result = await invoke<AudioNote | null>("update-audio-note-summary", { id, summary });
    return result;
  } catch (error) {
    console.error(error);
    return null;
  }
};

export const updateAudioNoteHighlights = async (
  id: number,
  highlights: AudioNote["highlights"]
): Promise<AudioNote | null> => {
  try {
    const result = await invoke<AudioNote | null>("update-audio-note-highlights", {
      id,
      highlights,
    });
    return result;
  } catch (error) {
    console.error(error);
    return null;
  }
};

export const updateAudioNoteInsights = async (
  id: number,
  insights: AudioNote["insights"]
): Promise<AudioNote | null> => {
  try {
    const result = await invoke<AudioNote | null>("update-audio-note-insights", { id, insights });
    return result;
  } catch (error) {
    console.error(error);
    return null;
  }
};

export const updateAudioNoteSpeakers = async (
  id: number,
  speakers: AudioNote["speakers"]
): Promise<AudioNote | null> => {
  try {
    const result = await invoke<AudioNote | null>("update-audio-note-speakers", { id, speakers });
    return result;
  } catch (error) {
    console.error(error);
    return null;
  }
};

export const updateAudioNoteChapters = async (
  id: number,
  chapters: AudioNote["chapters"]
): Promise<AudioNote | null> => {
  try {
    const result = await invoke<AudioNote | null>("update-audio-note-chapters", { id, chapters });
    return result;
  } catch (error) {
    console.error(error);
    return null;
  }
};
