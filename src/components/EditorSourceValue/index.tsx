import { Drawer } from "antd";
import {Descendant} from "slate";

interface EditorDetailProps {
  open: boolean;
  onClose: () => void;
  content: Descendant[];
}

const EditorSourceValue = (props: EditorDetailProps) => {
  const { open, onClose, content } = props;

  return (
    <Drawer
      title="源码"
      open={open}
      onClose={onClose}
    >
      <pre>
        <code>
          {JSON.stringify(content, null, 2)}
        </code>
      </pre>
    </Drawer>
  )
}

export default EditorSourceValue;