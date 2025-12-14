import ffmpeg from "fluent-ffmpeg";
import * as path from "path";
import * as fs from "fs/promises";

export default class MediaUtil {
  static async mergeVideoAndAudio(
    videoPath: string,
    audioPath: string,
    outputPath: string,
    onProgress: (progress: number) => void,
  ) {
    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .input(audioPath)
        .outputOptions(["-c:v copy", "-c:a copy", "-shortest"])
        .on("progress", (progress) => {
          onProgress(progress.percent || 0);
        })
        .on("end", () => {
          resolve(true);
        })
        .on("error", (err) => {
          console.error("merge error", err);
          reject(err);
        })
        .save(outputPath);
    });
  }

  static async replaceAudioSegment(
    originalAudioPath: string,
    newSegmentPath: string,
    outputPath: string,
    startTime: number,
    originalDuration: number,
    onProgress?: (progress: number) => void,
  ): Promise<void> {
    const tempDir = path.dirname(outputPath);
    const beforePath = path.join(tempDir, `before-${Date.now()}.mp3`);
    const afterPath = path.join(tempDir, `after-${Date.now()}.mp3`);
    const newSegmentMp3Path = path.join(
      tempDir,
      `new-segment-${Date.now()}.mp3`,
    );
    const concatListPath = path.join(tempDir, `concat-${Date.now()}.txt`);

    const endTime = startTime + originalDuration;

    try {
      // 转换新片段为 mp3 格式
      await new Promise((resolve, reject) => {
        ffmpeg(newSegmentPath)
          .audioCodec("libmp3lame")
          .audioBitrate("192k")
          .output(newSegmentMp3Path)
          .on("end", resolve)
          .on("error", reject)
          .run();
      });
      if (startTime > 0) {
        await new Promise((resolve, reject) => {
          ffmpeg(originalAudioPath)
            .setStartTime(0)
            .setDuration(startTime)
            .audioCodec("libmp3lame")
            .audioBitrate("192k")
            .output(beforePath)
            .on("end", resolve)
            .on("error", reject)
            .run();
        });
      }

      await new Promise((resolve, reject) => {
        ffmpeg(originalAudioPath)
          .setStartTime(endTime)
          .audioCodec("libmp3lame")
          .audioBitrate("192k")
          .output(afterPath)
          .on("end", resolve)
          .on("error", reject)
          .run();
      });

      const concatList = [];
      if (startTime > 0)
        concatList.push(`file '${beforePath.replace(/\\/g, "/")}'`);
      concatList.push(`file '${newSegmentMp3Path.replace(/\\/g, "/")}'`);
      concatList.push(`file '${afterPath.replace(/\\/g, "/")}'`);

      await fs.writeFile(concatListPath, concatList.join("\n"));

      await new Promise((resolve, reject) => {
        ffmpeg()
          .input(concatListPath)
          .inputOptions(["-f", "concat", "-safe", "0"])
          .audioCodec("libmp3lame")
          .audioBitrate("192k")
          .on("progress", (progress) => {
            if (onProgress) onProgress(progress.percent || 0);
          })
          .on("end", resolve)
          .on("error", reject)
          .save(outputPath);
      });

      if (startTime > 0) await fs.unlink(beforePath).catch(() => {});
      await fs.unlink(afterPath).catch(() => {});
      await fs.unlink(newSegmentMp3Path).catch(() => {});
      await fs.unlink(concatListPath).catch(() => {});
    } catch (error) {
      if (startTime > 0) await fs.unlink(beforePath).catch(() => {});
      await fs.unlink(afterPath).catch(() => {});
      await fs.unlink(newSegmentMp3Path).catch(() => {});
      await fs.unlink(concatListPath).catch(() => {});
      throw error;
    }
  }

  static async extractAudioSegment(
    audioPath: string,
    outputPath: string,
    startTime: number,
    duration: number,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(audioPath)
        .setStartTime(startTime)
        .setDuration(duration)
        .audioCodec("libmp3lame")
        .audioBitrate("192k")
        .output(outputPath)
        .on("end", () => resolve())
        .on("error", reject)
        .run();
    });
  }

  static async extractAudioFromVideo(
    videoPath: string,
    outputPath: string,
    onProgress?: (progress: number) => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .noVideo()
        .audioCodec("libmp3lame")
        .audioBitrate("192k")
        .on("progress", (progress) => {
          if (onProgress) onProgress(progress.percent || 0);
        })
        .on("end", () => resolve())
        .on("error", reject)
        .output(outputPath)
        .run();
    });
  }

  /**
   * 为转录优化的音频提取
   * - 16kHz 采样率 (Whisper 原生支持)
   * - 单声道
   * - 低比特率 (语音识别不需要高保真)
   * 这比标准提取快 2-3 倍
   */
  static async extractAudioForTranscription(
    videoPath: string,
    outputPath: string,
    onProgress?: (progress: number) => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .noVideo()
        .audioChannels(1) // 单声道
        .audioFrequency(16000) // 16kHz - Whisper 原生采样率
        .audioCodec("libmp3lame")
        .audioBitrate("64k") // 语音识别不需要高比特率
        .on("progress", (progress) => {
          if (onProgress) onProgress(progress.percent || 0);
        })
        .on("end", () => resolve())
        .on("error", reject)
        .output(outputPath)
        .run();
    });
  }
}
