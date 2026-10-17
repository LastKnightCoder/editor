import { fork, spawn, type Serializable } from "node:child_process";

/** 取消等待不终止共享二进制下载，其他调用仍可复用准备结果。 */
export function waitForCompiler<T>(prepare: () => Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const cancel = () => reject(signal.reason);
    signal.addEventListener("abort", cancel, { once: true });
    Promise.resolve()
      .then(prepare)
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", cancel));
  });
}

/** 一次任务独占子进程；取消和完成都回收，避免编译器故障影响其他任务。 */
export function runCompilerWorker<T>(
  file: string,
  payload: Serializable,
  signal: AbortSignal
): Promise<T> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = fork(file, {
      execPath: process.execPath,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      stdio: ["ignore", "ignore", "pipe", "ipc"],
    });
    let log = "";
    let result: T;
    let received = false;
    let failure: Error | undefined;
    child.stderr?.on("data", chunk => {
      log = (log + String(chunk)).slice(-65536);
    });
    const cancel = () => child.kill("SIGKILL");
    signal.addEventListener("abort", cancel, { once: true });
    child.on("message", (message: { ok: boolean; value?: T; error?: string; css?: string }) => {
      if (received || failure) return;
      if (message.ok) {
        result = (message.value ?? { css: message.css }) as T;
        received = true;
      } else failure = new Error(message.error || log || "编译失败");
      child.kill("SIGKILL");
    });
    child.on("error", error => {
      failure = error;
      child.kill("SIGKILL");
    });
    child.on("close", () => {
      signal.removeEventListener("abort", cancel);
      if (signal.aborted) reject(signal.reason);
      else if (failure) reject(new Error([failure.message, log].filter(Boolean).join("\n")));
      else if (received) resolve(result);
      else reject(new Error(log || "编译进程退出但未返回结果"));
    });
    child.send(payload, error => {
      if (error) {
        failure = error;
        child.kill("SIGKILL");
      }
    });
    if (signal.aborted) cancel();
  });
}

export function runMediaProcess(
  binary: string,
  args: string[],
  cwd: string,
  signal: AbortSignal,
  onProgress?: (time: number) => void
): Promise<{ stdout: string; log: string }> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      cwd,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "",
      log = "",
      progress = "";
    let failure: Error | undefined;
    const cancel = () => child.kill("SIGKILL");
    signal.addEventListener("abort", cancel, { once: true });
    child.stdout.on("data", chunk => {
      const text = String(chunk);
      stdout += text;
      if (stdout.length > 8 * 1024 * 1024) {
        failure = new Error("媒体探测输出过大");
        cancel();
      }
      if (!onProgress) return;
      progress += text;
      const lines = progress.split(/\r?\n/);
      progress = lines.pop() ?? "";
      for (const line of lines) {
        const match = /^out_time_us=(\d+)$/.exec(line);
        if (match) onProgress(Number(match[1]) / 1e6);
      }
      stdout = "";
    });
    child.stderr.on("data", chunk => {
      log = (log + String(chunk)).slice(-65536);
    });
    child.on("error", error => {
      failure = error;
    });
    child.on("close", code => {
      signal.removeEventListener("abort", cancel);
      if (signal.aborted) reject(signal.reason);
      else if (failure) reject(failure);
      else if (code !== 0) reject(new Error(log || `媒体进程退出：${code}`));
      else resolve({ stdout, log });
    });
    if (signal.aborted) cancel();
  });
}
