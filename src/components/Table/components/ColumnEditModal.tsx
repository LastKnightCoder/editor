import React, { useEffect } from "react";
import { ColumnDef, SelectOption } from "../types";
import { v4 as uuid } from "uuid";
import { SELECT_COLORS } from "../constants";
import SelectList from "./SelectList";
import PluginManager from "../PluginManager";
import { Modal, Form, Input, InputNumber, Select } from "antd";

interface ColumnEditModalProps {
  open: boolean;
  column: ColumnDef | null; // 传入null表示新建列
  onCancel: () => void;
  onSave: (column: Partial<ColumnDef>) => void;
  theme: "light" | "dark";
  pluginManager: PluginManager;
}

type ColumnFormValues = Partial<
  Omit<ColumnDef, "config"> & {
    config?: { options?: SelectOption[] };
  }
>;

const ColumnEditModal: React.FC<ColumnEditModalProps> = ({
  open,
  column,
  onCancel,
  onSave,
  theme = "light",
  pluginManager,
}) => {
  const [form] = Form.useForm<ColumnFormValues>();

  const plugins = pluginManager.getAllPlugins();
  const pluginOptions = plugins.map((plugin) => ({
    label: plugin.name,
    value: plugin.type,
  }));

  useEffect(() => {
    if (open) {
      if (column) {
        const initialOptions: SelectOption[] | undefined = Array.isArray(
          (column as ColumnDef<{ options: SelectOption[] }>).config?.options,
        )
          ? ((column as ColumnDef<{ options: SelectOption[] }>).config!
              .options as SelectOption[])
          : undefined;
        form.setFieldsValue({
          title: column.title,
          type: column.type,
          width: column.width,
          config: initialOptions ? { options: initialOptions } : undefined,
        });
      } else {
        form.setFieldsValue({
          title: "列名",
          type: "text",
          width: 200,
          config: undefined,
        });
      }
    } else {
      form.resetFields();
    }
  }, [open, column?.id, form]);

  const handleOk = async () => {
    const values = await form.validateFields();
    const rawWidth =
      typeof values.width === "number" ? values.width : Number(values.width);
    const normalizedWidth = Math.max(
      50,
      Math.min(500, Number.isFinite(rawWidth) ? rawWidth : 200),
    );
    onSave({
      ...values,
      width: normalizedWidth,
    });
  };

  const addOption = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const existed: SelectOption[] = Array.isArray(
      form.getFieldValue(["config", "options"]) as SelectOption[] | undefined,
    )
      ? (form.getFieldValue(["config", "options"]) as SelectOption[])
      : [];
    if (existed.some((o) => o.name === trimmed)) return;
    const newOption: SelectOption = {
      id: uuid(),
      name: trimmed,
      color: SELECT_COLORS[(existed.length + 1) % SELECT_COLORS.length],
    };
    form.setFieldsValue({
      config: {
        ...(form.getFieldValue(["config"]) || {}),
        options: [...existed, newOption],
      },
    });
  };

  const removeOption = (id: string) => {
    const existed: SelectOption[] = Array.isArray(
      form.getFieldValue(["config", "options"]) as SelectOption[] | undefined,
    )
      ? (form.getFieldValue(["config", "options"]) as SelectOption[])
      : [];
    form.setFieldsValue({
      config: {
        ...(form.getFieldValue(["config"]) || {}),
        options: existed.filter((op) => op.id !== id),
      },
    });
  };

  return (
    <Modal
      open={open}
      onCancel={onCancel}
      onOk={handleOk}
      title={column ? "编辑列" : "新建列"}
      okText="保存"
      cancelText="取消"
      width={400}
      destroyOnClose
      maskClosable={false}
    >
      <Form form={form} layout="vertical">
        <Form.Item
          label="列标题"
          name="title"
          rules={[{ required: true, message: "请输入列标题" }]}
        >
          <Input placeholder="请输入列标题" />
        </Form.Item>

        <Form.Item
          label="列类型"
          name="type"
          rules={[{ required: true, message: "请选择列类型" }]}
        >
          <Select options={pluginOptions} />
        </Form.Item>

        <Form.Item
          label="列宽度"
          name="width"
          rules={[{ type: "number", transform: (v) => Number(v) }]}
        >
          <InputNumber min={50} max={500} style={{ width: "100%" }} />
        </Form.Item>

        <Form.Item
          noStyle
          shouldUpdate={(prev, curr) =>
            prev.type !== curr.type || prev.config !== curr.config
          }
        >
          {() => {
            const currentType = form.getFieldValue("type");
            if (currentType !== "select" && currentType !== "multiSelect")
              return null;
            const options =
              (form.getFieldValue(["config", "options"]) as
                | SelectOption[]
                | undefined) || [];
            return (
              <div>
                <Form.Item label="选项">
                  <Input
                    placeholder="输入后按回车新增"
                    onPressEnter={(e) => {
                      const value = (e.currentTarget as HTMLInputElement).value;
                      addOption(value);
                      (e.currentTarget as HTMLInputElement).value = "";
                    }}
                  />
                </Form.Item>
                <SelectList
                  options={options}
                  theme={theme}
                  onClear={(id) => removeOption(id)}
                />
              </div>
            );
          }}
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default ColumnEditModal;
