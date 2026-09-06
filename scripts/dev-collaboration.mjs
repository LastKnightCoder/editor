import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const root = fileURLToPath(new URL("../", import.meta.url));
const port = Number(process.env.COLLAB_PORT || 3210);
const url = `http://127.0.0.1:${port}`;
const dataDir = resolve(root, process.env.COLLAB_DATA_DIR || "apps/collaboration-server/data");
const children = [];
let stopping = false;

async function stop(code) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  await Promise.all(
    children.map(async child => {
      if (!child.pid) return;
      if (process.platform === "win32") {
        await new Promise(resolve => {
          const killer = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
            stdio: "ignore",
          });
          killer.once("error", resolve);
          killer.once("exit", resolve);
        });
        return;
      }
      const signal = name => {
        try {
          process.kill(-child.pid, name);
        } catch (error) {
          if (error.code !== "ESRCH") console.error(error.message);
        }
      };
      // pnpm、Vite、Electron 是多级子进程，退出时清理整个进程组。
      signal("SIGTERM");
      for (let attempt = 0; attempt < 30; attempt++) {
        try {
          process.kill(-child.pid, 0);
        } catch {
          return;
        }
        await delay(100);
      }
      signal("SIGKILL");
    })
  );
}

function start(name, args, env) {
  const child = spawn(process.execPath, [process.env.npm_execpath, ...args], {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: "inherit",
    detached: process.platform !== "win32",
  });
  children.push(child);
  child.once("error", error => {
    console.error(`[协作开发] ${name}启动失败：${error.message}`);
    void stop(1);
  });
  child.once("exit", (code, signal) => {
    if (stopping) return;
    console.log(`[协作开发] ${name}已退出（${signal || code}），正在关闭环境。`);
    void stop(code ?? 1);
  });
}

async function checkPort(port, host) {
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once("error", () =>
      reject(new Error(`端口 ${port} 已被占用，请先关闭已有的 dev/server 进程后重试。`))
    );
    probe.listen(port, host, () => probe.close(resolve));
  });
}

process.once("SIGINT", () => void stop(0));
process.once("SIGTERM", () => void stop(0));

try {
  if (!process.env.npm_execpath) throw new Error("请通过 pnpm dev:collaboration 启动。");
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535)
    throw new Error("COLLAB_PORT 必须是 1 至 65535 之间的整数。");
  if (port === 6174 || port === 24678) throw new Error("协作端口不能与桌面端端口相同。");
  await checkPort(port, "127.0.0.1");
  await checkPort(6174, "localhost");
  await checkPort(24678, "127.0.0.1");
  if (!stopping) {
    console.log(`[协作开发] 服务地址：${url}\n[协作开发] 服务数据：${dataDir}`);
    start("协作服务", ["--filter", "@tau/collaboration-server", "dev"], {
      COLLAB_HOST: "127.0.0.1",
      COLLAB_PORT: String(port),
      COLLAB_PUBLIC_URL: url,
      COLLAB_DATA_DIR: dataDir,
    });
    const deadline = Date.now() + 30000;
    let ready = false;
    while (!stopping && Date.now() < deadline) {
      try {
        const response = await fetch(`${url}/health/ready`, { signal: AbortSignal.timeout(1000) });
        ready = response.ok && (await response.json()).ok === true;
        if (ready) break;
      } catch {
        // 服务启动期间连接尚未建立，继续等待健康检查。
      }
      await delay(250);
    }
    if (!stopping) {
      if (!ready) throw new Error("协作服务未能在 30 秒内就绪。");
      console.log("[协作开发] 服务已就绪，正在启动桌面端；无需手动设置地址。按 Ctrl+C 退出。");
      start("桌面端", ["--filter", "desktop", "dev"], {
        TAU_COLLAB_DEV_SERVER_URL: url,
      });
    }
  }
} catch (error) {
  console.error(`[协作开发] ${error.message}`);
  await stop(1);
}
