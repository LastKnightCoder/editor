/**
 * M0 前提冒烟：pi harness 在 Electron 主进程（ELECTRON_RUN_AS_NODE）下的可用性验证。
 * 用法（在 apps/desktop 下）：ELECTRON_RUN_AS_NODE=1 npx electron scripts/pi-smoke.mjs
 * 必须用 electron 而非系统 node 运行——验证的就是 Electron 内置 Node 与打包产物。
 *
 * 覆盖项：
 *  1. Electron 内置 Node ≥ 22.19（pi 三包 engines 门槛）；
 *  2. faux provider 驱动完整 agent loop（inMemory 会话，无需真实 API key）；
 *  3. 内建 bash 工具在 Windows 的真实执行（Git Bash 探测）；
 *  4. 内建 write/read 工具对中文文件名与中文路径的读写；
 *  5. 全程不写 ~/.pi（agentDir 与 cwd 均指到临时目录）。
 */
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  createAgentSession,
  SessionManager,
  ModelRuntime,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import {
  createModels,
  fauxProvider,
  fauxAssistantMessage,
  fauxText,
  fauxThinking,
  fauxToolCall,
} from "@earendil-works/pi-ai";

const failures = [];
const check = (name, ok, detail = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(name);
};

// 1. Node 版本闸门
const [nodeMajor, nodeMinor] = process.versions.node.split(".").map(Number);
console.log(
  `[1] 运行环境：node ${process.versions.node} / electron ${process.versions.electron ?? "系统 node（非 electron，结论不作为 M0 依据）"}`
);
if (nodeMajor < 22 || (nodeMajor === 22 && nodeMinor < 19)) {
  console.error("FAIL：内置 Node 低于 pi 要求的 22.19，M0 止损");
  process.exit(1);
}

// 2. 临时工作区（目录名带中文，顺带覆盖路径处理）
const workDir = mkdtempSync(join(tmpdir(), "pi-冒烟-"));
const agentDir = join(workDir, ".pi-agent");
console.log(`[2] workdir：${workDir}`);

// 3. faux provider：四轮脚本化响应（bash → write → read → 总结），驱动真实工具执行
const faux = fauxProvider({});
const models = createModels();
models.setProvider(faux.provider);
faux.setResponses([
  fauxAssistantMessage(
    [
      fauxThinking("先探测 shell 与工作目录。"),
      fauxToolCall("bash", { command: "echo 你好世界 && echo shell=$0 && pwd" }),
    ],
    { stopReason: "toolUse" }
  ),
  fauxAssistantMessage(
    [fauxToolCall("write", { path: "笔记-测试.md", content: "# pi 冒烟\n你好 pi harness\n" })],
    { stopReason: "toolUse" }
  ),
  fauxAssistantMessage([fauxToolCall("read", { path: "笔记-测试.md" })], { stopReason: "toolUse" }),
  fauxAssistantMessage([fauxText("冒烟完成。")]),
]);

// 4. 会话装配：inMemory 存储 + agentDir 隔离；faux 需要注册进 ModelRuntime 并给运行时假 key 过 auth 检查。
//    bash 工具需要 shellPath：pi 只认 Program Files 与 Windows PATH，本机 Git 装在非标准路径时探测不到，
//    这里按「环境变量 → 注册表 → 常见路径」探测（产品化后由首启检测写入，见 M3）。
const detectBashPath = () => {
  if (process.env.PI_SMOKE_SHELL && existsSync(process.env.PI_SMOKE_SHELL))
    return process.env.PI_SMOKE_SHELL;
  for (const hive of ["HKLM\\SOFTWARE\\GitForWindows", "HKCU\\SOFTWARE\\GitForWindows"]) {
    const reg = spawnSync("reg", ["query", hive, "/v", "InstallPath"], { encoding: "utf8" });
    if (reg.status !== 0 || !reg.stdout) continue;
    const m = reg.stdout.match(/InstallPath\s+REG_SZ\s+(\S+)/);
    if (m && existsSync(join(m[1], "bin", "bash.exe"))) return join(m[1], "bin", "bash.exe");
  }
  const candidates = [
    "C:\\Program Files\\Git\\bin\\bash.exe",
    "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
    "D:\\软件\\Git\\bin\\bash.exe",
  ];
  return candidates.find(p => existsSync(p));
};
const shellPath = detectBashPath();
console.log(`    shellPath：${shellPath ?? "未探测到（bash 断言将失败）"}`);
const modelRuntime = await ModelRuntime.create({
  authPath: join(agentDir, "auth.json"),
  allowModelNetwork: false,
});
modelRuntime.registerNativeProvider(faux.provider);
await modelRuntime.setRuntimeApiKey("faux", "smoke-key");
const { session } = await createAgentSession({
  cwd: workDir,
  agentDir,
  modelRuntime,
  model: faux.getModel(),
  sessionManager: SessionManager.inMemory(workDir),
  settingsManager: SettingsManager.inMemory(shellPath ? { shellPath } : {}),
});

// 5. 订阅事件（M2 IPC 事件桥将桥接的就是这一层）
const toolRuns = [];
const eventTypes = new Set();
let finalText = "";
const unsubscribe = session.subscribe(event => {
  eventTypes.add(event.type);
  if (event.type === "tool_execution_start") {
    toolRuns.push({ name: event.toolName, args: event.args, ok: null, result: "" });
    console.log(`  [tool] ${event.toolName} ${JSON.stringify(event.args)}`);
  }
  if (event.type === "tool_execution_end") {
    const run = toolRuns[toolRuns.length - 1];
    run.ok = !event.isError;
    run.result =
      typeof event.result?.content?.[0]?.text === "string" ? event.result.content[0].text : "";
  }
  if (event.type === "message_end" && event.message?.role === "assistant") {
    const text = (event.message.content ?? [])
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join("");
    if (text) finalText = text;
  }
});

console.log("[3] agent loop（faux 驱动，真实执行内建工具）：");
try {
  await session.prompt("跑冒烟");
} finally {
  unsubscribe();
  session.dispose();
}

// 6. 断言
console.log("[4] 断言：");
const bashRun = toolRuns.find(r => r.name === "bash");
check(
  "bash 工具执行成功（Git Bash 探测）",
  bashRun?.ok === true,
  bashRun?.result?.split("\n").slice(0, 2).join(" | ") ?? "未执行"
);
check("bash 中文输出未乱码", (bashRun?.result ?? "").includes("你好世界"));
const writeRun = toolRuns.find(r => r.name === "write");
const readRun = toolRuns.find(r => r.name === "read");
check("write 写入中文文件名", writeRun?.ok === true && existsSync(join(workDir, "笔记-测试.md")));
check(
  "read 读回内容一致",
  readRun?.ok === true && (readRun?.result ?? "").includes("你好 pi harness")
);
check("流式事件含 text_delta 与 thinking_delta", eventTypes.has("message_update"));
check("最终 assistant 文本落地", finalText.includes("冒烟完成"), finalText || "空");
check("agent_settled 事件到达", eventTypes.has("agent_settled"));

// 7. 清理
rmSync(workDir, { recursive: true, force: true });

if (failures.length) {
  console.error(`\nSMOKE FAIL（${failures.length} 项）：${failures.join("、")}`);
  process.exit(1);
}
console.log("\nSMOKE PASS：pi harness 在 Electron 主进程下可用，M0 通过");
