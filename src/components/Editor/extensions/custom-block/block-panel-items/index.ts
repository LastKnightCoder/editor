import {
  CustomBlockElement,
  IBlockPanelListItem,
} from "@/components/Editor/types";
import { insertCustomBlock } from "@/components/Editor/utils";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { Editor } from "slate";
import { ReactEditor } from "slate-react";
import { Transforms } from "slate";

// 动态导入 TemplateSelector 以避免循环依赖
const showTemplateSelector = (editor: Editor) => {
  import("../components/TemplateSelector").then(
    ({ default: TemplateSelector }) => {
      const container = document.createElement("div");
      document.body.appendChild(container);
      const root = createRoot(container);
      let closed = false;

      const cleanup = () => {
        if (closed) return;
        closed = true;
        root.unmount();
        container.remove();
      };

      const handleSelect = (source: string) => {
        const customBlock = {
          type: "custom-block",
          content: source,
          children: [{ type: "formatted", text: "" }],
        } satisfies CustomBlockElement;

        Transforms.insertNodes(editor, customBlock);
        ReactEditor.focus(editor);
        cleanup();
      };

      const handleClose = () => {
        cleanup();
      };

      root.render(
        createElement(TemplateSelector, {
          visible: true,
          onClose: handleClose,
          onSelect: handleSelect,
          editor,
        }),
      );
    },
  );
};

const items: IBlockPanelListItem[] = [
  {
    icon: "custom",
    title: "React 组件",
    keywords: ["React", "组件", "custom", "自定义", "react", "zidingyi"],
    description: "空白 React 组件",
    onClick: (editor) => {
      insertCustomBlock(editor);
    },
  },
  {
    icon: "template",
    title: "从模板选择",
    keywords: ["模板", "template", "组件", "自定义", "muban"],
    description: "从已有模板创建组件",
    onClick: (editor) => {
      showTemplateSelector(editor);
    },
  },
];

export default items;
