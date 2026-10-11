import { createContext, useContext } from "react";
import { ViewRegistry } from "./ViewRegistry";

/** 缺省空注册表：无 Provider 时（独立渲染的行详情）视图元数据查不到，图标走各自 fallback */
const emptyViewRegistry = new ViewRegistry();

export const ViewRegistryContext = createContext<ViewRegistry>(emptyViewRegistry);

export const useViewRegistry = (): ViewRegistry => useContext(ViewRegistryContext);
