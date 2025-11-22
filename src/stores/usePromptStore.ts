import { create } from "zustand";
import { Prompt, CreatePromptPayload, UpdatePromptPayload } from "@/types";
import {
  listPrompts,
  createPrompt as createPromptCommand,
  updatePrompt as updatePromptCommand,
  deletePrompt as deletePromptCommand,
} from "@/commands";

interface IState {
  prompts: Prompt[];
  loading: boolean;
}

interface IActions {
  initPrompts: () => Promise<void>;
  createPrompt: (payload: CreatePromptPayload) => Promise<Prompt>;
  updatePrompt: (payload: UpdatePromptPayload) => Promise<Prompt>;
  deletePrompt: (id: number) => Promise<number>;
}

const usePromptStore = create<IState & IActions>((set, get) => ({
  prompts: [],
  loading: false,
  initPrompts: async () => {
    set({ loading: true });
    try {
      const prompts = await listPrompts();
      set({ prompts });
    } finally {
      set({ loading: false });
    }
  },
  createPrompt: async (payload) => {
    const prompt = await createPromptCommand(payload);
    const { prompts } = get();
    set({ prompts: [prompt, ...prompts] });
    return prompt;
  },
  updatePrompt: async (payload) => {
    const updated = await updatePromptCommand(payload);
    const next = get().prompts.map((item) =>
      item.id === updated.id ? updated : item,
    );
    set({ prompts: next });
    return updated;
  },
  deletePrompt: async (id) => {
    const res = await deletePromptCommand(id);
    set({ prompts: get().prompts.filter((item) => item.id !== id) });
    return res;
  },
}));

export default usePromptStore;
