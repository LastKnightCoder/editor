// @vitest-environment node
import { expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runCompilerWorker, runMediaProcess, waitForCompiler } from "../compiler-process";

it("取消准备阶段及时退出，迟到的共享准备失败不会成为未处理拒绝", async () => {
  let fail!: (error: Error) => void;
  const controller = new AbortController();
  const result = waitForCompiler(
    () =>
      new Promise((_resolve, reject) => {
        fail = reject;
      }),
    controller.signal
  );
  await Promise.resolve();
  controller.abort();
  await expect(result).rejects.toMatchObject({ name: "AbortError" });
  fail(new Error("准备失败"));
});

it("媒体进程返回输出，参数原样传递而不经 shell，失败保留错误", async () => {
  const result = await runMediaProcess(
    process.execPath,
    ["-e", "process.stdout.write(process.argv[1])", "$(echo unsafe)"],
    os.tmpdir(),
    new AbortController().signal
  );
  expect(result.stdout).toBe("$(echo unsafe)");
  await expect(
    runMediaProcess(
      process.execPath,
      ["-e", "process.stderr.write('失败');process.exit(2)"],
      os.tmpdir(),
      new AbortController().signal
    )
  ).rejects.toThrow("失败");
});

it("取消媒体进程等待退出；进度按完整行解析", async () => {
  const controller = new AbortController();
  const times: number[] = [];
  const result = runMediaProcess(
    process.execPath,
    [
      "-e",
      "process.stdout.write('out_time_');setTimeout(()=>process.stdout.write('us=2500000\\n'),10);setInterval(()=>{},1000)",
    ],
    os.tmpdir(),
    controller.signal,
    time => {
      times.push(time);
      controller.abort();
    }
  );
  await expect(result).rejects.toMatchObject({ name: "AbortError" });
  expect(times).toEqual([2.5]);
});

it("一次性 Worker 收到结果或取消后回收，不留下 IPC 活进程", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "compiler-test-"));
  try {
    const worker = path.join(dir, "worker.cjs");
    await writeFile(
      worker,
      "process.on('message', m => {if(m.reply) process.send({ok:true,value:{html:'done'}});});"
    );
    expect(await runCompilerWorker(worker, { reply: true }, new AbortController().signal)).toEqual({
      html: "done",
    });
    const controller = new AbortController();
    const result = runCompilerWorker(worker, { reply: false }, controller.signal);
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
