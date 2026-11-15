import { join } from "node:path";
import { Worker } from "node:worker_threads";
import type { ChatConversationTurn } from "@/types/pi-session";
import type {
  ConversationTurnRequest,
  ConversationTurnResponse,
} from "../workers/pi-conversation-turn.worker";

type ReadTurn = ChatConversationTurn | null;

export function createConversationTurnClient(
  workerPath = join(__dirname, "pi-conversation-turn-worker.js")
) {
  let worker: Worker | undefined;
  let nextId = 0;
  const pending = new Map<
    number,
    { resolve: (turn: ReadTurn) => void; reject: (error: Error) => void }
  >();

  const start = () => {
    const thread = new Worker(workerPath);
    const fail = (error: Error) => {
      if (worker !== thread) return;
      worker = undefined;
      for (const request of pending.values()) request.reject(error);
      pending.clear();
    };
    thread.on("message", (response: ConversationTurnResponse) => {
      const request = pending.get(response.id);
      if (!request) return;
      pending.delete(response.id);
      if (!pending.size) thread.unref();
      if ("error" in response) request.reject(new Error(response.error));
      else request.resolve(response.turn);
    });
    thread.once("error", fail);
    thread.once("exit", code => fail(new Error(`对话预览线程已退出（${code}）`)));
    return thread;
  };

  return async (file: string | undefined, entryId: string): Promise<ReadTurn> => {
    if (!file) return null;
    const thread = (worker ??= start());
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      thread.ref();
      pending.set(id, { resolve, reject });
      try {
        thread.postMessage({ id, file, entryId } satisfies ConversationTurnRequest);
      } catch (error) {
        pending.delete(id);
        if (!pending.size) thread.unref();
        reject(error);
      }
    });
  };
}

export const readConversationTurn = createConversationTurnClient();
