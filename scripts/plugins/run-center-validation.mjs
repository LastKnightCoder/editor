import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import os from "node:os";

const platform = process.argv[2];
if (!["android", "ios"].includes(platform)) throw new Error("参数必须是 android 或 ios");
const output = path.resolve("output/plugin-center-validation", platform);
await mkdir(output, { recursive: true });
const adb = path.join(
  process.env.ANDROID_HOME ?? path.join(os.homedir(), "Library/Android/sdk"),
  "platform-tools/adb"
);
const simulator = "88363E38-71F2-4937-ADE2-DF26C390736D";
const androidApp = "com.txiong.tau_plugin_spike";
const iosApp = "com.txiong.tau-plugin-spike";
// Xcode 的构建脚本不会继承所有 shell 变量，调试来源通过 simctl 显式传给测试进程。
if (platform === "ios") process.env.SIMCTL_CHILD_TAU_PLUGIN_CENTER_API = "http://127.0.0.1:8787";
const command = (file, ...args) =>
  execFileSync(file, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const control = async data => {
  const response = await fetch("http://127.0.0.1:8788", {
    method: "POST",
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
};
function stop() {
  if (platform === "android") command(adb, "shell", "am", "force-stop", androidApp);
  else {
    try {
      command("xcrun", "simctl", "terminate", simulator, iosApp);
    } catch {
      /* 首次启动可能没有进程。 */
    }
  }
}
function launch() {
  if (platform === "android")
    command(adb, "shell", "am", "start", "-n", `${androidApp}/.MainActivity`);
  else command("xcrun", "simctl", "launch", simulator, iosApp);
}
async function restart() {
  // 给 WebView 正常刷盘机会；随后仍由系统结束进程，不能用页面 reload 代替。
  await pause(2500);
  stop();
  await pause(700);
  launch();
}
async function readReport() {
  let database;
  if (platform === "android") {
    for (const suffix of ["", "-wal"]) {
      const bytes = execFileSync(
        adb,
        ["exec-out", "run-as", androidApp, "cat", `.editor/data.db${suffix}`],
        { maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }
      );
      await writeFile(path.join(output, `data.db${suffix}`), bytes);
    }
    database = path.join(output, "data.db");
  } else {
    const container = command("xcrun", "simctl", "get_app_container", simulator, iosApp, "data");
    database = path.join(container, "Library/Application Support", iosApp, ".editor/data.db");
  }
  const sqlite = new DatabaseSync(database, { readOnly: true });
  try {
    const result = sqlite
      .prepare("SELECT value FROM plugin_kv WHERE plugin_id='validation.center' AND key='report'")
      .get();
    return result ? JSON.parse(result.value) : null;
  } finally {
    sqlite.close();
  }
}
if (platform === "android") command(adb, "reverse", "tcp:8787", "tcp:8787");
if (process.argv.includes("--reset-center")) await control({ op: "reset" });
let last = (await readReport().catch(() => null))?.at;
if (!process.argv.includes("--attach")) await restart();
const started = Date.now();
while (Date.now() - started < 15 * 60_000) {
  const report = await readReport().catch(() => null);
  if (!report || report.at === last) {
    await pause(500);
    continue;
  }
  last = report.at;
  await writeFile(path.join(output, `${report.status}.json`), JSON.stringify(report, null, 2));
  console.log(`${platform}: ${report.status} (${report.checks.length} 组通过)`);
  if (report.status === "failed") throw new Error(report.error);
  if (report.status === "passed") {
    const state = await control({ op: "state" });
    await writeFile(
      path.join(output, "result.json"),
      JSON.stringify({ ...report, artifacts: state.releases }, null, 2)
    );
    break;
  }
  if (report.status === "restart") await restart();
  if (report.status === "publish-update") {
    await control({ op: "publish", version: "1.0.1", slow: true });
    await restart();
  }
  if (report.status === "publish-corrupt") {
    await control({ op: "publish", version: "1.0.2", slow: true, corrupt: true });
    await restart();
  }
  if (report.status === "repair") await control({ op: "repair", version: "1.0.2" });
  if (["offline", "offline-revoked"].includes(report.status)) {
    await control({ op: "network", online: false });
    await restart();
  }
  if (report.status === "online") {
    await control({ op: "network", online: true });
    await restart();
  }
  if (report.status === "revoke-foreground") {
    if (platform === "android") command(adb, "shell", "input", "keyevent", "KEYCODE_HOME");
    else command("xcrun", "simctl", "launch", simulator, "com.apple.Preferences");
    await pause(1500);
    await control({ op: "revoke" });
    await pause(1000);
    launch();
  }
}
if ((await readReport())?.status !== "passed") throw new Error("模拟器联调未在期限内通过");
