import { produce } from "immer";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import useChatMessageStore from "./useChatMessageStore";

export interface TabItem {
  id: string;
  type: string;
  title: string;
}

interface RightSidebarState {
  open: boolean;
  width: number;
  tabs: Record<string, TabItem[]>;
  activeTabKey: Record<string, string | null>;
  containerActiveTabKey: string | null;

  setOpen: (open: boolean) => void;
  toggleOpen: () => void;
  setContainerActiveTabKey: (key: string) => void;
  addTab: (tabItem: TabItem) => void;
  removeTab: (tabItem: TabItem) => void;
  updateTab: (tabItem: TabItem) => void;
  setActiveTabKey: (tabItem: TabItem) => void;
  clearTabs: () => void;
}

const useRightSidebarStore = create<RightSidebarState>()(
  persist(
    (set, get) => ({
      open: false,
      width: 350,
      tabs: {},
      activeTabKey: {},
      containerActiveTabKey: "card",
      setOpen: (open) => set({ open }),
      toggleOpen: () => set((state) => ({ open: !state.open })),
      addTab: (tabItem) => {
        const { tabs } = get();
        const { type, id } = tabItem;
        const newTabs = produce(tabs, (draft) => {
          if (!draft[type]) {
            draft[type] = [];
          }
          if (!draft[type].find((t) => t.id === id)) {
            draft[type].push(tabItem);
          }
        });
        const newActiveKey = { ...get().activeTabKey, [type]: id };
        set({
          tabs: newTabs,
          activeTabKey: newActiveKey,
          open: true,
          containerActiveTabKey: type,
        });
        useChatMessageStore.setState({
          open: false,
        });
      },
      removeTab: (tabItem) => {
        const { tabs, activeTabKey } = get();
        const { type, id } = tabItem;
        const newTabs = produce(tabs, (draft) => {
          draft[type] = draft[type].filter((t) => t.id !== id);
        });
        if (activeTabKey[type] === id) {
          if (newTabs[type].length > 0) {
            set({
              activeTabKey: { ...activeTabKey, [type]: newTabs[type][0].id },
            });
          } else {
            // 找到下一个有内容的tab
            const hasTabsContainerKey = Object.keys(newTabs).find(
              (type) => newTabs[type]?.length > 0,
            );
            if (hasTabsContainerKey) {
              const containerActiveTabKey = hasTabsContainerKey;
              set({
                activeTabKey: {
                  ...activeTabKey,
                  [hasTabsContainerKey]: newTabs[hasTabsContainerKey][0].id,
                },
                containerActiveTabKey,
              });
            } else {
              set({
                activeTabKey: {},
                containerActiveTabKey: null,
                open: false,
              });
            }
          }
        }
        set({ tabs: newTabs });
      },
      updateTab: (tabItem) => {
        const { tabs } = get();
        const { type, id } = tabItem;
        const newTabs = produce(tabs, (draft) => {
          draft[type] = draft[type].map((t) => (t.id === id ? tabItem : t));
        });
        set({ tabs: newTabs });
      },
      setContainerActiveTabKey: (key) => set({ containerActiveTabKey: key }),
      setActiveTabKey: (tabItem) => {
        const { type, id } = tabItem;
        const newActiveKey = { ...get().activeTabKey, [type]: id };
        set({ activeTabKey: newActiveKey });
      },
      clearTabs: () => set({ tabs: {}, activeTabKey: {} }),
    }),
    {
      name: "right-sidebar-storage1",
      partialize: (state) => ({
        tabs: state.tabs,
        activeTabKey: state.activeTabKey,
        containerActiveTabKey: state.containerActiveTabKey,
        open: state.open,
        width: state.width,
      }),
    },
  ),
);

export default useRightSidebarStore;
