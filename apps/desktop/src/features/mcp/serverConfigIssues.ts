export type ServerConfigIssue =
  | {
      code:
        | "nameRequired"
        | "commandRequired"
        | "urlRequired"
        | "urlProtocol"
        | "notObject"
        | "sseUnsupported"
        | "missingTransport"
        | "invalidJson"
        | "invalidRoot"
        | "emptyConfig";
    }
  | { code: "unsupportedTransport"; transport: string };

export class ServerConfigError extends Error {
  constructor(
    public readonly issue: ServerConfigIssue,
    message: string
  ) {
    super(message);
  }
}
