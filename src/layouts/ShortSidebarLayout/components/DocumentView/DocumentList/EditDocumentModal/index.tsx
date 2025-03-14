import { useState } from "react";
import { produce } from "immer";
import { Form, Input, Modal } from "antd";
import { useMemoizedFn } from "ahooks";

import { ICreateDocument } from "@/types";

interface IEditDocumentModalProps {
  open: boolean;
  onOk: (document: ICreateDocument) => Promise<void>;
  onCancel: () => void;
  document: ICreateDocument;
}

const EditDocumentModal = (props: IEditDocumentModalProps) => {
  const { open, onOk, onCancel, document } = props;

  const [editDocument, setEditDocument] = useState<ICreateDocument>(document);

  const { title, desc } = editDocument;

  const onTitleChange = useMemoizedFn((title: string) => {
    setEditDocument(
      produce((draft) => {
        draft.title = title;
      }),
    );
  });

  const onDescriptionChange = useMemoizedFn((description: string) => {
    setEditDocument(
      produce((draft) => {
        draft.desc = description;
      }),
    );
  });

  return (
    <Modal
      title={"编辑文档信息"}
      open={open}
      onOk={() => onOk(editDocument)}
      onCancel={onCancel}
    >
      <div>
        <Form>
          <Form.Item label={"标题"}>
            <Input
              value={title}
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
