import { createContext } from "react";

export const EditCardContext = createContext<{ cardId: number } | null>(null);
