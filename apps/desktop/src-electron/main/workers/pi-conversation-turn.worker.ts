import { parentPort } from "node:worker_threads";
import type { ChatConversationTurn } from "@/types/pi-session";
import { ConversationTurnReader } from "../modules/pi-conversation-turn";

export interface ConversationTurnRequest {
  id: number;
  file: string;
  entryId: string;
}

export type ConversationTurnResponse = { id: number } & (
  | { turn: ChatConversationTurn | null }
  | { error: string }
);

const port = parentPort;
if (!port) throw new Error("对话预览缺少线程通信端口");
const reader = new ConversationTurnReader();
port.on("message", ({ id, file, entryId }: ConversationTurnRequest) => {
  try {
    port.postMessage({ id, turn: reader.read(file, entryId) } satisfies ConversationTurnResponse);
  } catch (error) {
    port.postMessage({
      id,
      error: error instanceof Error ? error.message : String(error),
    } satisfies ConversationTurnResponse);
  }
});
