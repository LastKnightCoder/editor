import diagnostics from "./tts-capability.diagnostics.json";
export class TtsCapabilityFailure extends Error {
  constructor(readonly code: keyof typeof diagnostics) {
    super(diagnostics[code]);
    this.name = code === "cloneUnsupported" ? "Error" : "AbortError";
  }
}
