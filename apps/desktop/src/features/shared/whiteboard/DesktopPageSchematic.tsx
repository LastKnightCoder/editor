import { PageSchematic } from "@tau/whiteboard";
import { useMemo, useSyncExternalStore, type ComponentProps } from "react";
import { useQuery } from "@tanstack/react-query";
import { prepareBuiltinWhiteboardTypes, canvasFields } from "@tau/whiteboard/contracts";
import type { BoardElement } from "@tau/whiteboard";
import { desktopContentPlugins } from "../../../../shared/content-plugins";

/** 列表预览直接使用启动定义目录，不创建画布或激活插件。 */
export function DesktopPageSchematic(
  props: Omit<ComponentProps<typeof PageSchematic>, "definitions">
) {
  const revision = useSyncExternalStore(
    desktopContentPlugins.subscribe,
    desktopContentPlugins.getRevision,
    desktopContentPlugins.getRevision
  );
  const query = useQuery({
    queryKey: ["whiteboard-schematic-contracts", revision],
    queryFn: async () => ({
      catalog: await desktopContentPlugins.prepareWhiteboardContracts(),
      builtins: await prepareBuiltinWhiteboardTypes(),
    }),
    staleTime: Infinity,
  });
  const elements = useMemo(() => {
    const project = (node: BoardElement): BoardElement => ({
      ...node,
      ...(node.geometry ?? {}),
      ...(node.contractId && node.data
        ? canvasFields(
            { contractId: node.contractId, data: node.data, body: node.body },
            query.data?.builtins.types[node.type]
          )
        : {}),
      ...(node.children ? { children: node.children.map(project) } : {}),
    });
    return props.elements?.map(project);
  }, [props.elements, query.data]);
  return (
    <PageSchematic
      {...props}
      elements={elements}
      definitions={desktopContentPlugins.whiteboardElements}
      isBuiltin={element =>
        query.data?.builtins.types[element.type]?.contractId === element.contractId
      }
      resolveDefinition={element => {
        const entry = query.data?.catalog.get(element.contractId);
        return entry?.access !== "none" ? entry?.element : undefined;
      }}
    />
  );
}
