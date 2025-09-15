import { createContext } from "react";
import { StoreApi } from "zustand";
import { createTableStore } from "./TableStore";

export type TableStoreType = ReturnType<typeof createTableStore>;

export type TableState = StoreApi<ReturnType<TableStoreType["getState"]>>;

export const TableContext = createContext<TableStoreType | null>(null);
