import { Descendant } from "slate";
import { useState } from "react";
import { Radio } from "antd";
import { useMemoizedFn } from "ahooks";

import EditText from "@/components/EditText";
import { Editor } from "@tau/editor/src";
import { EProjectType } from "@/types";
import CustomModal from "@/components/CustomModal";

import styles from "./index.module.less";

interface EditProjectInfoModalProps {
  open: boolean;
  title: string;
  desc: Descendant[];
  onOk?: (
    title: string,
    desc: Descendant[],
    projectType: EProjectType,
  ) => Promise<void>;
  onCancel?: () => void;
}

const EditProjectInfoModal = (props: EditProjectInfoModalProps) => {
  const { open, title, desc, onOk, onCancel } = props;
  const [descValue, setDescValue] = useState(desc);
  const [titleValue, setTitleValue] = useState(title);
  const [projectType, setProjectType] = useState<EProjectType>(
    EProjectType.DocumentTree,
  );

  const handleOk = useMemoizedFn(async () => {
    await onOk?.(titleValue, descValue, projectType);
  });

  return (
    <CustomModal
      open={open}
      onOk={handleOk}
      onCancel={onCancel || (() => {})}
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
          <div>类型：</div>
          <Radio.Group
            value={projectType}
            onChange={(e) => setProjectType(e.target.value)}
          >
            <Radio value={EProjectType.DocumentTree}>文档树</Radio>
            <Radio value={EProjectType.DataTable}>数据表格</Radio>
          </Radio.Group>
        </div>
        <div className={styles.item}>
          <div>描述：</div>
          <Editor
            style={{ flex: "auto" }}
            initValue={descValue}
            onChange={setDescValue}
            readonly={false}
          />
        </div>
      </div>
    </CustomModal>
  );
};

export default EditProjectInfoModal;
