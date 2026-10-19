import {
  createContext,
  createElement,
  useContext,
  type ComponentProps,
  type ReactNode,
} from "react";
import type { PluginDefinition } from "./contract";
import type { PluginServices } from "./services";
import { configurePluginServiceAccess } from "./service-access";

type ServiceResolver = (pluginId: string) => PluginServices | undefined;
const ResolverContext = createContext<ServiceResolver | undefined>(undefined);
const ServicesContext = createContext<PluginServices | undefined>(undefined);

function useServicesContext() {
  return useContext(ServicesContext);
}
configurePluginServiceAccess(useServicesContext);

export function PluginServicesProvider({
  resolve,
  children,
}: {
  resolve: ServiceResolver;
  children: ReactNode;
}) {
  return createElement(ResolverContext.Provider, { value: resolve }, children);
}

/** 仅在宿主装配时包裹组件，不改写插件定义、节点协议或 codec。 */
export function bindPluginServiceRenderers(definition: PluginDefinition): PluginDefinition {
  return {
    ...definition,
    editorExtensions: definition.editorExtensions?.map(extension => ({
      ...extension,
      elements: extension.elements?.map(element => {
        const Render = element.render;
        if (!Render) return element;
        function PluginElement(props: ComponentProps<typeof Render>) {
          const resolve = useContext(ResolverContext);
          return createElement(
            ServicesContext.Provider,
            { value: resolve?.(definition.id) },
            createElement(Render, props)
          );
        }
        return { ...element, render: PluginElement };
      }),
    })),
  };
}
