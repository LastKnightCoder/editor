import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { access } from "node:fs/promises";
import { release } from "node:os";
import path from "node:path";
import { app } from "electron";
import {
  ASRError,
  createASRStreamSession,
  MAC_NATIVE_ASR_DEFAULTS,
  waitForASR,
  type ASRAvailability,
  type ASRRunOptions,
  type ASRSegment,
  type ASRTranscript,
} from "@tau/asr";

type NativeMessage = {
  event: string;
  state?: ASRAvailability["state"];
  reason?: string;
  message?: string;
  code?: string;
  startIndex?: number;
  deleteCount?: number;
  segments?: ASRSegment[];
  transcript?: ASRTranscript;
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  void promise.catch(() => undefined);
  return { promise, resolve, reject };
}
export class NativeSpeechService {
  private children = new Set<ChildProcessWithoutNullStreams>();
  constructor(
    private readonly binary = path.join(
      app.isPackaged ? process.resourcesPath : path.join(app.getAppPath(), "build"),
      "bin/darwin/Tau Speech Helper.app/Contents/MacOS/tau-speech"
    )
  ) {}
  private async check() {
    if (process.platform !== "darwin" || Number(release().split(".")[0]) < 25)
      throw new ASRError("unsupported", "当前系统尚未提供原生语音输入，请选择识别插件");
    try {
      await access(this.binary);
    } catch {
      throw new ASRError("unavailable", "系统语音助手未安装，请重新构建或更新应用");
    }
  }
  private start(
    command: string,
    language: string,
    signal: AbortSignal,
    receive: (message: NativeMessage) => void
  ) {
    signal.throwIfAborted();
    const child = spawn(this.binary, [command, language], { stdio: ["pipe", "pipe", "pipe"] });
    this.children.add(child);
    const completion = deferred<void>();
    let failure: unknown;
    let pending = "";
    const cancel = () => {
      child.kill("SIGKILL");
    };
    signal.addEventListener("abort", cancel, { once: true });
    child.stdout.setEncoding("utf8");
    child.stderr.resume();
    child.stdout.on("data", (chunk: string) => {
      pending += chunk;
      if (pending.length > 1024 * 1024) {
        failure = new Error("系统识别响应过大");
        cancel();
        return;
      }
      let newline: number;
      while ((newline = pending.indexOf("\n")) >= 0) {
        const line = pending.slice(0, newline);
        pending = pending.slice(newline + 1);
        try {
          const message = JSON.parse(line) as NativeMessage;
          if (message.event === "error")
            throw new ASRError(
              message.code === "needsAssets" ? "needs-assets" : "internal",
              message.message ?? "系统识别失败"
            );
          if (!signal.aborted) receive(message);
        } catch (error) {
          failure = error;
          cancel();
        }
      }
    });
    child.on("error", error => {
      failure = error;
    });
    child.stdin.on("error", error => {
      failure = error;
      cancel();
    });
    child.on("close", code => {
      this.children.delete(child);
      signal.removeEventListener("abort", cancel);
      if (signal.aborted) completion.reject(new ASRError("cancelled", "语音输入已取消"));
      else if (failure) completion.reject(failure);
      else if (code !== 0) completion.reject(new Error("系统语音助手异常退出"));
      else completion.resolve();
    });
    return {
      child,
      closed: completion.promise,
      async write(value: unknown) {
        signal.throwIfAborted();
        await new Promise<void>((resolve, reject) =>
          child.stdin.write(JSON.stringify(value) + "\n", error =>
            error ? reject(error) : resolve()
          )
        );
      },
    };
  }
  async availability(
    language: string,
    prepare: boolean,
    signal: AbortSignal
  ): Promise<ASRAvailability> {
    const facts = {
      execution: "device" as const,
      textUpdates: "partial" as const,
      timestamps: "segment" as const,
      speakerLabels: false,
      acceptedAudio: { streamFormats: [MAC_NATIVE_ASR_DEFAULTS.format] },
      maxDurationMs: 120_000,
    };
    try {
      await this.check();
    } catch (error) {
      if (!prepare)
        return {
          ...facts,
          state:
            error instanceof ASRError && error.code === "unsupported"
              ? "unsupported"
              : "unavailable",
          reason: error instanceof Error ? error.message : "系统不可用",
        };
      throw error;
    }
    let value: NativeMessage | undefined;
    const process = this.start(prepare ? "prepare" : "probe", language, signal, message => {
      if (message.event === "availability") value = message;
    });
    await process.closed;
    if (!value?.state) throw new Error("系统语音助手未返回状态");
    return { ...facts, state: value.state, reason: value.reason };
  }
  async open(language: string, options: ASRRunOptions) {
    await this.check();
    const ready = deferred<void>();
    const lifetime = new AbortController();
    const signal = AbortSignal.any([options.signal, lifetime.signal]);
    let failure: unknown;
    const session = createASRStreamSession(
      { ...options, signal },
      MAC_NATIVE_ASR_DEFAULTS.format,
      async (signal, emit) => {
        const final = deferred<ASRTranscript>();
        let revision = 0;
        let receivedResult = false;
        const process = this.start("recognize", language, signal, message => {
          if (message.event === "ready") ready.resolve();
          else if (message.event === "update") {
            if (
              message.startIndex === undefined ||
              message.deleteCount === undefined ||
              !Array.isArray(message.segments)
            )
              throw new ASRError("protocol", "系统识别分段响应不完整");
            emit({
              type: "segments",
              baseRevision: revision,
              revision: ++revision,
              startIndex: message.startIndex,
              deleteCount: message.deleteCount,
              segments: message.segments,
            });
          } else if (message.event === "result" && message.transcript) {
            receivedResult = true;
            final.resolve(message.transcript);
          }
        });
        const fail = (error: unknown) => {
          failure = error;
          ready.reject(error);
          final.reject(error);
          lifetime.abort();
        };
        void process.closed.then(() => {
          if (!receivedResult) fail(new Error("系统识别未返回最终文字"));
        }, fail);
        return {
          async write(frame) {
            await process.write({
              type: "audio",
              seq: frame.seq,
              data: Buffer.from(frame.data).toString("base64"),
            });
          },
          async finish() {
            await process.write({ type: "end" });
            process.child.stdin.end();
            await process.closed;
            return final.promise;
          },
          async dispose() {
            if (process.child.exitCode === null) process.child.kill("SIGKILL");
            await process.closed.catch(() => undefined);
          },
        };
      }
    );
    const result = session.result.catch(error => {
      throw failure ?? error;
    });
    void result.catch(ready.reject);
    try {
      await waitForASR(ready.promise, options.signal);
      return { ...session, result };
    } catch (error) {
      await session.cancel();
      throw error;
    }
  }
  dispose() {
    for (const child of this.children) child.kill("SIGKILL");
  }
}
