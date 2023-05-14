import { create } from "zustand";

interface IState {
  token: string;
  repo: string;
  branch: string;
  dir: string;
  user: any
}

interface IActions {
  setToken: (token: string) => void;
  setRepo: (repo: string) => void;
  setBranch: (branch: string) => void;
  setDir: (dir: string) => void;
  setUserInfo: (user: any) => void;
  update: (newState: Partial<IState>) => void;
}

const initialState: IState = {
  token: '',
  repo: 'image-for-2023',
  branch: 'master',
  dir: '',
  user: null
}

export const useGithubStore = create<IState & IActions>((set) => ({
  ...initialState,
  setToken: (token: string) => {
    set({ token });
  },
  setRepo: (repo: string) => {
    set({ repo });
  },
  setBranch: (branch: string) => {
    set({ branch });
  },
  setDir: (dir: string) => {
    set({ dir });
  },
  setUserInfo: (user: any) => {
    set({ user });
  },
  update: (newState: Partial<IState>) => {
    set(newState);
  }
}));