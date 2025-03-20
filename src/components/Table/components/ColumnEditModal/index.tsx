import React, { useState, useEffect } from "react";
import { ColumnDef } from "../../types";
import styles from "./index.module.less";

interface ColumnEditModalProps {
  open: boolean;
  column: ColumnDef | null; // 传入null表示新建列
  onCancel: () => void;
  onSave: (column: Partial<ColumnDef>) => void;
}

/**
 * 列编辑弹窗
 */
const ColumnEditModal: React.FC<ColumnEditModalProps> = ({
  open,
  column,
  onCancel,
  onSave,
}) => {
  const [formData, setFormData] = useState<Partial<ColumnDef>>({
    title: "",
    type: "text",
  });

  // 初始化表单数据
  useEffect(() => {
    if (column) {
      setFormData({
        title: column.title,
        type: column.type,
        width: column.width,
        config: column.config,
      });
    } else {
      // 新建列的默认值
      setFormData({
        title: "",
        type: "text",
        width: 200,
      });
    }
  }, [column]);

  // 处理输入变化
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === "width" ? Number(value) : value,
    }));
  };

  // 处理表单提交
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  if (!open) return null;

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h3>{column ? "编辑列" : "新建列"}</h3>
          <button className={styles.closeButton} onClick={onCancel}>
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className={styles.formGroup}>
            <label htmlFor="title">列标题</label>
            <input
              type="text"
              id="title"
              name="title"
              value={formData.title || ""}
              onChange={handleChange}
              required
              placeholder="请输入列标题"
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="type">列类型</label>
            <select
              id="type"
              name="type"
              value={formData.type || "text"}
              onChange={handleChange}
              required
            >
              <option value="text">文本</option>
              <option value="number">数字</option>
              <option value="date">日期</option>
              <option value="select">单选</option>
              <option value="multiSelect">多选</option>
              <option value="checkbox">复选框</option>
            </select>
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="width">列宽度</label>
            <input
              type="number"
              id="width"
              name="width"
              value={formData.width || 200}
              onChange={handleChange}
              min={50}
              max={500}
            />
          </div>

          {(formData.type === "select" || formData.type === "multiSelect") && (
            <div className={styles.formGroup}>
              <label htmlFor="options">选项（用逗号分隔）</label>
              <input
                type="text"
                id="options"
                name="options"
                value={
                  Array.isArray(formData.config?.options)
                    ? formData.config?.options
                        .map((item: any) => {
                          if (typeof item === "string") return item;
                          if (
                            typeof item === "object" &&
                            item !== null &&
                            "label" in item
                          )
                            return item.label;
                          return String(item);
                        })
                        .join(", ")
                    : ""
                }
                onChange={(e) => {
                  const optionsArray = e.target.value
                    .split(",")
                    .map((item) => item.trim())
                    .filter(Boolean);

                  setFormData((prev) => ({
                    ...prev,
                    config: {
                      ...prev.config,
                      options: optionsArray,
                    },
                  }));
                }}
                placeholder="选项1, 选项2, 选项3"
              />
            </div>
          )}

          <div className={styles.formActions}>
            <button
              type="button"
              onClick={onCancel}
              className={styles.cancelButton}
            >
              取消
            </button>
            <button type="submit" className={styles.saveButton}>
              保存
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ColumnEditModal;
