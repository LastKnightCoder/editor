import diagnostics from "./video-selector.diagnostics.json";
export class VideoSelectionFailure extends Error {
  constructor(
    readonly code: keyof typeof diagnostics,
    readonly params: { provider?: string } = {},
    options?: ErrorOptions
  ) {
    super(
      diagnostics[code].replace("{{provider}}", () => params.provider ?? ""),
      options
    );
    this.name = "VideoSelectionFailure";
  }
}
