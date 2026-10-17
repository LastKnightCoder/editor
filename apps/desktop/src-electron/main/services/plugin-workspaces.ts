import { app } from "electron";
import path from "node:path";
import { DevelopmentPluginRegistry } from "./plugin-registry";

let registry: DevelopmentPluginRegistry | undefined;

// 沿用已有本机工作区 UUID，固定目录接入不能改变插件私有数据的归属。
export function getPluginRegistry() {
  return (registry ??= new DevelopmentPluginRegistry(
    path.join(app.getPath("userData"), "plugin-development", "registry.json")
  ));
}
