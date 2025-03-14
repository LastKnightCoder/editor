import { useState } from "react";
import { Form, Input, Modal } from "antd";

interface EditDocumentModalProps {
  open: boolean;
  title: string;
  onCancel: () => void;
  onOk: (title: string, desc: string) => void;
  defaultTitle: string;
  defaultDesc: string;
}

const EditDocumentModal = (props: EditDocumentModalProps) => {
  const { open, title, onCancel, onOk, defaultTitle, defaultDesc } = props;
  const [documentTitle, setDocumentTitle] = useState(defaultTitle);
  const [desc, setDesc] = useState(defaultDesc);
  const onTitleChange = (title: string) => {
    setDocumentTitle(title);
  };
  const onDescriptionChange = (desc: string) => {
    setDesc(desc);
  };
  return (
    <Modal
      title={title}
      open={open}
      onCancel={onCancel}
      onOk={() => onOk(documentTitle, desc)}
      destroyOnClose={true}
      width={720}
      closable={false}
    >
      <div>
        <Form>
          <Form.Item label={"标题"}>
            <Input
              value={documentTitle}
              onChange={(e) => onTitleChange(e.target.value)}
            />
          </Form.Item>
          <Form.Item label={"描述"}>
            <Input.TextArea
              value={desc}
              onChange={(e) => onDescriptionChange(e.target.value)}
              autoSize={{ minRows: 5 }}
            />
          </Form.Item>
        </Form>
      </div>
    </Modal>
  );
};

export default EditDocumentModal;
