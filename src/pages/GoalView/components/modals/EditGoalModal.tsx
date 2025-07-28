import { memo } from "react";
import { Modal, Form, Input, DatePicker } from "antd";

import styles from "../../index.module.less";

const { TextArea } = Input;
const { RangePicker } = DatePicker;

interface EditGoalModalProps {
  visible: boolean;
  onCancel: () => void;
  onSubmit: (values: any) => void;
  form: any;
}

const EditGoalModal = memo(
  ({ visible, onCancel, onSubmit, form }: EditGoalModalProps) => {
    return (
      <Modal
        title="编辑目标"
        open={visible}
        onCancel={onCancel}
        footer={null}
        width={600}
      >
        <Form form={form} layout="vertical" onFinish={onSubmit}>
          <Form.Item
            name="title"
            label="目标标题"
            rules={[{ required: true, message: "请输入目标标题" }]}
          >
            <Input placeholder="输入目标标题" />
          </Form.Item>

          <Form.Item
            name="description"
            label="目标描述"
            rules={[{ required: true, message: "请输入目标描述" }]}
          >
            <TextArea rows={4} placeholder="输入目标描述（可选）" />
          </Form.Item>

          <Form.Item name="dateRange" label="时间范围">
            <RangePicker
              style={{ width: "100%" }}
              placeholder={["开始时间（可选）", "结束时间（可选）"]}
            />
          </Form.Item>

          <Form.Item>
            <div className={styles.modalActions}>
              <button className={styles.customButton} onClick={onCancel}>
                取消
              </button>
              <button
                className={`${styles.customButton} ${styles.primary}`}
                type="submit"
              >
                保存
              </button>
            </div>
          </Form.Item>
        </Form>
      </Modal>
    );
  },
);

export default EditGoalModal;
