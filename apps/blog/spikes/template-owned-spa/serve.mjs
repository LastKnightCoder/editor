import { readFile } from "node:fs/promises";
import path from "node:path";
import { serveSite } from "./server.mjs";

if (!process.argv[2]) throw new Error("用法：node serve.mjs <报告目录>");
const output = path.resolve(process.argv[2]);
const report = JSON.parse(await readFile(path.join(output, "report.json"), "utf8"));
if (report.status !== "passed") throw new Error("请先生成通过验证的站点产物");
for (const [name, directory] of Object.entries(report.sites)) {
  const deployment = JSON.parse(await readFile(path.join(directory, "deployment.json"), "utf8"));
  const server = await serveSite({
    directory,
    basePath: name === "root" ? "/" : "/notes/",
    historyFallback: deployment.historyFallback,
  });
  console.log(`${name}: ${server.url}`);
}
