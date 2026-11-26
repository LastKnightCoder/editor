import diagnostics from "./tts-workspace.diagnostics.json";
export class TtsWorkspaceFailure extends Error {
  constructor(
    readonly code: keyof typeof diagnostics,
    options?: ErrorOptions
  ) {
    super(diagnostics[code], options);
    this.name = "TtsWorkspaceFailure";
  }
}
