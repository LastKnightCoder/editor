import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const config = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
if (
  !/"name"\s*:\s*"tau-collab-prototype"/.test(config) ||
  /"(routes?|r2_buckets|d1_databases|services|kv_namespaces)"/.test(config)
) {
  throw new Error("原型部署只允许独立 Worker 与自身 Durable Object，禁止绑定生产资源或域名");
}
const vars = new URL("../.dev.vars", import.meta.url);
if (!existsSync(vars))
  writeFileSync(vars, "PROTOTYPE_KEY=" + randomBytes(32).toString("hex") + "\n", { mode: 0o600 });
const key = readFileSync(vars, "utf8")
  .match(/^PROTOTYPE_KEY=(.+)$/m)?.[1]
  ?.trim();
if (!key) throw new Error("缺少原型访问凭据");
const run = (args, input) => {
  const result = spawnSync("pnpm", ["exec", "wrangler", ...args], {
    cwd: root,
    input,
    stdio: input === undefined ? "inherit" : ["pipe", "inherit", "inherit"],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
};
const revision = process.env.COLLAB_PROTOTYPE_BUILD_REV;
if (revision && !/^[a-zA-Z0-9-]+$/.test(revision)) throw new Error("原型构建标记无效");
const deployArgs = [
  "deploy",
  "--name",
  "tau-collab-prototype",
  ...(revision ? ["--var", "BUILD_REV:" + revision] : []),
];
const secretArgs = ["secret", "put", "PROTOTYPE_KEY", "--name", "tau-collab-prototype"];
// Secret 更新也会生成版本，验证版本标记时必须以代码发布作为最后一步。
if (revision) {
  run(secretArgs, key + "\n");
  run(deployArgs);
} else {
  run(deployArgs);
  run(secretArgs, key + "\n");
}
