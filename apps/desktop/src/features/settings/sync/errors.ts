export type SyncIssueCode =
  | "RESOURCE_SYNC_CONFIG_MISSING"
  | "RESOURCE_SYNC_FAILED"
  | "RESOURCE_SYNC_STOP_FAILED";
export class SyncOperationError extends Error {
  constructor(
    readonly code: SyncIssueCode,
    message: string,
    readonly params?: { reason: string }
  ) {
    super(message);
    this.name = "SyncOperationError";
  }
}
