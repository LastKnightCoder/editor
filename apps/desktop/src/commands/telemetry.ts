import { invoke } from "@/electron";
import { withModule } from "./module-init";

/** 上报匿名使用事件（开发构建且未设 TAU_TELEMETRY_DEBUG 时主进程静默丢弃） */
export const trackEvent = async (name: string, data?: Record<string, unknown>) => {
  return withModule("telemetry", () => invoke("telemetry:track", name, data ?? {}));
};
