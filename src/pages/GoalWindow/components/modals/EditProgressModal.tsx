import { memo } from "react";
import { Modal, Form, InputNumber } from "antd";

import styles from "../../index.module.less";

interface EditProgressModalProps {
  visible: boolean;
  unit?: string;
  onCancel: () => void;
  onSubmit: (values: any) => void;
  form: any;
}

const EditProgressModal = memo(
  ({ visible, unit, onCancel, onSubmit, form }: EditProgressModalProps) => {
    return (
      <Modal
        title="编辑进度记录"
        open={visible}
        onCancel={onCancel}
        footer={null}
        width={400}
      >
        <Form form={form} layout="vertical" onFinish={onSubmit}>
          <Form.Item
            name="current_value"
            label={`进度增量${unit ? ` (${unit})` : ""}`}
            rules={[
              { required: true, message: "请输入进度增量" },
              { type: "number", min: 0, message: "进度增量不能为负数" },
            ]}
          >
            <InputNumber
              style={{ width: "100%" }}
              placeholder="输入进度增量"
              min={0}
            />
          </Form.Item>

          <div
            style={{
              padding: "12px",
              background: "var(--color-fill-secondary)",
              borderRadius: "6px",
              marginBottom: "16px",
              color: "var(--color-text-secondary)",
              fontSize: "12px",
            }}
          >
            💡 修改此进度记录的增量值，总进度将会自动重新计算
          </div>

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

export default EditProgressModal;
