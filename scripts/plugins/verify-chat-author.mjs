import { mkdtemp, cp, readFile, writeFile, mkdir, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const directory = await mkdtemp(path.join(tmpdir(), "tau-chat-author-"));
const output = path.join(root, "output/plugin-chat-sdk");
const published = process.argv.includes("--published");
async function run(command, args, cwd) {
  await new Promise((resolve, reject) => {
    const env = { ...process.env };
    delete env.NODE_PATH;
    delete env.NODE_OPTIONS;
    const child = spawn(command, args, { cwd, stdio: "inherit", env });
    child.once("error", reject);
    child.once("exit", code =>
      code === 0 ? resolve() : reject(new Error(`${command} 退出 ${code}`))
    );
  });
}

try {
  const sdk = path.join(directory, "sdk");
  if (!published) await run(process.execPath, ["scripts/plugins/package-sdk.mjs", sdk], root);
  const { version } = JSON.parse(
    await readFile(path.join(root, "packages/plugins/package.json"), "utf8")
  );
  const { version: uiVersion } = JSON.parse(
    await readFile(path.join(root, "packages/ui/package.json"), "utf8")
  );
  const author = path.join(directory, "干净作者 project");
  await cp(path.join(root, "scripts/plugins/template"), author, { recursive: true });
  await rm(path.join(author, "pnpm-lock.yaml"));
  const pkg = JSON.parse(await readFile(path.join(author, "package.json"), "utf8"));
  pkg.dependencies["@tau/plugins"] = published
    ? `npm:@xiongtao.xt/tau-plugins@${version}`
    : `file:${sdk}/xiongtao.xt-tau-plugins-${version}.tgz`;
  pkg.dependencies["@tau/ui"] = published
    ? `npm:@xiongtao.xt/tau-ui@${uiVersion}`
    : `file:${sdk}/xiongtao.xt-tau-ui-${uiVersion}.tgz`;
  await writeFile(path.join(author, "package.json"), JSON.stringify(pkg, null, 2));
  if (published) {
    const policyPath = path.join(author, "pnpm-workspace.yaml");
    const policy = await readFile(policyPath, "utf8");
    await writeFile(
      policyPath,
      policy.replace(
        /("@xiongtao\.xt\/tau-plugins@)[^"]+(")/,
        (_match, prefix, suffix) => `${prefix}${version}${suffix}`
      )
    );
  }
  const manifest = JSON.parse(await readFile(path.join(author, "manifest.json"), "utf8"));
  Object.assign(manifest, {
    id: "example.chat-renderer",
    name: "聊天计数查询",
    description: "在聊天中查询插件已保存的计数。",
  });
  await writeFile(path.join(author, "manifest.json"), JSON.stringify(manifest, null, 2));
  await cp(
    path.join(root, "scripts/plugins/fixtures/chat-tool-renderer.tsx"),
    path.join(author, "src/index.tsx")
  );
  await cp(
    path.join(root, "scripts/plugins/fixtures/author-contract-check.ts"),
    path.join(author, "src/contract-check.ts")
  );
  await run("pnpm", ["install", "--ignore-scripts"], author);
  const installed = await realpath(path.join(author, "node_modules/@tau/plugins"));
  assert.ok(installed.startsWith((await realpath(author)) + path.sep));
  const contract = JSON.parse(await readFile(path.join(installed, "package.json"), "utf8"));
  assert.equal(contract.version, version);
  assert.ok(
    !Object.values(contract.dependencies).some(value => String(value).startsWith("workspace:"))
  );
  await run("pnpm", ["build"], author);
  const zip = `${manifest.id}-${manifest.version}.zip`;
  const pointer = JSON.parse(
    await readFile(path.join(author, "dist", `tau-build-${manifest.id}.json`), "utf8")
  );
  const built = JSON.parse(
    await readFile(path.join(author, "dist", pointer.directory, "manifest.json"), "utf8")
  );
  assert.equal(built.id, manifest.id);
  await mkdir(output, { recursive: true });
  await cp(path.join(author, "dist", zip), path.join(output, zip));
  if (!published)
    await cp(
      path.join(sdk, `xiongtao.xt-tau-plugins-${version}.tgz`),
      path.join(output, `xiongtao.xt-tau-plugins-${version}.tgz`)
    );
  await writeFile(
    path.join(output, published ? "chat-author-published-report.json" : "chat-author-report.json"),
    JSON.stringify(
      {
        status: "passed",
        sdkVersion: version,
        source: published ? "registry" : "local-tarball",
        independentInstall: true,
        sourceAliases: false,
        typecheck: true,
        zipBuild: true,
        artifact: zip,
      },
      null,
      2
    )
  );
  console.log(`聊天工具渲染独立作者验收通过：${output}`);
} finally {
  await rm(directory, { recursive: true, force: true });
}
