import { memo, useState, useEffect } from "react";
import { Modal, InputNumber, Form } from "antd";
import { PomodoroSession } from "@/types";

interface EditSessionModalProps {
  session: PomodoroSession | null;
  open: boolean;
  onCancel: () => void;
  onOk: (focusMs: number) => Promise<void>;
}

const EditSessionModal = memo(
  ({ session, open, onCancel, onOk }: EditSessionModalProps) => {
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);

    useEffect(() => {
      if (session && open) {
        // 将毫秒转换为分钟
        const focusMinutes = Math.round(session.focusMs / 60000);
        form.setFieldsValue({ focusMinutes });
      }
    }, [session, open, form]);

    const handleOk = async () => {
      try {
        const values = await form.validateFields();
        const focusMs = values.focusMinutes * 60000;
        setLoading(true);
        await onOk(focusMs);
        form.resetFields();
      } catch (error) {
        console.error("Failed to update session:", error);
      } finally {
        setLoading(false);
      }
    };

    const handleCancel = () => {
      form.resetFields();
      onCancel();
    };

    return (
      <Modal
        title="编辑专注记录"
        open={open}
        onOk={handleOk}
        onCancel={handleCancel}
        confirmLoading={loading}
        okText="确认"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="focusMinutes"
            label="专注时长（分钟）"
            rules={[
              { required: true, message: "请输入专注时长" },
              {
                type: "number",
                min: 1,
                message: "专注时长至少为 1 分钟",
              },
            ]}
          >
            <InputNumber
              style={{ width: "100%" }}
              min={1}
              precision={0}
              placeholder="请输入专注时长"
            />
          </Form.Item>
        </Form>
      </Modal>
    );
  },
);

export default EditSessionModal;
