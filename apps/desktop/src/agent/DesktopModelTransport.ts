import type {
  AgentModelEvent,
  AgentModelTransport,
  AgentPreparedModelTurn,
  AgentToolCall,
} from "@tau/agent";

import { stream } from "@/commands";

const createAsyncQueue = <T>() => {
  const values: T[] = [];
  const waiters: Array<{
    resolve: (result: IteratorResult<T>) => void;
    reject: (error: unknown) => void;
  }> = [];
  let done = false;
  let error: unknown;

  const resolveNext = (result: IteratorResult<T>) => {
    const waiter = waiters.shift();
    if (waiter) {
      waiter.resolve(result);
      return true;
    }
    return false;
  };

  return {
    push(value: T) {
      if (done) {
        return;
      }
      if (!resolveNext({ value, done: false })) {
        values.push(value);
      }
    },
    finish() {
      if (done) {
        return;
      }
      done = true;
      while (resolveNext({ value: undefined as T, done: true })) {
        // 持续清空等待队列
      }
    },
    fail(nextError: unknown) {
      if (done) {
        return;
      }
      done = true;
      error = nextError;
      while (waiters.length > 0) {
        waiters.shift()?.reject(nextError);
      }
    },
    async *iterate() {
      while (true) {
        if (values.length > 0) {
          yield values.shift() as T;
          continue;
        }

        if (error) {
          throw error;
        }

        if (done) {
          return;
        }

        const next = await new Promise<IteratorResult<T>>((resolve, reject) => {
          waiters.push({ resolve, reject });
        });

        if (next.done) {
          return;
        }

        yield next.value;
      }
    },
  };
};

export class DesktopModelTransport implements AgentModelTransport {
  async *streamPreparedTurn(
    preparedTurn: AgentPreparedModelTurn,
  ): AsyncIterable<AgentModelEvent> {
    const queue = createAsyncQueue<AgentModelEvent>();
    let finalContent = "";
    let finalReasoning = "";

    void stream(
      preparedTurn.endpoint,
      preparedTurn.payload as object,
      preparedTurn.headers,
      preparedTurn.request.controller,
      preparedTurn.parser,
      {
        onUpdate: (responseText, fetchText, reasoningText) => {
          finalContent = responseText;
          finalReasoning = reasoningText || finalReasoning;
          queue.push({
            type: "text-delta",
            delta: fetchText,
          });
        },
        onReasoning: (responseText, fetchText) => {
          finalReasoning = responseText;
          queue.push({
            type: "reasoning-delta",
            delta: fetchText,
          });
        },
        onToolCallsDelta: (toolCalls) => {
          queue.push({
            type: "tool-calls-delta",
            toolCalls: toolCalls as AgentToolCall[],
          });
        },
        onFinish: (content, reasoningContent) => {
          finalContent = content;
          finalReasoning = reasoningContent;
        },
        deferAssistantTextUntilFinish:
          preparedTurn.request.deferAssistantTextUntilFinish,
        disableAnimation: preparedTurn.request.disableAnimation,
      },
    )
      .then((result) => {
        if (result.type === "tool_calls") {
          queue.push({
            type: "turn-complete",
            result: {
              type: "tool_calls",
              content: result.content,
              reasoningContent: result.reasoning_content,
              finishReason: "tool_calls",
              toolCalls: result.toolCalls as AgentToolCall[],
            },
          });
        } else {
          queue.push({
            type: "turn-complete",
            result: {
              type: "response",
              content: finalContent,
              reasoningContent: finalReasoning,
              finishReason: result.finishReason,
            },
          });
        }
        queue.finish();
      })
      .catch((error) => {
        queue.fail(error);
      });

    yield* queue.iterate();
  }
}
