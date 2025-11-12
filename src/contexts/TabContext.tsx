import { createContext, useContext, ReactNode } from "react";
import { ITab } from "@/types/tab";

interface TabContextValue {
  tab: ITab;
  paneId: string;
}

const TabContext = createContext<TabContextValue | null>(null);

export const TabProvider = ({
  children,
  tab,
  paneId,
}: {
  children: ReactNode;
  tab: ITab;
  paneId: string;
}) => {
  return (
    <TabContext.Provider value={{ tab, paneId }}>
      {children}
    </TabContext.Provider>
  );
};

export const useTabContext = () => {
  const context = useContext(TabContext);
  if (!context) {
    throw new Error("useTabContext must be used within TabProvider");
  }
  return context;
};

/**
 * Hook to get current tab params
 * Usage: const { id } = useTabParams<{ id: number }>();
 */
export const useTabParams = <
  T extends Record<string, any> = Record<string, any>,
>(): T => {
  const { tab } = useTabContext();
  return (tab.params as unknown as T) || ({} as T);
};
