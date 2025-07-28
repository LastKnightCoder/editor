import { memo } from "react";
import { Modal, Form, Input, InputNumber } from "antd";

import { EGoalItemType } from "@/types";
import styles from "../../index.module.less";

const { TextArea } = Input;

interface ProgressModalProps {
  visible: boolean;
  itemType: EGoalItemType | null;
  onCancel: () => void;
  onSubmit: (values: any) => void;
  form: any;
}

const ProgressModal = memo(
  ({ visible, itemType, onCancel, onSubmit, form }: ProgressModalProps) => {
    return (
      <Modal
        title={"添加进度"}
        open={visible}
        onCancel={onCancel}
        footer={null}
        width={500}
      >
        <Form form={form} layout="vertical" onFinish={onSubmit}>
          <Form.Item
            name="title"
            label="标题"
            rules={[{ required: true, message: "请输入进度记录标题" }]}
          >
            <Input placeholder="输入进度记录标题" />
          </Form.Item>

          <Form.Item name="description" label="描述">
            <TextArea
              rows={3}
              placeholder={
                itemType === EGoalItemType.Milestone
                  ? "输入里程碑的进度记录描述"
                  : "输入进度描述"
              }
            />
          </Form.Item>

          {itemType === EGoalItemType.Progress && (
            <Form.Item
              name="progress_delta"
              label="进度增量"
              rules={[{ required: true, message: "请输入进度增量" }]}
            >
              <InputNumber
                style={{ width: "100%" }}
                placeholder="输入进度增量"
              />
            </Form.Item>
          )}

          {itemType === EGoalItemType.Milestone && (
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
              💡 里程碑的进度记录不会影响完成状态，请使用右键菜单手动标记完成。
            </div>
          )}

          <Form.Item>
            <div className={styles.modalActions}>
              <button className={styles.customButton} onClick={onCancel}>
                取消
              </button>
              <button
                className={`${styles.customButton} ${styles.primary}`}
                type="submit"
              >
                添加记录
              </button>
            </div>
          </Form.Item>
        </Form>
      </Modal>
    );
  },
);

export default ProgressModal;
