import diagnostics from "./remote-video-failure.diagnostics.json";
export type RemoteVideoFailureCode = keyof typeof diagnostics;
export interface RemoteVideoFailureData {
  code: RemoteVideoFailureCode;
  message: string;
  params: Record<string, string | number | boolean | null>;
}
export type RemoteVideoResponse<Result> =
  | { ok: true; value: Result }
  | { ok: false; failure: RemoteVideoFailureData };
export class RemoteVideoFailure extends Error {
  constructor(
    readonly code: RemoteVideoFailureCode,
    readonly params: RemoteVideoFailureData["params"] = {},
    options?: ErrorOptions & { message?: string }
  ) {
    super(
      options?.message ??
        diagnostics[code].replace(/{{(\w+)}}/g, (_token, key: string) => String(params[key] ?? "")),
      options
    );
    this.name = "RemoteVideoFailure";
  }
  toData(): RemoteVideoFailureData {
    return { code: this.code, message: this.message, params: this.params };
  }
}
export function unwrapRemoteVideoResponse<Result>(response: RemoteVideoResponse<Result>): Result {
  if (!response.ok)
    throw new RemoteVideoFailure(response.failure.code, response.failure.params, {
      message: response.failure.message,
    });
  return response.value;
}
