import { readFileSync } from "node:fs";
import ts from "typescript";

const filename = new URL("./wrangler.production.jsonc", import.meta.url);
const result = ts.parseConfigFileTextToJson(filename.pathname, readFileSync(filename, "utf8"));
const config = result.config;
const database = config?.d1_databases?.[0];
if (
  result.error ||
  config?.name !== "tau-analytics" ||
  database?.database_name !== "tau-analytics" ||
  !/^[a-f0-9-]{36}$/.test(database?.database_id ?? "") ||
  database.database_id === "00000000-0000-0000-0000-000000000000" ||
  !config.account_id ||
  config.r2_buckets?.[0]?.bucket_name !== "tau-release"
) {
  throw new Error(
    "正式配置未就绪：请创建独立 tau-analytics D1、填写真实 ID 并核对账号和 R2 绑定，再部署。"
  );
}
