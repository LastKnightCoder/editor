import { sidebarT } from "./sidebar.binding";
import type { SidebarMessageKey } from "./sidebar.messages";
export class SidebarError extends Error {
  constructor(
    public readonly code:
      | "error.send"
      | "error.busy"
      | "error.compact"
      | "error.tree"
      | "config.required"
      | "error.create"
      | "error.cleanup",
    message: string
  ) {
    super(message);
    this.name = "SidebarError";
  }
}
export function sidebarErrorText(error: unknown, fallback: SidebarMessageKey = "error.request") {
  if (error instanceof SidebarError) return sidebarT(error.code);
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error.trim();
  return sidebarT(fallback);
}
