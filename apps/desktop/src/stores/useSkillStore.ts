import { create } from "zustand";
import { Skill } from "@/types";
import {
  listSkills,
  createSkillFolder,
  deleteSkillFolder,
} from "@/commands/skill";
import {
  getAllInternalSkills,
  isInternalSkill,
} from "@/constants/internal-skills";

interface IState {
  skills: Skill[];
  loading: boolean;
}

interface IActions {
  loadSkills: () => Promise<void>;
  createSkill: (name: string, description?: string) => Promise<string>;
  deleteSkill: (folderName: string) => Promise<void>;
  getSkillByFolderName: (folderName: string) => Skill | undefined;
}

const useSkillStore = create<IState & IActions>((set, get) => ({
  skills: [],
  loading: false,

  loadSkills: async () => {
    set({ loading: true });
    try {
      // 获取外部 skill
      const externalSkills = await listSkills();

      // 获取内部 skill 并转换为 Skill 类型
      const internalSkills: Skill[] = getAllInternalSkills().map((skill) => ({
        folderName: skill.folderName,
        name: skill.name,
        description: skill.description,
        path: `internal://${skill.folderName}`,
        isInternal: true,
        readmeContent: skill.readmeContent,
      }));

      // 合并内部和外部 skill（内部优先，同名时跳过外部）
      const internalFolderNames = new Set(
        internalSkills.map((s) => s.folderName),
      );
      const filteredExternalSkills = externalSkills.filter(
        (s) => !internalFolderNames.has(s.folderName),
      );

      set({ skills: [...internalSkills, ...filteredExternalSkills] });
    } finally {
      set({ loading: false });
    }
  },

  createSkill: async (name, description) => {
    const folderName = await createSkillFolder(name, description);
    await get().loadSkills();
    return folderName;
  },

  deleteSkill: async (folderName) => {
    // 内部 skill 不允许删除
    if (isInternalSkill(folderName)) {
      throw new Error("内置 Skill 不允许删除");
    }
    await deleteSkillFolder(folderName);
    set({ skills: get().skills.filter((s) => s.folderName !== folderName) });
  },

  getSkillByFolderName: (folderName) => {
    return get().skills.find((s) => s.folderName === folderName);
  },
}));

export default useSkillStore;
