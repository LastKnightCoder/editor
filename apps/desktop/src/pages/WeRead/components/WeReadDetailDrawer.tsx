import { memo } from "react";
import { getWeReadKit } from "../extensions";
import { Drawer } from "antd";
import type { Descendant } from "slate";
import { Editor } from "@tau/editor/src";
import type { RowData } from "@/components/Database/types";

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

export const WeReadDetailDrawer: React.FC<WeReadDetailDrawerProps> = memo(props => {
  const { open, row, content, onClose } = props;

  return (
    <Drawer
      title={row?.title}
      placement="right"
      size={720}
      onClose={onClose}
      open={open}
      destroyOnClose
    >
      <Editor
        kit={getWeReadKit()}
        key={row?.id}
        initValue={content || DEFAULT_DETAIL_CONTENT}
        onChange={() => {
          // TODO: 处理编辑器变化（如果需要）
        }}
      />
    </Drawer>
  );
});

WeReadDetailDrawer.displayName = "WeReadDetailDrawer";
