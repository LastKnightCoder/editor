import diagnostics from "./video-cache-failure.diagnostics.json";
export type VideoCacheFailureCode = keyof typeof diagnostics;
export interface VideoCacheFailureData {
  code: VideoCacheFailureCode;
  message: string;
  params: Record<string, string | number | boolean | null>;
}
export type VideoCacheResponse<Result> =
  | { ok: true; value: Result }
  | { ok: false; failure: VideoCacheFailureData };
export class VideoCacheFailure extends Error {
  constructor(
    readonly code: VideoCacheFailureCode,
    readonly params: VideoCacheFailureData["params"] = {},
    options?: ErrorOptions & { message?: string }
  ) {
    super(
      options?.message ??
        diagnostics[code].replace(/{{(\w+)}}/g, (_token, key: string) => String(params[key] ?? "")),
      options
    );
    this.name = "VideoCacheFailure";
  }
  toData(): VideoCacheFailureData {
    return { code: this.code, message: this.message, params: this.params };
  }
}
export function unwrapVideoCacheResponse<Result>(response: VideoCacheResponse<Result>): Result {
  if (!response.ok)
    throw new VideoCacheFailure(response.failure.code, response.failure.params, {
      message: response.failure.message,
    });
  return response.value;
}
