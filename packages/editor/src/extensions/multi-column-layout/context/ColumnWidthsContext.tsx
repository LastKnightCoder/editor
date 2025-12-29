import { createContext, useContext } from "react";

interface IColumnWidthsContext {
  previewWidths: number[] | null;
}

export const ColumnWidthsContext = createContext<IColumnWidthsContext>({
  previewWidths: null,
});

export const useColumnWidthsContext = () => useContext(ColumnWidthsContext);
