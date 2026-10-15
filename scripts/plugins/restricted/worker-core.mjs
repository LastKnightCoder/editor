import { LIMITS, boundedText, exactKeys } from "./limits.mjs";

export function runWorker(QuickJS, channel) {
  const runtime = QuickJS.newRuntime();
  runtime.setMemoryLimit(LIMITS.memoryBytes);
  runtime.setMaxStackSize(LIMITS.stackBytes);
  const context = runtime.newContext();
  const pending = new Map();
  let started = false;
  let stopped = false;
  let calls = 0;
  let executionDeadline = Infinity;
  runtime.setInterruptHandler(() => Date.now() >= executionDeadline);

  function send(message) {
    channel.send(message);
  }

  function fail(code = "EXECUTION_FAILED") {
    if (stopped) return;
    stopped = true;
    send({ type: "failure", code });
  }

  function pump() {
    if (stopped) return;
    const result = runtime.executePendingJobs(64);
    if (result.error) {
      result.error.dispose();
      fail();
    } else if (runtime.hasPendingJob()) {
      setImmediate(pump);
    }
  }

  const callHandle = context.newFunction("hostCall", textHandle => {
    if (stopped) return context.undefined;
    // 不把客体对象传入 Node，字符串上限在进入 IPC 前再次检查。
    if (!textHandle || context.typeof(textHandle) !== "string") {
      fail("LIMIT_EXCEEDED");
      return context.undefined;
    }
    const text = context.getString(textHandle);
    if (!boundedText(text) || ++calls > LIMITS.calls || pending.size >= LIMITS.concurrentCalls) {
      fail("LIMIT_EXCEEDED");
      return context.undefined;
    }
    const promise = context.newPromise();
    pending.set(calls, promise);
    send({ type: "request", requestId: calls, text });
    return promise.handle;
  });
  context.setProp(context.global, "hostCall", callHandle);
  callHandle.dispose();

  const finishHandle = context.newFunction("__finish", textHandle => {
    if (stopped) return context.undefined;
    if (!textHandle || context.typeof(textHandle) !== "string") {
      fail("LIMIT_EXCEEDED");
      return context.undefined;
    }
    const text = context.getString(textHandle);
    if (!boundedText(text)) {
      fail("LIMIT_EXCEEDED");
    } else {
      stopped = true;
      send({ type: "result", text });
    }
    return context.undefined;
  });
  context.setProp(context.global, "__finish", finishHandle);
  finishHandle.dispose();
  const errorHandle = context.newFunction("__fail", () => {
    fail();
    return context.undefined;
  });
  context.setProp(context.global, "__fail", errorHandle);
  errorHandle.dispose();

  channel.onMessage(message => {
    if (stopped) return;
    if (exactKeys(message, ["type", "source"]) && message.type === "run" && !started) {
      if (!boundedText(message.source, LIMITS.sourceBytes)) return fail("LIMIT_EXCEEDED");
      started = true;
      executionDeadline = Date.now() + LIMITS.executionMs;
      // source 只进入客体解释器，绝不交给宿主 eval、Function 或模块加载器。
      const source = [
        "(function(finish, fail, stringify) {",
        "(async function() {",
        message.source,
        "\n})().then(value => finish(stringify(value)), fail).catch(fail);",
        "})(__finish, __fail, JSON.stringify);",
      ].join("\n");
      const result = context.evalCode(source, "plugin-probe.js", { type: "global" });
      if (result.error) {
        result.error.dispose();
        fail();
      } else {
        result.value.dispose();
        pump();
      }
      return;
    }
    if (
      exactKeys(message, ["type", "requestId", "text"]) &&
      message.type === "reply" &&
      boundedText(message.text) &&
      pending.has(message.requestId)
    ) {
      const promise = pending.get(message.requestId);
      pending.delete(message.requestId);
      const value = context.newString(message.text);
      promise.resolve(value);
      value.dispose();
      promise.dispose();
      pump();
      return;
    }
    fail();
  });
  send({ type: "ready" });
}
