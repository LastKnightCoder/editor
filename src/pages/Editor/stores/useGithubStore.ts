import { create } from "zustand";

interface User {
  owner: string;
  email: string;
}

interface IState {
  token: string;
  repos: string[];
  repo: string;
  branches: string[];
  branch: string;
  dir: string;
  user: User | null;
}

interface IActions {
  setToken: (token: string) => void;
  setRepo: (repo: string) => void;
  setBranch: (branch: string) => void;
  setDir: (dir: string) => void;
  setUserInfo: (user: User) => void;
  setRepos: (repos: string[]) => void;
  setBranches: (branches: string[]) => void;
  update: (newState: Partial<IState>) => void;
}

const initialState: IState = {
  token: '',
  repos: [],
  branches: [],
  repo: '',
  branch: '',
  dir: '',
  user: null
}

export const useGithubStore = create<IState & IActions>((set) => ({
  ...initialState,
  setToken: (token: string) => {
    set({ token });
  },
  setRepos: (repos: string[]) => {
    set({ repos });
  },
  setRepo: (repo: string) => {
    set({ repo });
  },
  setBranch: (branch: string) => {
    set({ branch });
  },
  setBranches: (branches: string[]) => {
    set({ branches });
  },
  setDir: (dir: string) => {
    set({ dir });
  },
  setUserInfo: (user: User) => {
    set({ user });
  },
  update: (newState: Partial<IState>) => {
    set(newState);
  }
}));