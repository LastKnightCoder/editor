import { createContext } from "react";

export const DatabaseFocusContext = createContext<(() => void) | null>(null);
