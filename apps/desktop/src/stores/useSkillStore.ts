import { create } from "zustand";
import { Skill } from "@/types";
import {
  listSkills,
  createSkillFolder,
  deleteSkillFolder,
} from "@/commands/skill";

interface IState {
  skills: Skill[];
  loading: boolean;
}

interface IActions {
  loadSkills: () => Promise<void>;
  createSkill: (name: string) => Promise<string>;
  deleteSkill: (folderName: string) => Promise<void>;
}

const useSkillStore = create<IState & IActions>((set, get) => ({
  skills: [],
  loading: false,

  loadSkills: async () => {
    set({ loading: true });
    try {
      const skills = await listSkills();
      set({ skills });
    } finally {
      set({ loading: false });
    }
  },

  createSkill: async (name) => {
    const folderName = await createSkillFolder(name);
    await get().loadSkills();
    return folderName;
  },

  deleteSkill: async (folderName) => {
    await deleteSkillFolder(folderName);
    set({ skills: get().skills.filter((s) => s.folderName !== folderName) });
  },
}));

export default useSkillStore;
