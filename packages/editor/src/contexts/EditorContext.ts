import { createContext } from "react";

export interface EditorContextValue {
  theme?: "light" | "dark";
}

export const EditorContext = createContext<EditorContextValue>({
  theme: "light",
});
