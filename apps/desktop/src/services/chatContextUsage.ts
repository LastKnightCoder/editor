import type { ChatSessionMessage, ResponseMessage } from "@/types";

export function latestContextUsage(
  messages: ChatSessionMessage[],
  providerId?: string,
  model?: { id: string; name?: string }
) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "assistant") continue;
    const usage = (message as ResponseMessage).usage;
    if (!usage) continue;
    const matchesModel = usage.modelId
      ? usage.modelId === model?.id
      : !usage.modelName || usage.modelName === model?.id || usage.modelName === model?.name;
    return (!usage.providerId || usage.providerId === providerId) && matchesModel ? usage : null;
  }
  return null;
}
