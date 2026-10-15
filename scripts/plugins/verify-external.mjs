import { mkdtemp, cp, readFile, writeFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const directory = await mkdtemp(path.join(tmpdir(), "tau-independent-author-"));
async function run(command, args, cwd) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", code =>
      code === 0 ? resolve() : reject(new Error(`${command} 退出 ${code}`))
    );
  });
}
try {
  const sdk = path.join(directory, "sdk");
  await run(process.execPath, ["scripts/plugins/package-sdk.mjs", sdk], root);
  const author = path.join(directory, "author");
  await cp(path.join(root, "scripts/plugins/template"), author, { recursive: true });
  await run(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      path.join(sdk, "tau-plugins-0.1.0.tgz"),
      path.join(sdk, "tau-ui-0.1.0.tgz"),
    ],
    author
  );
  await run("npm", ["run", "build"], author);
  const [first] = await readdir(path.join(author, "dist"));
  const manifest = JSON.parse(await readFile(path.join(author, "manifest.json"), "utf8"));
  await writeFile(
    path.join(author, "manifest.json"),
    JSON.stringify({ ...manifest, id: "example.external-other", name: "独立计数插件二" })
  );
  await run("npm", ["run", "build"], author);
  const second = (await readdir(path.join(author, "dist"))).find(name => name !== first);
  const beforeReload = await readdir(path.join(author, "dist"));
  await writeFile(
    path.join(author, "manifest.json"),
    JSON.stringify({ ...manifest, version: "1.1.0" })
  );
  await run("npm", ["run", "build"], author);
  const replacement = (await readdir(path.join(author, "dist"))).find(
    name => !beforeReload.includes(name)
  );
  const beforeFailure = await readdir(path.join(author, "dist"));
  const source = path.join(author, "src/index.tsx");
  await writeFile(
    source,
    (await readFile(source, "utf8")).replace(
      "activate(context) {",
      "activate(context) { throw new Error('重载验证故障');"
    )
  );
  await run("npm", ["run", "build"], author);
  const failing = (await readdir(path.join(author, "dist"))).find(
    name => !beforeFailure.includes(name)
  );
  await run(
    process.execPath,
    [
      "apps/desktop/scripts/verify-plugin-runtime.mjs",
      path.join(author, "dist", first),
      path.join(author, "dist", second),
      path.join(author, "dist", replacement),
      path.join(author, "dist", failing),
    ],
    root
  );
  console.log("[external-plugin] 临时仓库外项目独立安装、严格源码检查、构建与真实桌面验证完成");
} finally {
  await rm(directory, { recursive: true, force: true });
}
