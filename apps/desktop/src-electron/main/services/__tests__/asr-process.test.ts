// @vitest-environment node
import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { runASRProcess } from "../asr-process";

describe("ASR 子进程", () => {
  it("取消实际终止进程，退出后才拒绝结果", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "tau-asr-child-"));
    try {
      const controller = new AbortController();
      const pidFile = path.join(directory, "pid");
      const result = runASRProcess(
        process.execPath,
        [
          "-e",
          "require('node:fs').writeFileSync(process.argv[1], String(process.pid)); console.log('25%'); setInterval(() => {}, 1000)",
          pidFile,
        ],
        controller.signal,
        () => controller.abort()
      );
      await expect(result).rejects.toMatchObject({ code: "cancelled" });
      const pid = Number(await readFile(pidFile, "utf8"));
      expect(() => process.kill(pid, 0)).toThrow();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it("失败进程不能返回成功，不把正文带入错误", async () => {
    await expect(
      runASRProcess(
        process.execPath,
        ["-e", "console.error('私人正文'); process.exit(7)"],
        new AbortController().signal
      )
    ).rejects.toMatchObject({ code: "internal", message: "转录处理程序异常退出（7）" });
  });
  it("进度和语言解析保持有界，并处理跨块语言日志", async () => {
    const updates: string[] = [];
    const result = await runASRProcess(
      process.execPath,
      [
        "-e",
        "process.stdout.write('x'.repeat(200000)); console.log('\\n25%'); console.log('Detected language: zh (98%)');",
      ],
      new AbortController().signal,
      message => updates.push(message)
    );
    expect(result.language).toEqual({ language: "zh", probability: 0.98 });
    expect(updates).toContain("正在转录 ... 25%");
  });
});
