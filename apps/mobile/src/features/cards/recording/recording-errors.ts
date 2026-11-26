import diagnostics from "./recording.diagnostics.json";

export function audioLimitParts(ms: number) {
  return ms >= 3_600_000
    ? { unit: "hours" as const, amount: Math.round((ms / 3_600_000) * 10) / 10 }
    : { unit: "minutes" as const, amount: Math.max(1, Math.round(ms / 60_000)) };
}

type RecordingFailureDetails =
  | { code: "RECORDING_AUDIO_UNRESOLVED" }
  | { code: "RECORDING_AUDIO_TOO_LONG"; limitMs: number };

export class RecordingFailure extends Error {
  readonly code: RecordingFailureDetails["code"];
  constructor(readonly details: RecordingFailureDetails) {
    const message =
      details.code === "RECORDING_AUDIO_UNRESOLVED"
        ? diagnostics.audioUnresolved
        : diagnostics.audioTooLong.replace(
            "{{limit}}",
            (() => {
              const { unit, amount } = audioLimitParts(details.limitMs);
              return diagnostics[unit].replace("{{number}}", String(amount));
            })()
          );
    super(message);
    this.code = details.code;
    this.name = "RecordingFailure";
  }
}
