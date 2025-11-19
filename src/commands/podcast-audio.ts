import { invoke } from "@/electron";

export async function replacePodcastSegment(
  originalAudioPath: string,
  newSegmentPath: string,
  startTime: number,
  originalDuration: number,
): Promise<{ outputPath: string }> {
  return await invoke("replace_podcast_segment", {
    originalAudioPath,
    newSegmentPath,
    startTime,
    originalDuration,
  });
}

export async function extractPodcastSegment(
  audioPath: string,
  startTime: number,
  duration: number,
): Promise<{ outputPath: string }> {
  return await invoke("extract_podcast_segment", {
    audioPath,
    startTime,
    duration,
  });
}

export async function saveTempSegment(
  buffer: ArrayBuffer,
): Promise<{ tempPath: string }> {
  return await invoke("save_temp_segment", { buffer });
}
