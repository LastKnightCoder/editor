import { cp, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

const [plugins, ui] = process.argv.slice(2);
if (!plugins || !ui) throw new Error("用法：node use-local-sdk.mjs <插件 SDK.tgz> <UI SDK.tgz>");
const manifest = JSON.parse(await readFile("package.json", "utf8"));
if (
  manifest.dependencies["@tau/plugins"] !== "file:.sdk/plugins.tgz" ||
  manifest.dependencies["@tau/ui"] !== "file:.sdk/ui.tgz"
)
  throw new Error("当前模板未使用本地 SDK 依赖配置");
await mkdir(".sdk", { recursive: true });
await cp(path.resolve(plugins), ".sdk/plugins.tgz");
await cp(path.resolve(ui), ".sdk/ui.tgz");
console.log("本地 SDK 已准备；运行 pnpm install 生成或更新锁文件，再运行 pnpm build。");
