import { fork } from "node:child_process";
import { createHash } from "node:crypto";
import { LIMITS, boundedText, exactKeys } from "./limits.mjs";

export function sourceDigest(source) {
  return createHash("sha256").update(source).digest("hex");
}

// 只供边界实证；授权来自宿主，不从客体消息推导安装身份。
export function startRestrictedProbe({ source, identity, declared, grant, read }) {
  if (!boundedText(source, LIMITS.sourceBytes)) throw new Error("INVALID_SOURCE");
  if (
    !exactKeys(identity, ["installationId", "workspaceId", "generation"]) ||
    !boundedText(identity.installationId, 128) ||
    !identity.installationId ||
    !boundedText(identity.workspaceId, 128) ||
    !identity.workspaceId ||
    !Number.isSafeInteger(identity.generation) ||
    identity.generation < 1
  )
    throw new Error("INVALID_IDENTITY");
  if (
    !Array.isArray(declared) ||
    declared.some(permission => permission !== "probe.read") ||
    new Set(declared).size !== declared.length
  )
    throw new Error("INVALID_PERMISSIONS");
  if (
    !exactKeys(grant, ["installationId", "workspaceId", "generation", "digest", "permissions"]) ||
    grant.installationId !== identity.installationId ||
    grant.workspaceId !== identity.workspaceId ||
    grant.generation !== identity.generation ||
    grant.digest !== sourceDigest(source) ||
    !Array.isArray(grant.permissions) ||
    grant.permissions.some(permission => permission !== "probe.read") ||
    declared.some(permission => !grant.permissions.includes(permission))
  )
    throw new Error("PERMISSION_DENIED");
  if (typeof read !== "function") throw new Error("INVALID_READER");

  const binding = Object.freeze({ ...identity, digest: grant.digest });
  const allowed = declared.includes("probe.read") && grant.permissions.includes("probe.read");
  const controller = new AbortController();
  const child = fork(new URL("./worker.mjs", import.meta.url), [], {
    execArgv: ["--max-old-space-size=64"],
    env: {},
    stdio: ["ignore", "ignore", "ignore", "ipc"],
    serialization: "json",
  });
  let active = true;
  let pending = 0;
  let sequence = 0;
  let outcome;
  let resolveResult;
  const result = new Promise(resolve => {
    resolveResult = resolve;
  });
  const deadline = setTimeout(() => finish({ ok: false, code: "TIMEOUT" }), LIMITS.lifetimeMs);

  function finish(value) {
    if (!active) return;
    active = false;
    outcome = value;
    clearTimeout(deadline);
    controller.abort();
    child.kill("SIGKILL");
  }

  function reply(requestId, value) {
    if (!active || !child.connected) return;
    const text = JSON.stringify(value);
    if (!boundedText(text)) return finish({ ok: false, code: "LIMIT_EXCEEDED" });
    child.send({ type: "reply", requestId, text }, error => {
      if (error) finish({ ok: false, code: "PROCESS_FAILED" });
    });
  }

  child.once("error", () => finish({ ok: false, code: "PROCESS_FAILED" }));
  // 结果在进程真正退出后交付，调用方不会误以为死循环已被清理。
  child.once("close", () => {
    clearTimeout(deadline);
    active = false;
    controller.abort();
    resolveResult({ ...(outcome ?? { ok: false, code: "PROCESS_FAILED" }), pid: child.pid });
  });
  child.on("message", message => {
    if (!active) return;
    if (exactKeys(message, ["type"]) && message.type === "ready") {
      if (sequence !== 0) return finish({ ok: false, code: "INVALID_MESSAGE" });
      sequence = 1;
      child.send({ type: "run", source }, error => {
        if (error) finish({ ok: false, code: "PROCESS_FAILED" });
      });
      return;
    }
    if (exactKeys(message, ["type", "text"]) && message.type === "result") {
      if (!boundedText(message.text)) return finish({ ok: false, code: "LIMIT_EXCEEDED" });
      try {
        finish({ ok: true, value: JSON.parse(message.text) });
      } catch {
        finish({ ok: false, code: "INVALID_RESULT" });
      }
      return;
    }
    if (exactKeys(message, ["type", "code"]) && message.type === "failure") {
      const code = ["EXECUTION_FAILED", "LIMIT_EXCEEDED"].includes(message.code)
        ? message.code
        : "INVALID_MESSAGE";
      finish({ ok: false, code });
      return;
    }
    if (
      !exactKeys(message, ["type", "requestId", "text"]) ||
      message.type !== "request" ||
      message.requestId !== sequence ||
      sequence > LIMITS.calls ||
      pending >= LIMITS.concurrentCalls ||
      !boundedText(message.text)
    )
      return finish({ ok: false, code: "INVALID_MESSAGE" });
    sequence += 1;
    let request;
    try {
      request = JSON.parse(message.text);
    } catch {
      return reply(message.requestId, { ok: false, code: "INVALID_REQUEST" });
    }
    if (!exactKeys(request, ["operation"]) || request.operation !== "probe.read")
      return reply(message.requestId, { ok: false, code: "INVALID_REQUEST" });
    if (!allowed) return reply(message.requestId, { ok: false, code: "PERMISSION_DENIED" });
    pending += 1;
    Promise.resolve()
      .then(() => {
        if (!active) throw new Error("INSTANCE_REVOKED");
        return read(binding, controller.signal);
      })
      .then(value => {
        if (!active) return;
        if (!boundedText(value, LIMITS.messageBytes / 2))
          return finish({ ok: false, code: "LIMIT_EXCEEDED" });
        reply(message.requestId, { ok: true, value });
      })
      .catch(() => reply(message.requestId, { ok: false, code: "SERVICE_FAILED" }))
      .finally(() => {
        pending -= 1;
      });
  });
  return Object.freeze({
    pid: child.pid,
    result,
    revoke: () => finish({ ok: false, code: "INSTANCE_REVOKED" }),
  });
}
