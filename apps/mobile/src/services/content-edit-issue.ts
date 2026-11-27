export type ContentEditIssue =
  | { kind: "save-failed" | "collaboration-required" | "load-failed"; cause: unknown }
  | { kind: "refresh-conflict" | "view-conflict" | "pending-input" }
  | { kind: "operation-failed"; cause: unknown; message: string };
