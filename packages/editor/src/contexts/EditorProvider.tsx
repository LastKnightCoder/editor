import { createContext, useContext, useMemo } from "react";
import type { ReactNode } from "react";

import type IExtension from "../extensions/types";
import type { ServiceRegistry } from "../services/registry";

export interface EditorProviderProps {
  registry?: ServiceRegistry;
  extensions?: IExtension[];
  children: ReactNode;
}

export interface EditorEnvironment {
  registry: ServiceRegistry | null;
  extensions: IExtension[];
}

const EditorEnvironmentContext = createContext<EditorEnvironment>({
  registry: null,
  extensions: [],
});

/** 编辑器运行环境的统一入口；嵌套时未传入的字段继承外层环境。 */
export function EditorProvider({ registry, extensions, children }: EditorProviderProps) {
  const parent = useContext(EditorEnvironmentContext);
  const value = useMemo<EditorEnvironment>(
    () => ({
      registry: registry ?? parent.registry,
      extensions: extensions ?? parent.extensions,
    }),
    [extensions, parent.extensions, parent.registry, registry]
  );

  return (
    <EditorEnvironmentContext.Provider value={value}>{children}</EditorEnvironmentContext.Provider>
  );
}

export function useEditorEnvironment(): EditorEnvironment {
  return useContext(EditorEnvironmentContext);
}

export function useEditorExtensions(): IExtension[] {
  return useEditorEnvironment().extensions;
}
