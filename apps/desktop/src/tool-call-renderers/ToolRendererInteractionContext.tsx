import { createContext, useContext } from "react";

export interface ToolRendererInteractionContextValue {
  setInputValue?: (text: string) => void;
  setHiddenPromptContext?: (payload: { text: string; label?: string }) => void;
}

export const ToolRendererInteractionContext =
  createContext<ToolRendererInteractionContextValue | null>(null);

export const ToolRendererInteractionProvider =
  ToolRendererInteractionContext.Provider;

export const useToolRendererInteraction = () =>
  useContext(ToolRendererInteractionContext);
