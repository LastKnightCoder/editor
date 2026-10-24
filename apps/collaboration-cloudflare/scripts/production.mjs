import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { randomBytes, createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const configPath = "wrangler.production.jsonc";
const parsed = ts.parseConfigFileTextToJson(
  configPath,
  readFileSync(join(root, configPath), "utf8")
);
if (parsed.error) throw new Error("正式配置无法解析");
const config = parsed.config;
if (config.name !== "tau-collaboration" || config.vars.PUBLIC_URL !== "https://collab.taunote.app")
  throw new Error("正式目标配置不匹配");
if (
  config.routes?.some(
    route => route.pattern !== "collab.taunote.app/*" || route.zone_name !== "taunote.app"
  )
)
  throw new Error("正式配置只允许协作产品域名");
if (
  config.routes?.length &&
  process.env.COLLAB_INSTANCE_NAME &&
  process.env.COLLAB_INSTANCE_NAME !== config.vars.INSTANCE_NAME
)
  throw new Error("已绑定产品域名的部署禁止指向演练实例");
const [action = "status", directoryArg, ...flags] = process.argv.slice(2);
if (
  ![
    "status",
    "deploy",
    "import",
    "verify",
    "activate",
    "backup",
    "maintenance",
    "resume",
    "bind-route",
  ].includes(action)
)
  throw new Error("不支持的操作：" + action);
const execute = process.argv.includes("--execute");
const directory = directoryArg && directoryArg !== "--execute" ? resolve(directoryArg) : undefined;
if (flags.some(flag => flag !== "--execute")) throw new Error("未知参数");
const secretFile =
  process.env.COLLABORATION_ENV_FILE ??
  join(homedir(), ".local/share/tau/collaboration-cloudflare/production.env");
if (execute) mkdirSync(dirname(secretFile), { recursive: true, mode: 0o700 });
if (!existsSync(secretFile) && execute)
  writeFileSync(secretFile, "ADMIN_KEY=" + randomBytes(32).toString("hex") + "\n", { mode: 0o600 });
const secrets = existsSync(secretFile)
  ? Object.fromEntries(
      readFileSync(secretFile, "utf8")
        .split("\n")
        .filter(line => line.includes("="))
        .map(line => {
          const index = line.indexOf("=");
          return [line.slice(0, index), line.slice(index + 1)];
        })
    )
  : {};
const account = config.account_id;
function token() {
  if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN;
  const candidates = [
    join(homedir(), "Library/Preferences/.wrangler/config/default.toml"),
    join(
      process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"),
      ".wrangler/config/default.toml"
    ),
    join(homedir(), ".wrangler/config/default.toml"),
  ];
  for (const path of candidates)
    if (existsSync(path)) {
      const value = readFileSync(path, "utf8").match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
      if (value) return value;
    }
  throw new Error("需要 Wrangler 登录或 CLOUDFLARE_API_TOKEN");
}
async function api(path, method = "GET", body) {
  const response = await fetch("https://api.cloudflare.com/client/v4" + path, {
    method,
    headers: { Authorization: "Bearer " + token(), "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok || !result.success)
    throw new Error(
      "Cloudflare 操作失败：" +
        (result.errors?.map(error => error.message).join(";") ?? response.status)
    );
  return result.result;
}
let cachedOrigin;
async function origin() {
  if (cachedOrigin) return cachedOrigin;
  const subdomain = await api("/accounts/" + account + "/workers/subdomain");
  cachedOrigin = "https://" + config.name + "." + subdomain.subdomain + ".workers.dev";
  return cachedOrigin;
}
async function service(path, method = "GET", body) {
  if (!secrets.ADMIN_KEY) throw new Error("缺少本机正式管理凭据");
  const binary = body instanceof Uint8Array;
  const response = await fetch((await origin()) + path, {
    method,
    headers: {
      "x-admin-key": secrets.ADMIN_KEY,
      ...(!binary ? { "Content-Type": "application/json" } : {}),
    },
    body: body === undefined ? undefined : binary ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  const value = await response.json();
  if (!response.ok) throw new Error("服务操作失败：" + value.message);
  return value;
}
function wrangler(args, input) {
  const result = spawnSync("pnpm", ["exec", "wrangler", ...args, "--config", configPath], {
    cwd: root,
    input,
    stdio: input === undefined ? "inherit" : ["pipe", "inherit", "inherit"],
    env: { ...process.env, pnpm_config_verify_deps_before_run: "warn" },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
if (!execute && action !== "status") {
  console.log(
    "计划：" +
      action +
      "；正式 Worker=" +
      config.name +
      "，入口=" +
      config.vars.PUBLIC_URL +
      "。执行需显式 --execute。"
  );
  process.exit(0);
}
if (action === "deploy") {
  wrangler(["deploy"]);
  for (const name of ["ADMIN_KEY", "LEGACY_ORIGIN_HASHES"])
    if (secrets[name]) wrangler(["secret", "put", name], secrets[name] + "\n");
  const extra = process.env.COLLAB_INSTANCE_NAME
    ? ["--var", "INSTANCE_NAME:" + process.env.COLLAB_INSTANCE_NAME]
    : [];
  wrangler(["deploy", ...extra]);
} else if (action === "status") {
  console.log(JSON.stringify(await service("/_admin/status"), null, 2));
} else if (action === "import" && directory) {
  const metadata = JSON.parse(readFileSync(join(directory, "metadata.json"), "utf8"));
  await service("/_admin/import", "POST", metadata);
  for (const id of readdirSync(join(directory, "documents"))) {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("文档标识无效");
    await service("/_admin/state/" + id, "POST", {
      state: readFileSync(join(directory, "documents", id)).toString("base64"),
    });
  }
  for (const digest of readdirSync(join(directory, "assets"))) {
    const bytes = readFileSync(join(directory, "assets", digest));
    if (createHash("sha256").update(bytes).digest("hex") !== digest)
      throw new Error("资源摘要不匹配");
    await service("/_admin/assets/" + digest, "PUT", bytes);
  }
  console.log(JSON.stringify(await service("/_admin/status"), null, 2));
} else if (action === "verify" && directory) {
  const metadata = JSON.parse(readFileSync(join(directory, "metadata.json"), "utf8"));
  const status = await service("/_admin/status");
  for (const [table, rows] of Object.entries(metadata.tables))
    if (status.counts[table] !== rows.length) throw new Error("数量核对失败：" + table);
  for (const id of readdirSync(join(directory, "documents"))) {
    const state = await service("/_admin/state/" + id);
    const source = readFileSync(join(directory, "documents", id));
    const current = Buffer.from(state.state, "base64");
    if (!source.equals(current)) throw new Error("文档状态字节不一致：" + id);
  }
  console.log("迁移数量与全部活动文档字节核对通过");
} else if (action === "activate") {
  console.log(JSON.stringify(await service("/_admin/finish-import", "POST"), null, 2));
} else if (action === "backup") {
  console.log(JSON.stringify(await service("/_admin/backup", "POST"), null, 2));
} else if (action === "maintenance") {
  console.log(
    JSON.stringify(await service("/_admin/maintenance", "POST", { enabled: true }), null, 2)
  );
} else if (action === "resume") {
  console.log(
    JSON.stringify(await service("/_admin/maintenance", "POST", { enabled: false }), null, 2)
  );
} else if (action === "bind-route") {
  const health = await service("/health/ready");
  if (!health.ok || health.instance !== config.vars.INSTANCE_NAME)
    throw new Error("正式实例未就绪");
  const zones = await api("/zones?name=taunote.app");
  if (zones.length !== 1) throw new Error("产品区域不唯一");
  const path = "/zones/" + zones[0].id + "/workers/routes";
  const previous = await api(path);
  const existing = previous.find(route => route.pattern === "collab.taunote.app/*");
  if (existing && existing.script !== config.name) throw new Error("协作路由已属于其他服务");
  if (!existing) await api(path, "POST", { pattern: "collab.taunote.app/*", script: config.name });
  console.log("产品协作路由已绑定；DNS记录需开启代理，来源地址可使用192.0.2.1占位");
} else
  throw new Error(
    "用法：production.mjs status | deploy | import <目录> | verify <目录> | activate | backup | maintenance | resume | bind-route [--execute]"
  );
