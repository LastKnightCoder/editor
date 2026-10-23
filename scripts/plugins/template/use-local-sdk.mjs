import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const [plugins, ui] = process.argv.slice(2);
if (!plugins || !ui) throw new Error("用法：node use-local-sdk.mjs <插件 SDK.tgz> <UI SDK.tgz>");
const manifest = JSON.parse(await readFile("package.json", "utf8"));
for (const name of ["plugins", "ui"]) {
  const current = manifest.dependencies[`@tau/${name}`];
  if (current !== `file:.sdk/${name}.tgz` && !current?.startsWith(`npm:@xiongtao.xt/tau-${name}@`))
    throw new Error("模板 SDK 依赖来源不符合预期");
}
await mkdir(".sdk", { recursive: true });
await cp(path.resolve(plugins), ".sdk/plugins.tgz");
await cp(path.resolve(ui), ".sdk/ui.tgz");
manifest.dependencies["@tau/plugins"] = "file:.sdk/plugins.tgz";
manifest.dependencies["@tau/ui"] = "file:.sdk/ui.tgz";
await writeFile("package.json", JSON.stringify(manifest, null, 2) + "\n");
console.log("本地 SDK 已准备；运行 pnpm install 生成或更新锁文件，再运行 pnpm build。");
