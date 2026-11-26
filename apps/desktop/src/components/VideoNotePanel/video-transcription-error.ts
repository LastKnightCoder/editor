import diagnostics from "./video-transcription.diagnostics.json";
export class VideoTranscriptionFailure extends Error {
  constructor(readonly code: keyof typeof diagnostics) {
    super(diagnostics[code]);
    this.name = "VideoTranscriptionFailure";
  }
}
