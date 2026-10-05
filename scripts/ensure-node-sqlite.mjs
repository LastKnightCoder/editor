// 保证 collaboration-server 的 better-sqlite3 是当前 Node 的 ABI。
// desktop 的 electron-rebuild 会把仓库内所有 better-sqlite3 实例重编为 Electron ABI，
// 安装时的一次性恢复可能因离线失败或被之后的 rebuild 覆盖，所以在用到前（服务端测试、
// desktop 主进程测试、部署）先实际加载一次，加载失败才恢复。desktop 自身使用的是另一个
// 版本实例（12.10.0 patch），恢复这里不影响 Electron 运行。
import { execFileSync, execSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const sqliteDirectory = () =>
  dirname(
    createRequire(import.meta.url).resolve("better-sqlite3/package.json", {
      paths: [`${root}/apps/collaboration-server`],
    })
  );

// 子进程加载：当前进程已缓存过失败的原生模块时不会重新加载
const loads = directory => {
  try {
    execFileSync(
      process.execPath,
      ["-e", `new (require(${JSON.stringify(directory)}))(":memory:").close()`],
      { stdio: "ignore" }
    );
    return true;
  } catch {
    return false;
  }
};

export function ensureNodeSqlite() {
  const directory = sqliteDirectory();
  if (loads(directory)) return true;
  console.log("[ensure-node-sqlite] better-sqlite3 不是当前 Node ABI，正在恢复");
  // 先取预编译包，离线时退回本地源码编译（与 better-sqlite3 自身 install 脚本一致）
  for (const command of ["npx --yes prebuild-install", "npx --yes node-gyp rebuild --release"]) {
    try {
      execSync(command, { stdio: "inherit", cwd: directory });
    } catch {
      continue;
    }
    if (loads(directory)) {
      console.log("[ensure-node-sqlite] 已恢复 Node ABI");
      return true;
    }
  }
  return false;
}

/** vitest globalSetup 入口 */
export function setup() {
  if (!ensureNodeSqlite()) throw new Error("无法恢复 better-sqlite3 的 Node ABI，请联网后重试");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!ensureNodeSqlite()) {
    console.error("[ensure-node-sqlite] 无法恢复 better-sqlite3 的 Node ABI，请联网后重试");
    process.exit(1);
  }
}
