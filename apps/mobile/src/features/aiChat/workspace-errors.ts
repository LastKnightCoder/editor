import { workspaceT } from "./workspace.binding";
export class WorkspaceError extends Error {
  constructor(
    public readonly code: "error.load" | "error.create",
    message: string
  ) {
    super(message);
    this.name = "WorkspaceError";
  }
}
export function workspaceErrorText(error: Error | null) {
  return error instanceof WorkspaceError ? workspaceT(error.code) : (error?.message ?? "");
}
