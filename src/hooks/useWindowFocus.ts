import { createContext, useContext } from "react";

export const WindowFocusContext = createContext<boolean>(true);

export const useWindowFocus = () => {
  const isFocused = useContext(WindowFocusContext);
  return isFocused;
};
