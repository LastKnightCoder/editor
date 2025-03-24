import { createContext, useContext } from "react";

export const RightSidebarContext = createContext<{
  visible: boolean;
}>({
  visible: false,
});

export const useRightSidebarContext = () => {
  return useContext(RightSidebarContext);
};
