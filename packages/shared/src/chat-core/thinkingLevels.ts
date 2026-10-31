import type { ThinkingLevel } from "./messages";

export interface ThinkingLevelOption {
  value: ThinkingLevel;
  label: string;
  /** 窄工具行上的两字短名 */
  short: string;
  description: string;
}

/** 全部档位的界面文案（桌面、移动同一套说法）；实际可选项由模型能力决定 */
export const THINKING_LEVEL_OPTIONS: readonly ThinkingLevelOption[] = [
  { value: "off", label: "立答如流", short: "立答", description: "关闭思考以提升响应速度" },
  { value: "minimal", label: "极简思考", short: "极简", description: "只做最低限度的思考" },
  { value: "low", label: "略作沉吟", short: "略思", description: "轻量推理，少量思考即可作答" },
  {
    value: "medium",
    label: "细致推演",
    short: "细致",
    description: "平衡速度与质量，保持稳健分析",
  },
  { value: "high", label: "穷尽求索", short: "穷尽", description: "深度推理，适合复杂任务" },
  { value: "xhigh", label: "远谋深算", short: "远谋", description: "长程推演，适合复杂代理任务" },
  { value: "max", label: "极尽推演", short: "极尽", description: "使用模型允许的最高推理强度" },
];

/** 模型能力未知时只给各家都有的几档 */
export const DEFAULT_THINKING_LEVEL_OPTIONS: readonly ThinkingLevel[] = [
  "off",
  "low",
  "medium",
  "high",
];

export const isThinkingLevel = (value: unknown): value is ThinkingLevel =>
  THINKING_LEVEL_OPTIONS.some(option => option.value === value);

/** 选中的档位落到可选集合内：换模型后旧选择可能不被支持，界面显示要与实际发送一致 */
export const clampThinkingLevel = (
  picked: ThinkingLevel,
  options: readonly ThinkingLevel[]
): ThinkingLevel => (options.includes(picked) ? picked : (options[0] ?? "off"));
