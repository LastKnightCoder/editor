import ffmpeg from "fluent-ffmpeg";

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
}
