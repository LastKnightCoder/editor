import { Drawer } from "antd";
import {Descendant} from "slate";

interface EditorDetailProps {
  open: boolean;
  onClose: () => void;
  content: Descendant[];
}

const EditorDetail = (props: EditorDetailProps) => {
  const { open, onClose, content } = props;

  return (
    <Drawer
      title="Editor Detail"
      open={open}
      onClose={onClose}
    >
      <pre>
        {JSON.stringify(content, null, 2)}
      </pre>
    </Drawer>
  )
}

export default EditorDetail;