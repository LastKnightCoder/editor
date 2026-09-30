import { defineElement, defineExtension, type ElementRenderProps } from "@tau/editor/src";
import DatabaseBlock from "./components/DatabaseBlock";
import blockPanelItems from "./block-panel-items";
import { overwrite } from "./plugins";
import type { DatabaseElement } from "./types";
export type { DatabaseElement } from "./types";

export const createDatabaseExtension = () =>
  defineExtension({
    id: "host.database",
    elements: [
      defineElement<DatabaseElement>({
        type: "database",
        kind: "block",
        isVoid: true,
        render: ({ attributes, element, children }: ElementRenderProps<DatabaseElement>) => (
          <DatabaseBlock element={element} attributes={attributes}>
            {children}
          </DatabaseBlock>
        ),
        drag: true,
      }),
    ],
    blockPanel: blockPanelItems,
    // 数据块删除/插入的引用计数走 apply（编辑器级方法），保留为受信任层插件
    plugins: [overwrite],
  });

const databaseExtension = createDatabaseExtension();
export default databaseExtension;
