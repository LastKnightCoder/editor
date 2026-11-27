import diagnostics from "./video-host-failure.diagnostics.json";
export type VideoHostFailureCode = keyof typeof diagnostics;
export interface VideoHostFailureData {
  domain: "video-host";
  name: string;
  message: string;
  code?: VideoHostFailureCode;
  params?: { pluginId?: string };
}
export type VideoHostResponse<Result> =
  | { ok: true; value: Result }
  | { ok: false; failure: VideoHostFailureData };
/** An absent code carries a plugin diagnostic without assigning a host-owned meaning. */
export class VideoHostFailure extends Error {
  constructor(
    readonly code: VideoHostFailureCode | undefined,
    readonly params: { pluginId?: string } = {},
    options?: { message?: string; name?: string }
  ) {
    super(
      options?.message ??
        (code ? diagnostics[code].replace("{{pluginId}}", () => params.pluginId ?? "") : "")
    );
    this.name = options?.name ?? "Error";
  }
  toData(): VideoHostFailureData {
    return {
      domain: "video-host",
      name: this.name,
      message: this.message,
      ...(this.code
        ? {
            code: this.code,
            ...(this.code === "providerMissing" && typeof this.params.pluginId === "string"
              ? { params: { pluginId: this.params.pluginId } }
              : {}),
          }
        : {}),
    };
  }
}
export function videoHostFailureData(error: unknown): VideoHostFailureData {
  if (error instanceof VideoHostFailure) return error.toData();
  const native =
    error instanceof Error ||
    (typeof DOMException !== "undefined" && error instanceof DOMException);
  return {
    domain: "video-host",
    name: native ? error.name : "Error",
    message: native ? error.message : String(error),
  };
}
export function videoHostFailureFromData(data: VideoHostFailureData): VideoHostFailure {
  const code = data.code && Object.hasOwn(diagnostics, data.code) ? data.code : undefined;
  return new VideoHostFailure(code, data.params, { name: data.name, message: data.message });
}
export function unwrapVideoHostResponse<Result>(response: VideoHostResponse<Result>): Result {
  if (!response.ok) throw videoHostFailureFromData(response.failure);
  return response.value;
}
