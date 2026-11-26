import diagnostics from "./video-source.diagnostics.json";
export class VideoProviderMissing extends Error {
  readonly code = "providerMissing";
  constructor(readonly providerId: string) {
    super(diagnostics.providerMissing.replace("{{provider}}", () => providerId));
    this.name = "VideoProviderMissing";
  }
}
