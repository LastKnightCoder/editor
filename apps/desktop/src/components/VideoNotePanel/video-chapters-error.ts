import diagnostics from "./video-chapters.diagnostics.json";
export class VideoChaptersFailure extends Error {
  constructor(readonly code: keyof typeof diagnostics) {
    super(diagnostics[code]);
    this.name = "VideoChaptersFailure";
  }
}
