// AI 能力偏好：Skill 的使用方式与工具开关，只存在这台手机上、按数据库分区，不进同步。
// 停用的 Skill 不进入自动目录也不能手动选择；仅手动的 Skill 只在显式选择时注入；
// 关掉的工具来源或单个工具不进入下一轮的 toolIds。

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AiSkillDescriptor } from "@tau/ai/skills";

export type SkillMode = "auto" | "manual" | "off";

interface LibraryPreferences {
  /** 只记录与默认不同的 Skill：默认由 frontmatter 的 disable-model-invocation 决定 */
  skills: Record<string, SkillMode>;
  /** 整组关闭的工具来源（宿主工具组 / 插件 MCP / 自定义服务器） */
  disabledSources: string[];
  disabledTools: string[];
}

interface PreferenceStore {
  libraries: Record<string, LibraryPreferences>;
  setSkillMode(databaseName: string, skill: AiSkillDescriptor, mode: SkillMode): void;
  setSourceEnabled(databaseName: string, sourceId: string, enabled: boolean): void;
  setToolsEnabled(databaseName: string, toolIds: readonly string[], enabled: boolean): void;
}

const EMPTY: LibraryPreferences = { skills: {}, disabledSources: [], disabledTools: [] };

const toggle = (list: string[], ids: readonly string[], include: boolean) => {
  const next = new Set(list);
  for (const id of ids) {
    if (include) next.add(id);
    else next.delete(id);
  }
  return [...next];
};

export const defaultSkillMode = (skill: Pick<AiSkillDescriptor, "disableModelInvocation">) =>
  skill.disableModelInvocation ? "manual" : "auto";

export const useCapabilityPreferences = create<PreferenceStore>()(
  persist(
    set => {
      const update = (
        databaseName: string,
        apply: (prev: LibraryPreferences) => LibraryPreferences
      ) =>
        set(state => ({
          libraries: {
            ...state.libraries,
            [databaseName]: apply(state.libraries[databaseName] ?? EMPTY),
          },
        }));
      return {
        libraries: {},
        setSkillMode: (databaseName, skill, mode) =>
          update(databaseName, prev => {
            const skills = { ...prev.skills };
            if (mode === defaultSkillMode(skill)) delete skills[skill.id];
            else skills[skill.id] = mode;
            return { ...prev, skills };
          }),
        setSourceEnabled: (databaseName, sourceId, enabled) =>
          update(databaseName, prev => ({
            ...prev,
            disabledSources: toggle(prev.disabledSources, [sourceId], !enabled),
          })),
        setToolsEnabled: (databaseName, toolIds, enabled) =>
          update(databaseName, prev => ({
            ...prev,
            disabledTools: toggle(prev.disabledTools, toolIds, !enabled),
          })),
      };
    },
    { name: "ai-capability-preferences", version: 1 }
  )
);

export function libraryPreferences(databaseName: string): LibraryPreferences {
  return useCapabilityPreferences.getState().libraries[databaseName] ?? EMPTY;
}

export function useLibraryPreferences(databaseName: string): LibraryPreferences {
  return useCapabilityPreferences(state => state.libraries[databaseName] ?? EMPTY);
}

export function skillModeOf(
  preferences: LibraryPreferences,
  skill: Pick<AiSkillDescriptor, "id" | "disableModelInvocation">
): SkillMode {
  return preferences.skills[skill.id] ?? defaultSkillMode(skill);
}

export function isToolEnabled(
  preferences: LibraryPreferences,
  tool: { id: string; sourceId: string }
) {
  return (
    !preferences.disabledSources.includes(tool.sourceId) &&
    !preferences.disabledTools.includes(tool.id)
  );
}

/**
 * 运行时注入覆盖：停用的 Skill 从目录消失，改为仅手动的 Skill 标为 disableModelInvocation，
 * 改为自动的仅手动 Skill 解除该标记。
 */
export function applySkillPreferences<T extends AiSkillDescriptor>(
  databaseName: string,
  skills: readonly T[]
): T[] {
  const preferences = libraryPreferences(databaseName);
  return skills.flatMap(skill => {
    const mode = skillModeOf(preferences, skill);
    if (mode === "off") return [];
    const disableModelInvocation = mode === "manual";
    return [
      disableModelInvocation === skill.disableModelInvocation
        ? skill
        : { ...skill, disableModelInvocation },
    ];
  });
}
