import { createContext } from "react";
import { StoreApi } from "zustand";
import { createDatabaseStore } from "./DatabaseStore";

export type DatabaseStoreType = ReturnType<typeof createDatabaseStore>;

export type DatabaseState = StoreApi<ReturnType<DatabaseStoreType["getState"]>>;

export const DatabaseContext = createContext<DatabaseStoreType | null>(null);
