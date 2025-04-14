import { createContext } from "react";

export const EditCardContext = createContext<{ cardId: number } | null>(null);
export const EditContentContext = createContext<{ contentId: number } | null>(
  null,
);
