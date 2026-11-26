/**
 * 可开关的内置功能：ID 即 navigation.ts 的侧栏 key。工作区只记录关掉了哪些，
 * 没列出的功能都打开，以后新增的功能默认出现。今日与侧栏底部入口不可关。
 */

import type { FeatureCopyKey } from "./features.i18n";
/** 依附关系：父功能关掉时子功能一起收起，父功能开着时子功能可单独关 */
const FEATURE_PARENT: Readonly<Record<string, string>> = {
  skills: "chat",
  mcp: "chat",
};

/** 始终显示、不出现在开关列表里的侧栏条目 */
export const ALWAYS_ON_FEATURES: ReadonlySet<string> = new Set(["home"]);

export interface FeaturePreset {
  id: string;
  labelKey: FeatureCopyKey;
  features: readonly string[];
}

/** 常用组合：首次启动与设置 › 功能共用，可多选，打开的功能取并集 */
export const FEATURE_PRESETS: readonly FeaturePreset[] = [
  {
    id: "writing",
    labelKey: "preset.writing",
    features: ["diary", "cards", "articles", "projects", "whiteboard", "databases"],
  },
  {
    id: "learning",
    labelKey: "preset.learning",
    features: ["cards", "pdfs", "vibe-learning", "review", "walk"],
  },
  {
    id: "planning",
    labelKey: "preset.planning",
    features: ["schedule", "todos", "pomodoro", "diary"],
  },
  { id: "ai", labelKey: "preset.ai", features: ["chat", "skills", "mcp"] },
];

export function featureParent(id: string): string | undefined {
  return FEATURE_PARENT[id];
}

export function isFeatureEnabled(id: string, disabled: readonly string[]): boolean {
  if (ALWAYS_ON_FEATURES.has(id)) return true;
  if (disabled.includes(id)) return false;
  const parent = FEATURE_PARENT[id];
  return parent ? isFeatureEnabled(parent, disabled) : true;
}

export function setFeatureEnabled(
  id: string,
  enabled: boolean,
  disabled: readonly string[]
): string[] {
  const rest = disabled.filter(item => item !== id);
  return enabled ? rest : [...rest, id];
}

export function isPresetChecked(preset: FeaturePreset, disabled: readonly string[]): boolean {
  return preset.features.every(id => isFeatureEnabled(id, disabled));
}

/** 勾上打开这组功能；取消只关掉其他已勾组合用不到的功能 */
export function togglePreset(
  preset: FeaturePreset,
  checked: boolean,
  disabled: readonly string[]
): string[] {
  if (checked) return disabled.filter(id => !preset.features.includes(id));
  const keep = new Set(
    FEATURE_PRESETS.filter(
      other => other.id !== preset.id && isPresetChecked(other, disabled)
    ).flatMap(other => other.features)
  );
  const next = new Set(disabled);
  for (const id of preset.features) if (!keep.has(id)) next.add(id);
  return [...next];
}

/** 首次启动选完用途：所选组合之外的功能都关掉；一个都没选 = 全部打开 */
export function disabledForPresets(
  allFeatures: readonly string[],
  presetIds: readonly string[]
): string[] {
  if (presetIds.length === 0) return [];
  const enabled = new Set(
    FEATURE_PRESETS.filter(preset => presetIds.includes(preset.id)).flatMap(
      preset => preset.features
    )
  );
  return allFeatures.filter(id => !ALWAYS_ON_FEATURES.has(id) && !enabled.has(id));
}
