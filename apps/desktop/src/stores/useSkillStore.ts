import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Skill, SkillInvocation } from "@/types";
import {
  createSkill as createSkillCommand,
  deleteSkill as deleteSkillCommand,
  listSkills,
} from "@/commands/skill";
import { getAllInternalSkills } from "@/constants/internal-skills";

/** 本机偏好：停用 / 调用方式覆盖（不改原文件，内置与关联目录的只读 Skill 也能设） */
export interface SkillPreference {
  disabled?: boolean;
  invocation?: SkillInvocation;
}

export type SkillUsageHow = "auto" | "manual";

export interface SkillUsageRecord {
  at: number;
  how: SkillUsageHow;
  conversationKey?: string;
}

export interface SkillUsage {
  count: number;
  autoCount: number;
  lastAt: number;
  recent: SkillUsageRecord[];
}

const MAX_RECENT_USAGE = 30;

interface IState {
  skills: Skill[];
  loading: boolean;
  loaded: boolean;
  /** 键为 folderName（与 agent 工具参数同一套标识） */
  preferences: Record<string, SkillPreference>;
  usage: Record<string, SkillUsage>;
}

interface IActions {
  loadSkills: () => Promise<void>;
  createSkill: (payload: {
    name: string;
    description?: string;
    manual?: boolean;
    body?: string;
  }) => Promise<Skill>;
  deleteSkill: (skill: Skill) => Promise<void>;
  getSkillByFolderName: (folderName: string) => Skill | undefined;
  setEnabled: (folderName: string, enabled: boolean) => void;
  setInvocation: (folderName: string, invocation: SkillInvocation) => void;
  recordUsage: (folderName: string, how: SkillUsageHow, conversationKey?: string) => void;
}

/** 同名优先级：内置 > 我的 > 关联目录（被遮蔽的仍在页面上显示，但 agent 只认第一个） */
const SOURCE_RANK = { builtin: 0, mine: 1, linked: 2 } as const;

export const toInternalSkills = (): Skill[] =>
  getAllInternalSkills().map(skill => ({
    folderName: skill.folderName,
    name: skill.name,
    description: skill.description,
    path: `internal://${skill.folderName}`,
    source: "builtin",
    isInternal: true,
    readmeContent: skill.readmeContent,
    defaultInvocation: "auto",
    fileCount: 1,
  }));

/** 同名只保留优先级最高的一个 */
export const dedupeSkills = (skills: Skill[]): Skill[] => {
  const byName = new Map<string, Skill>();
  for (const skill of [...skills].sort(
    (a, b) => SOURCE_RANK[a.source ?? "mine"] - SOURCE_RANK[b.source ?? "mine"]
  )) {
    if (!byName.has(skill.folderName)) byName.set(skill.folderName, skill);
  }
  return skills.filter(skill => byName.get(skill.folderName) === skill);
};

export const getSkillInvocation = (
  skill: Skill,
  preferences: Record<string, SkillPreference>
): SkillInvocation =>
  preferences[skill.folderName]?.invocation ?? skill.defaultInvocation ?? "auto";

export const isSkillEnabled = (skill: Skill, preferences: Record<string, SkillPreference>) =>
  !preferences[skill.folderName]?.disabled;

const useSkillStore = create<IState & IActions>()(
  persist(
    (set, get) => ({
      skills: [],
      loading: false,
      loaded: false,
      preferences: {},
      usage: {},

      loadSkills: async () => {
        set({ loading: true });
        try {
          const external = await listSkills();
          set({ skills: [...toInternalSkills(), ...external], loaded: true });
        } finally {
          set({ loading: false });
        }
      },

      createSkill: async payload => {
        const skill = await createSkillCommand(payload);
        await get().loadSkills();
        return skill;
      },

      deleteSkill: async skill => {
        if (skill.source !== "mine") throw new Error("只能删除「我的」Skill");
        await deleteSkillCommand(skill.path);
        set(state => ({ skills: state.skills.filter(s => s.path !== skill.path) }));
      },

      getSkillByFolderName: folderName =>
        dedupeSkills(get().skills).find(s => s.folderName === folderName),

      setEnabled: (folderName, enabled) =>
        set(state => ({
          preferences: {
            ...state.preferences,
            [folderName]: { ...state.preferences[folderName], disabled: !enabled },
          },
        })),

      setInvocation: (folderName, invocation) =>
        set(state => ({
          preferences: {
            ...state.preferences,
            [folderName]: { ...state.preferences[folderName], invocation, disabled: false },
          },
        })),

      recordUsage: (folderName, how, conversationKey) =>
        set(state => {
          const prev = state.usage[folderName];
          const at = Date.now();
          return {
            usage: {
              ...state.usage,
              [folderName]: {
                count: (prev?.count ?? 0) + 1,
                autoCount: (prev?.autoCount ?? 0) + (how === "auto" ? 1 : 0),
                lastAt: at,
                recent: [{ at, how, conversationKey }, ...(prev?.recent ?? [])].slice(
                  0,
                  MAX_RECENT_USAGE
                ),
              },
            },
          };
        }),
    }),
    {
      name: "skill-preferences",
      version: 1,
      partialize: state => ({ preferences: state.preferences, usage: state.usage }),
    }
  )
);

export default useSkillStore;
