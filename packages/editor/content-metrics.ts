/** 通用扩展的无 DOM 统计组合，规则归各扩展持有。 */
import { codeBlockMetricRules } from "./src/extensions/code-block/metrics";
import { mathMetricRules } from "./src/extensions/math/metrics";
import { diagramMetricRules } from "./src/extensions/diagram/metrics";
import { frontMatterMetricRules } from "./src/extensions/front-matter/metrics";
import { mediaMetricRules } from "./src/extensions/media/metrics";
import { listMetricRules } from "./src/extensions/list/metrics";

export const editorMetricRules = [
  ...codeBlockMetricRules,
  ...mathMetricRules,
  ...diagramMetricRules,
  ...frontMatterMetricRules,
  ...mediaMetricRules,
  ...listMetricRules,
] as const;
