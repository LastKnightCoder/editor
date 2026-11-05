import { createContext, useContext } from "react";
import type { InlineSuggestionProvider } from "./controller";

export const InlineSuggestionContext = createContext<InlineSuggestionProvider | undefined>(
  undefined
);
export const useInlineSuggestionProvider = () => useContext(InlineSuggestionContext);
