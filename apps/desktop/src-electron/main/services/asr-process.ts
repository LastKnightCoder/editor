import { spawn } from "node:child_process";
import { ASRError, asrAbortError, throwIfASRAborted } from "@tau/asr";
import { parseLanguageFromLogs } from "../utils/transcription-language";

/** 只保留有界诊断缓冲，正文不写日志；取消必须等进程退出后才能清理文件。 */
export function runASRProcess(
  binary: string,
  args: string[],
  signal: AbortSignal,
  onProgress?: (message: string) => void
) {
  throwIfASRAborted(signal);
  return new Promise<{ language: ReturnType<typeof parseLanguageFromLogs> }>((resolve, reject) => {
    const child = spawn(binary, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    });
    let failure: unknown;
    let language: ReturnType<typeof parseLanguageFromLogs> = null;
    let previousProgress = -1;
    const cancel = () => child.kill("SIGKILL");
    const listen = (stream: typeof child.stdout) => {
      let pending = "";
      stream.setEncoding("utf8");
      stream.on("data", (chunk: string) => {
        pending = (pending + chunk).slice(-16384);
        language = parseLanguageFromLogs(pending) ?? language;
        const lines = pending.split(/[\r\n]/);
        pending = lines.pop() ?? "";
        if (signal.aborted) return;
        for (const line of lines) {
          const match = /(\d{1,3})%/.exec(line);
          if (!match) continue;
          const percent = Number(match[1]);
          if (percent <= 100 && percent !== previousProgress) {
            previousProgress = percent;
            try {
              onProgress?.(`正在转录 ... ${percent}%`);
            } catch (error) {
              failure = error;
              cancel();
            }
          }
        }
      });
    };
    listen(child.stdout);
    listen(child.stderr);
    signal.addEventListener("abort", cancel, { once: true });
    child.on("error", error => {
      failure = error;
    });
    child.on("close", code => {
      signal.removeEventListener("abort", cancel);
      if (signal.aborted) reject(asrAbortError());
      else if (failure) reject(failure);
      else if (code !== 0)
        reject(new ASRError("internal", `转录处理程序异常退出（${code ?? "信号终止"}）`));
      else resolve({ language });
    });
    if (signal.aborted) cancel();
  });
}
