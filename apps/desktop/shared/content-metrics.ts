import { createContentMetrics } from "@tau/db-schema/content-metrics";
import type { ContentMetricRule } from "@tau/db-schema/content-metrics";
import { editorMetricRules } from "@tau/editor/content-metrics";

/** 每个执行环境持有独立快照，主进程只接收校验过的声明。 */
export const desktopContentMetrics = createContentMetrics(editorMetricRules);
export function installDesktopPluginMetrics(rules: readonly ContentMetricRule[]) {
  desktopContentMetrics.setRules([...editorMetricRules, ...rules]);
}
