import { createServiceId } from "@tau/editor/api/services";

/** 正文来源接管身份时，视图只消费已有 taskId，不参与补齐。 */
export const ITaskIdSource = createServiceId<{ managed: boolean }>("list.taskIdSource");

export function createTaskIdPatcher() {
  const seen = new Set<string>();
  return (
    node: Record<string, unknown>,
    context?: { identityKey?: string }
  ): Record<string, unknown> | null => {
    if (node.type !== "check-list-item") return null;
    const id = typeof node.taskId === "string" ? node.taskId : "";
    if (id && !seen.has(id)) {
      seen.add(id);
      return null;
    }
    const next = context?.identityKey ? `task-${context.identityKey}` : crypto.randomUUID();
    seen.add(next);
    return { taskId: next };
  };
}
