import React, { useEffect, useState } from "react";
import { PomodoroMode, PomodoroPreset } from "@/types";
import { useMemoizedFn } from "ahooks";
import { Modal, Form, Input, Radio, InputNumber } from "antd";

interface PresetModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: {
    name: string;
    mode: PomodoroMode;
    durationMin?: number;
  }) => Promise<void> | void;
  initial?: Partial<PomodoroPreset>;
  title?: string;
}

const PresetModal: React.FC<PresetModalProps> = ({
  open,
  onClose,
  onSubmit,
  initial,
  title,
}) => {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const mode = Form.useWatch("mode", form);

  useEffect(() => {
    if (open) {
      form.setFieldsValue({
        name: initial?.name || "",
        mode: (initial?.mode as PomodoroMode) || "countdown",
        durationMin: initial?.durationMin ?? 25,
      });
    }
  }, [open, initial, form]);

  const handleOk = useMemoizedFn(async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      await onSubmit({
        name: values.name.trim(),
        mode: values.mode,
        durationMin:
          values.mode === "countdown" ? values.durationMin : undefined,
      });
      onClose();
    } catch (error) {
      // 表单验证失败
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      onOk={handleOk}
      onCancel={onClose}
      okText={submitting ? "保存中..." : "保存"}
      cancelText="取消"
      destroyOnClose
      title={title || (initial?.id ? "编辑预设" : "新建预设")}
      confirmLoading={submitting}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          name: initial?.name || "",
          mode: (initial?.mode as PomodoroMode) || "countdown",
          durationMin: initial?.durationMin ?? 25,
        }}
      >
        <Form.Item
          label="名称"
          name="name"
          rules={[{ required: true, message: "请输入名称" }]}
        >
          <Input size="large" placeholder="如：具体数学" />
        </Form.Item>

        <Form.Item label="计时模式" name="mode">
          <Radio.Group>
            <Radio value="countdown">倒计时</Radio>
            <Radio value="countup">正计时</Radio>
          </Radio.Group>
        </Form.Item>

        {mode === "countdown" && (
          <Form.Item
            label="倒计时分钟"
            name="durationMin"
            rules={[{ required: true, message: "请输入倒计时分钟" }]}
          >
            <InputNumber
              size="large"
              min={1}
              max={600}
              style={{ width: 200 }}
            />
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
};

export default PresetModal;
