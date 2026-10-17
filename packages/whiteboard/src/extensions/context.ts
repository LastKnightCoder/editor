import { createContext, useContext } from "react";
import type { WhiteboardAPI } from "./api";

export const WhiteboardAPIContext = createContext<WhiteboardAPI | null>(null);
export const WhiteboardAPIProvider = WhiteboardAPIContext.Provider;

export function useWhiteboardAPI(): WhiteboardAPI {
  const api = useContext(WhiteboardAPIContext);
  if (!api) throw new Error("缺少白板扩展上下文");
  return api;
}
