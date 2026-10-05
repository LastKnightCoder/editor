// 安装后原生模块的 ABI 治理（跨平台，替代 shell 串联）：
// 1. desktop 的 electron-rebuild 会遍历 pnpm store，把所有 better-sqlite3 实例
//    （含 collaboration-server 依赖的 Node ABI 版本）重编为 Electron ABI；
// 2. 因此 rebuild 之后必须为 collaboration-server 恢复 Node ABI，否则其 vitest
//    （better-sqlite3 加载即 ABI 报错）无法运行；desktop vitest 的 src-electron 测试
//    同样经别名解析到该实例（见 apps/desktop/vitest.config.ts）。恢复逻辑与测试前的
//    自检共用 ensure-node-sqlite.mjs。
import { execSync } from "node:child_process";
import { ensureNodeSqlite } from "./ensure-node-sqlite.mjs";

// 安装生命周期内再起 pnpm 时关闭 script 前的依赖校验，避免触发二次安装循环
const pnpmEnv = { ...process.env, npm_config_verify_deps_before_run: "false" };

try {
  execSync("pnpm --filter desktop run rebuild", { stdio: "inherit", env: pnpmEnv });
} catch {
  console.warn("[postinstall] desktop electron-rebuild 存在失败项，继续恢复 Node ABI");
}

if (!ensureNodeSqlite()) {
  // 恢复失败（离线等）不阻塞安装：用到前（测试、部署）会再次自检恢复
  console.warn(
    "[postinstall] 无法恢复 collaboration-server 的 Node ABI（网络受限？），测试前会重试"
  );
}
