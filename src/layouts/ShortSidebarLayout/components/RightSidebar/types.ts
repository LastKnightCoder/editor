import { TabItem } from "@/stores/useRightSidebarStore";

export interface BaseViewerProps {
  type: string;
  addTab: (tabItem: TabItem) => void;
  removeTab: (tabItem: TabItem) => void;
  setActiveTabKey: (tabItem: TabItem) => void;
  activeTabKey: string | number | null;
  tabs: TabItem[];
  updateTab: (tabItem: TabItem) => void;
}
