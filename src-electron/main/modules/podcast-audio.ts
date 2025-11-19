import { ipcMain } from "electron";
import * as path from "path";
import * as fs from "fs/promises";
import MediaUtil from "../utils/MediaUtil";
import PathUtil from "../utils/PathUtil";

export async function init() {
  ipcMain.handle(
    "replace_podcast_segment",
    async (
      _event,
      {
        originalAudioPath,
        newSegmentPath,
        startTime,
        originalDuration,
      }: {
        originalAudioPath: string;
        newSegmentPath: string;
        startTime: number;
        originalDuration: number;
      },
    ) => {
      const tempDir = path.join(PathUtil.getAppDir(), "podcast-temp");
      await fs.mkdir(tempDir, { recursive: true });

      const outputPath = path.join(tempDir, `replaced-${Date.now()}.mp3`);

      await MediaUtil.replaceAudioSegment(
        originalAudioPath,
        newSegmentPath,
        outputPath,
        startTime,
        originalDuration,
      );

      return { outputPath };
    },
  );

  ipcMain.handle(
    "extract_podcast_segment",
    async (
      _event,
      {
        audioPath,
        startTime,
        duration,
      }: {
        audioPath: string;
        startTime: number;
        duration: number;
      },
    ) => {
      const tempDir = path.join(PathUtil.getAppDir(), "podcast-temp");
      await fs.mkdir(tempDir, { recursive: true });

      const outputPath = path.join(tempDir, `segment-${Date.now()}.mp3`);

      await MediaUtil.extractAudioSegment(
        audioPath,
        outputPath,
        startTime,
        duration,
      );

      return { outputPath };
    },
  );

  ipcMain.handle(
    "save_temp_segment",
    async (_event, { buffer }: { buffer: ArrayBuffer }) => {
      const tempDir = path.join(PathUtil.getAppDir(), "podcast-temp");
      await fs.mkdir(tempDir, { recursive: true });
      const tempPath = path.join(tempDir, `temp-segment-${Date.now()}.wav`);
      await fs.writeFile(tempPath, Buffer.from(buffer));
      return { tempPath };
    },
  );
}

export default { init };
