import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const adb = process.env.ANDROID_HOME
  ? path.join(process.env.ANDROID_HOME, "platform-tools/adb")
  : "adb";
const command = (...args) => execFileSync(adb, args, { encoding: "utf8" }).trim();
const pid = command("shell", "pidof", "com.txiong.tau_plugin_spike");
if (!/^\d+$/.test(pid)) throw new Error("需要先运行专用 Android 验证应用");
const debugPort = command("forward", "tcp:0", `localabstract:webview_devtools_remote_${pid}`);
let socket;
try {
  const tabs = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
  const tab = tabs.find(tab => tab.url.startsWith("http://tauri.localhost"));
  if (!tab) throw new Error("未找到验证 WebView");
  socket = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let id = 0;
  const evaluate = expression =>
    new Promise((resolve, reject) => {
      const requestId = ++id;
      const timeout = setTimeout(() => {
        socket.removeEventListener("message", listener);
        reject(new Error("WebView 响应超时"));
      }, 10000);
      const listener = event => {
        const response = JSON.parse(event.data);
        if (response.id !== requestId) return;
        clearTimeout(timeout);
        socket.removeEventListener("message", listener);
        if (response.error || response.result.exceptionDetails)
          reject(new Error(JSON.stringify(response)));
        else resolve(response.result.result.value);
      };
      socket.addEventListener("message", listener);
      socket.send(
        JSON.stringify({
          id: requestId,
          method: "Runtime.evaluate",
          params: { expression, returnByValue: true },
        })
      );
    });
  const until = async expression => {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      if (await evaluate(expression)) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`条件未满足：${expression}`);
  };
  command("shell", "input", "keyevent", "4");
  await new Promise(resolve => setTimeout(resolve, 700));
  await evaluate(
    `[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='计数器').click()`
  );
  await until(`[...document.querySelectorAll('button')].some(e=>e.textContent.trim()==='说明')`);
  await evaluate(
    `[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='说明').click()`
  );
  await until(`Boolean(document.querySelector('[role="dialog"]'))`);
  command("shell", "input", "keyevent", "4");
  await until(`!document.querySelector('[role="dialog"]')`);
  await new Promise(resolve => setTimeout(resolve, 700));
  if (
    !(await evaluate(
      `[...document.querySelectorAll('button')].some(e=>e.textContent.trim()==='增加并保存' && e.getClientRects().length)`
    ))
  )
    throw new Error("系统返回错误地关闭了插件页面");
  const report = {
    platform: "android",
    status: "passed",
    transport: "adb input keyevent 4",
    check: "系统返回关闭浮层并保留插件页面",
    timestamp: new Date().toISOString(),
  };
  const output = path.resolve(import.meta.dirname, "../../../output/plugin-portability-validation");
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, "android-system-back.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  socket?.close();
  command("forward", "--remove", `tcp:${debugPort}`);
}
