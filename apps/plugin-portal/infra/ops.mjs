import { execFileSync } from "node:child_process";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";
import ts from "typescript";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = path.resolve(packageRoot, "../..");
const configPath = "infra/wrangler.production.jsonc";
const parsed = ts.parseConfigFileTextToJson(
  configPath,
  await readFile(path.join(packageRoot, configPath), "utf8")
);
if (parsed.error) throw new Error("无法解析正式配置");
const config = parsed.config;
const [action = "help", ...flags] = process.argv.slice(2);
const execute = flags.includes("--execute");
const version = flags.find(flag => flag.startsWith("--version="))?.slice(10);
if (flags.some(flag => flag !== "--execute" && flag !== "--plan" && !flag.startsWith("--version=")))
  throw new Error("未知参数");
if (flags.includes("--plan") && execute) throw new Error("--plan 与 --execute 不能同时使用");
const help = `用法：node apps/plugin-portal/infra/ops.mjs <命令> [--execute]
默认仅打印计划，不调用云端、不构建、不修改数据。
  verify        类型、前后端测试、正式目标构建（不部署）
  status        登录账号、Worker版本、Pages部署、D1迁移、R2及Secrets名称
  smoke         公网API健康/CORS、下载清单、协作HTTPS/WSS、统计脚本
  backup        导出D1至仓库外的私有备份目录
  migrate       备份D1后应用正式迁移，不隐式发布代码
  deploy-api    检查/测试/预构建后发布Worker，不隐式迁移或改Secrets
  deploy-web    检查/测试/生产构建后发布经典Pages master，不推Git
  secrets       从进程环境和固定本机文件读取密钥，标准输入上传，不打印值
  rollback-api  --version=<Worker版本UUID>，只回退Worker，不回退数据库
  help          此说明`;
if (action === "help") {
  console.log(help);
  process.exit(0);
}
const api = config.vars.API_ORIGIN;
const web = config.vars.WEB_ORIGIN;
if (
  !api.startsWith("https://") ||
  !web.startsWith("https://") ||
  !config.account_id ||
  config.d1_databases[0].database_id.startsWith("00000000")
)
  throw new Error("正式配置不完整");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupDirectory = path.join(os.homedir(), ".local/share/tau/plugin-portal/backups");
const backupFile = path.join(backupDirectory, `${stamp}.sql`);
const env = {
  ...process.env,
  pnpm_config_verify_deps_before_run: "warn",
  CLOUDFLARE_ACCOUNT_ID: config.account_id,
  VITE_API_BASE_URL: api,
  VITE_MOCK_API: "false",
};
const cf = (...args) => ["exec", "wrangler", ...args, "--config", configPath];
const checks = [["check"], ["test"]];
const backup = cf("d1", "export", "plugin-portal", "--remote", "--output", backupFile);
const plans = {
  verify: [...checks, cf("deploy", "--dry-run", "--outdir", "dist/api"), ["build:web"]],
  status: [
    cf("whoami"),
    cf("deployments", "list"),
    ["exec", "wrangler", "pages", "deployment", "list", "--project-name", "tau-plugin-portal"],
    cf("d1", "migrations", "list", "plugin-portal", "--remote"),
    cf("r2", "bucket", "dev-url", "get", "tau-plugin-pending"),
    cf("r2", "bucket", "dev-url", "get", "tau-plugin-releases"),
    cf("secret", "list"),
  ],
  backup: [backup],
  migrate: [backup, cf("d1", "migrations", "apply", "plugin-portal", "--remote")],
  "deploy-api": [...checks, cf("deploy", "--dry-run", "--outdir", "dist/api"), cf("deploy")],
  "deploy-web": [
    ...checks,
    ["build:web"],
    [
      "exec",
      "wrangler",
      "pages",
      "deploy",
      "web/dist",
      "--project-name",
      "tau-plugin-portal",
      "--branch",
      "master",
      "--force",
    ],
  ],
  secrets: [cf("secret", "bulk")],
  "rollback-api": [
    cf("rollback", version ?? "<需要版本UUID>", "--message", "经运维确认回退至指定版本"),
  ],
  smoke: [],
};
if (!(action in plans)) throw new Error(help);
if (action === "rollback-api" && version && !/^[a-f0-9-]{36}$/i.test(version))
  throw new Error("版本UUID无效");
if (version && action !== "rollback-api") throw new Error("仅rollback-api接受version");
console.log(`目标：${config.name}；账号：${config.account_id}；API：${api}；门户：${web}`);
console.log("前端构建固定 VITE_MOCK_API=false，并使用上述API地址。");
for (const args of plans[action])
  console.log("pnpm " + args.map(arg => JSON.stringify(arg)).join(" "));
if (action === "smoke")
  console.log("检查API/CORS、下载清单、collab HTTPS/WSS、stats脚本；不登录、不上传用户文件。");
if (action === "secrets")
  console.log("密钥值仅经stdin传递；缺少固定加密密钥则拒绝，不自动生成或轮换。");
if (!execute) {
  console.log("仅预览；确认计划后加 --execute 执行。");
  process.exit(0);
}
if (["deploy-api", "deploy-web", "migrate", "rollback-api"].includes(action)) {
  if (execFileSync("git", ["status", "--porcelain"], { cwd: repoRoot, encoding: "utf8" }).trim())
    throw new Error("工作区有未提交改动；先提交待发布内容，再执行正式变更");
}
if (action === "rollback-api" && !version)
  throw new Error("必须指定--version，禁止隐式回退未知版本");
process.umask(0o077);
if (["backup", "migrate"].includes(action))
  await mkdir(backupDirectory, { recursive: true, mode: 0o700 });
let secrets;
if (action === "secrets") {
  const clientId = process.env.TAU_PLUGIN_GITHUB_CLIENT_ID;
  const clientSecret = process.env.TAU_PLUGIN_GITHUB_CLIENT_SECRET;
  const key = (
    await readFile(
      path.join(os.homedir(), ".config/tau/plugin-portal/token-encryption-key"),
      "utf8"
    )
  ).trim();
  if (!clientId || !clientSecret || Buffer.from(key, "base64").length !== 32)
    throw new Error("缺少GitHub环境变量或有效的原加密密钥");
  secrets = JSON.stringify({
    GITHUB_CLIENT_ID: clientId,
    GITHUB_CLIENT_SECRET: clientSecret,
    TOKEN_ENCRYPTION_KEY: key,
  });
}
try {
  for (const args of plans[action]) {
    if (action === "secrets") {
      try {
        execFileSync("pnpm", args, {
          cwd: packageRoot,
          env,
          input: secrets,
          stdio: ["pipe", "pipe", "pipe"],
        });
      } catch {
        throw new Error("Secrets上传失败；未打印密钥或子进程输入，请在Cloudflare检查配置");
      }
      console.log("三个Secrets已上传，值未输出。");
    } else if (args.includes("export") && args.includes("d1")) {
      try {
        execFileSync("pnpm", args, { cwd: packageRoot, env, stdio: ["inherit", "pipe", "pipe"] });
      } catch {
        throw new Error("D1备份失败，已停止；未输出可能包含临时下载凭据的CLI响应");
      }
      console.log(`D1备份已保存：${backupFile}`);
    } else execFileSync("pnpm", args, { cwd: packageRoot, env, stdio: "inherit" });
  }
  if (action === "smoke") await smoke();
  const directory = path.join(repoRoot, "output/plugin-portal-ops");
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, `${stamp}-${action}.json`),
    JSON.stringify(
      {
        action,
        time: stamp,
        commit: execFileSync("git", ["rev-parse", "HEAD"], {
          cwd: repoRoot,
          encoding: "utf8",
        }).trim(),
        worker: config.name,
        api,
        web,
        backupFile: ["backup", "migrate"].includes(action) ? backupFile : undefined,
        result: "command_succeeded",
        note: "命令完成不等于真实登录与上传验收；云端部署版本以status输出为准",
      },
      null,
      2
    )
  );
  console.log("完成；无密钥执行记录保存到 output/plugin-portal-ops/。");
} catch (error) {
  console.error(error instanceof Error ? error.message : "执行失败");
  process.exitCode = 1;
}

async function smoke() {
  const assert = (ok, message) => {
    if (!ok) throw new Error(message);
  };
  const get = (url, init = {}) =>
    fetch(url, { ...init, signal: AbortSignal.timeout(15000), redirect: "manual" });
  const health = await get(api + "/health");
  assert(health.status === 200 && (await health.json()).data?.ok === true, "API健康检查失败");
  const releases = await get(api + "/v1/releases");
  assert(
    releases.status === 200 && Array.isArray((await releases.json()).data?.items),
    "公开版本目录检查失败"
  );
  const session = await get(api + "/v1/session", { headers: { Origin: web } });
  assert(session.status === 200 && (await session.json()).data?.user === null, "匿名会话检查失败");
  const options = await get(api + "/v1/uploads", {
    method: "OPTIONS",
    headers: {
      Origin: web,
      "Access-Control-Request-Method": "PUT",
      "Access-Control-Request-Headers": "content-type,x-csrf-token",
    },
  });
  assert(
    options.status === 204 &&
      options.headers.get("access-control-allow-origin") === web &&
      options.headers.get("access-control-allow-credentials") === "true" &&
      options.headers.get("access-control-allow-methods")?.includes("PATCH") &&
      options.headers.get("access-control-allow-headers")?.toLowerCase().includes("x-csrf-token"),
    "CORS预检失败"
  );
  const download = await get("https://dl.taunote.app/publish-template-latest.json");
  assert(download.status === 200 && typeof (await download.json()) === "object", "下载清单不可用");
  const ready = await get("https://collab.taunote.app/health/ready");
  assert(ready.status === 200 && (await ready.json()).ok === true, "协作服务未就绪");
  for (const pathname of ["/ws", "/events"])
    await new Promise((resolve, reject) => {
      const socket = new WebSocket("wss://collab.taunote.app" + pathname);
      const timer = setTimeout(() => {
        socket.close();
        reject(new Error("WSS握手超时"));
      }, 10000);
      socket.addEventListener(
        "open",
        () => {
          clearTimeout(timer);
          socket.close();
          resolve();
        },
        { once: true }
      );
      socket.addEventListener(
        "error",
        () => {
          clearTimeout(timer);
          reject(new Error("WSS握手失败"));
        },
        { once: true }
      );
    });
  assert((await get("https://stats.taunote.app/script.js")).status === 200, "统计脚本不可用");
  console.log(
    "API/CORS、下载清单、协作HTTPS/WSS、统计脚本检查通过。门户页面与真实登录上传需另行验收。"
  );
}
