import { memo, useMemo } from "react";
import { Drawer } from "antd";
import type { Descendant } from "slate";
import { Editor } from "@tau/editor/src";
import type { RowData } from "@/components/Database/types";
import {
  WeReadMetadataExtension,
  WeReadChapterExtension,
  WeReadBookmarkExtension,
} from "../extensions";

const DEFAULT_DETAIL_CONTENT: Descendant[] = [
  {
    type: "paragraph",
    children: [
      {
        type: "formatted",
        text: "",
      },
    ],
  },
];

interface WeReadDetailDrawerProps {
  open: boolean;
  row: RowData | null;
  content: Descendant[] | null;
  onClose: () => void;
}

export const WeReadDetailDrawer: React.FC<WeReadDetailDrawerProps> = memo(
  (props) => {
    const { open, row, content, onClose } = props;

    // 创建微信读书扩展实例
    const wereadExtensions = useMemo(() => {
      return [
        new WeReadMetadataExtension(),
        new WeReadChapterExtension(),
        new WeReadBookmarkExtension(),
      ];
    }, []);

    return (
      <Drawer
        title={row?.title}
        placement="right"
        width={720}
        onClose={onClose}
        open={open}
        destroyOnClose
      >
        <Editor
          key={row?.id}
          initValue={content || DEFAULT_DETAIL_CONTENT}
          extensions={wereadExtensions}
          onChange={() => {
            // TODO: 处理编辑器变化（如果需要）
          }}
        />
      </Drawer>
    );
  },
);

WeReadDetailDrawer.displayName = "WeReadDetailDrawer";
