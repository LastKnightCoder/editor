import { Descendant } from "slate";
import { useState } from "react";
import { Modal } from "antd";
import { useMemoizedFn } from "ahooks";

import EditText from "@/components/EditText";
import Editor from '@editor/index.tsx';

import styles from './index.module.less';

interface EditProjectInfoModalProps {
  open: boolean;
  title: string;
  desc: Descendant[],
  onOk?: (title: string, desc: Descendant[]) => Promise<void>;
  onCancel?: () => void;
}

const EditProjectInfoModal = (props: EditProjectInfoModalProps) => {
  const { open, title, desc, onOk, onCancel } = props;
  const [descValue, setDescValue] = useState(desc);
  const [titleValue, setTitleValue] = useState(title);

  const handleOk = useMemoizedFn(async () => {
    await onOk?.(titleValue, descValue);
  });

  return (
    <Modal
      open={open}
      onOk={handleOk}
      onCancel={onCancel}
      destroyOnClose
    >
      <div className={styles.container}>
        <div className={styles.item}>
          <div>标题：</div>
          <EditText
            style={{ minWidth: 100 }}
            defaultValue={titleValue}
            onChange={setTitleValue}
            contentEditable={true}
            defaultFocus
          />
        </div>
        <div className={styles.item}>
          <div>描述：</div>
          <Editor
            style={{ flex: 'auto' }}
            initValue={descValue}
            onChange={setDescValue}
            readonly={false}
          />
        </div>
      </div>
    </Modal>
  )
}

export default EditProjectInfoModal;
