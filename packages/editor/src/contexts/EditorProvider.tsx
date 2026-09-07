import { createContext, useContext, useMemo } from "react";
import type { ReactNode } from "react";

import type IExtension from "../extensions/types";
import type { EditorConfig } from "./EditorConfig";
import type { ServiceRegistry } from "../services/registry";

export interface EditorProviderProps {
  registry?: ServiceRegistry;
  config?: EditorConfig | null;
  extensions?: IExtension[];
  children: ReactNode;
}

export interface EditorEnvironment {
  registry: ServiceRegistry | null;
  config: EditorConfig | null;
  extensions: IExtension[];
}

const EditorEnvironmentContext = createContext<EditorEnvironment>({
  registry: null,
  config: null,
  extensions: [],
});

/** 编辑器运行环境的统一入口；嵌套时未传入的字段继承外层环境。 */
export function EditorProvider({ registry, config, extensions, children }: EditorProviderProps) {
  const parent = useContext(EditorEnvironmentContext);
  const value = useMemo<EditorEnvironment>(
    () => ({
      registry: registry ?? parent.registry,
      config: config === undefined ? parent.config : config,
      extensions: extensions ?? parent.extensions,
    }),
    [config, extensions, parent.config, parent.extensions, parent.registry, registry]
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
