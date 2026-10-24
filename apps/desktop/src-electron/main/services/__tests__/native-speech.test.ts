// @vitest-environment node
import { mkdtemp, writeFile, chmod, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("electron", () => ({ app: { isPackaged: false, getAppPath: () => "/unused" } }));
import { NativeSpeechService } from "../native-speech";
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});
async function helper(code: string) {
  const directory = await mkdtemp(path.join(tmpdir(), "tau-native-fixture-"));
  const binary = path.join(directory, "helper");
  await writeFile(
    binary,
    '#!/usr/bin/env node\nconst out = value => process.stdout.write(JSON.stringify(value)+"\\n");\n' +
      code
  );
  await chmod(binary, 0o700);
  const service = new NativeSpeechService(binary);
  cleanups.push(async () => {
    service.dispose();
    await rm(directory, { force: true, recursive: true });
  });
  return service;
}
const onMac = it.skipIf(process.platform !== "darwin");
onMac("助手在录音中退出会立即令会话失败，不等用户停止", async () => {
  const service = await helper('out({event:"ready"});setTimeout(()=>process.exit(1),50);');
  const session = await service.open("zh-CN", {
    taskId: "test",
    signal: new AbortController().signal,
    onEvent() {},
  });
  await expect(session.result).rejects.toThrow(/异常退出/);
});
onMac("助手无最终文字就正常退出也不能留下悬挂录音", async () => {
  const service = await helper('out({event:"ready"});setTimeout(()=>process.exit(0),50);');
  const session = await service.open("zh-CN", {
    taskId: "test",
    signal: new AbortController().signal,
    onEvent() {},
  });
  await expect(session.result).rejects.toThrow(/未返回最终文字/);
});
onMac("结束输入等待最终结果，取消中断助手并拒绝结果", async () => {
  const service = await helper(
    'out({event:"ready"});require("node:readline").createInterface({input:process.stdin}).on("line",line=>{if(JSON.parse(line).type==="end")setTimeout(()=>{out({event:"result",transcript:{text:"尾句"}});process.exit(0)},30)});'
  );
  const controller = new AbortController();
  const session = await service.open("zh-CN", {
    taskId: "test",
    signal: controller.signal,
    onEvent() {},
  });
  await session.write({ seq: 0, startSample: 0, data: new Uint8Array(6400) });
  await session.endInput();
  expect((await session.result).text).toBe("尾句");
  const cancelled = await service.open("zh-CN", {
    taskId: "cancel",
    signal: controller.signal,
    onEvent() {},
  });
  await cancelled.cancel();
  await expect(cancelled.result).rejects.toThrow();
});
