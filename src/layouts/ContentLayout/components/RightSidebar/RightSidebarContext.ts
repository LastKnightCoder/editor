import { createContext, useContext } from "react";

export const RightSidebarContext = createContext<{
  visible: boolean;
  isConnected: boolean;
}>({
  visible: false,
  isConnected: false,
});

export const useRightSidebarContext = () => {
  return useContext(RightSidebarContext);
};
