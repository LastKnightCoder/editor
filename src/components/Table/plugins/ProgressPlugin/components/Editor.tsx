import React, { memo, useRef, useEffect, useState } from "react";
import { Input, InputRef } from "antd";
import { useMemoizedFn, useUnmount } from "ahooks";
import { ColumnDef } from "../../../types";
import { ProgressValue } from "../types";

interface ProgressEditorProps {
  value: ProgressValue;
  column: ColumnDef;
  onCellValueChange: (newValue: ProgressValue) => void;
  onFinishEdit: () => void;
  onColumnChange: (column: ColumnDef) => void;
  theme: "light" | "dark";
  readonly: boolean;
}

const ProgressEditor: React.FC<ProgressEditorProps> = memo(
  ({ value, onCellValueChange, onFinishEdit, theme, readonly }) => {
    // 确保 value 是正确的格式
    const progressValue =
      value &&
      typeof value === "object" &&
      "current" in value &&
      "target" in value
        ? (value as ProgressValue)
        : { current: 0, target: 100 };

    const [currentValue, setCurrentValue] = useState(
      String(progressValue.current),
    );
    const [targetValue, setTargetValue] = useState(
      String(progressValue.target),
    );
    const [focusedInput, setFocusedInput] = useState<"current" | "target">(
      "current",
    );

    const currentInputRef = useRef<InputRef>(null);
    const targetInputRef = useRef<InputRef>(null);

    useEffect(() => {
      // 默认聚焦到当前进度输入框
      if (currentInputRef.current && !readonly) {
        setTimeout(() => {
          if (currentInputRef.current) {
            currentInputRef.current.focus();
            currentInputRef.current.select?.();
          }
        }, 0);
      }
    }, [readonly]);

    // 处理键盘事件
    const handleKeyDown = useMemoizedFn((e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        updateValue();
        setTimeout(() => {
          onFinishEdit();
        }, 0);
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        setTimeout(() => {
          onFinishEdit();
        }, 0);
        return;
      }

      // Ctrl + 左右箭头键切换输入框
      if (e.ctrlKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        e.preventDefault();
        if (e.key === "ArrowLeft" && focusedInput === "target") {
          setFocusedInput("current");
          currentInputRef.current?.focus();
          currentInputRef.current?.select?.();
        } else if (e.key === "ArrowRight" && focusedInput === "current") {
          setFocusedInput("target");
          targetInputRef.current?.focus();
          targetInputRef.current?.select?.();
        }
      }
    });

    // 更新值
    const updateValue = useMemoizedFn(() => {
      const current = parseFloat(currentValue) || 0;
      const target = parseFloat(targetValue) || 100;

      // 验证规则
      const validCurrent = Math.max(0, current); // 当前进度不能为负数
      const validTarget = Math.max(0.01, target); // 目标值必须为正数，可以是任意大小

      const newValue = {
        current: validCurrent,
        target: validTarget,
      };

      onCellValueChange(newValue);
    });

    // 输入验证
    const validateNumber = useMemoizedFn((value: string, allowZero = true) => {
      // 只允许数字、小数点
      const regex = /^-?\d*\.?\d*$/;
      if (!regex.test(value)) return false;

      const num = parseFloat(value);
      if (isNaN(num))
        return value === "" || value === "-" || value.endsWith(".");

      if (!allowZero && num <= 0) return false;
      return true;
    });

    const handleCurrentChange = useMemoizedFn(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value;
        if (validateNumber(newValue, true)) {
          // 当前进度可以为 0，但不能为负数
          if (newValue === "" || parseFloat(newValue) >= 0) {
            setCurrentValue(newValue);
          }
        }
      },
    );

    const handleTargetChange = useMemoizedFn(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value;
        if (validateNumber(newValue, false)) {
          // 目标值必须为正数，可以是任意大小
          if (newValue === "" || parseFloat(newValue) > 0) {
            setTargetValue(newValue);
          }
        }
      },
    );

    useUnmount(() => {
      updateValue();
      setTimeout(() => {
        onFinishEdit();
      }, 0);
    });

    const isDark = theme === "dark";

    if (readonly) {
      return (
        <div className="flex items-center gap-2 px-2 py-1 h-full w-full">
          <span
            className={`text-sm ${isDark ? "text-gray-300" : "text-gray-700"}`}
          >
            {currentValue}/{targetValue}
          </span>
        </div>
      );
    }

    return (
      <div
        className="flex items-center gap-2 px-2 py-1 h-full w-full"
        onKeyDown={handleKeyDown}
      >
        <Input
          ref={currentInputRef}
          value={currentValue}
          onChange={handleCurrentChange}
          onBlur={updateValue}
          onFocus={() => setFocusedInput("current")}
          placeholder="当前"
          className={`text-center ${focusedInput === "current" ? "ring-2 ring-blue-500" : ""}`}
          style={{
            width: "60px",
            fontSize: "12px",
            backgroundColor: isDark ? "#374151" : "#ffffff",
            borderColor:
              focusedInput === "current"
                ? "#3b82f6"
                : isDark
                  ? "#6b7280"
                  : "#d1d5db",
            color: isDark ? "#f3f4f6" : "#111827",
          }}
        />

        <span
          className={`text-sm font-medium ${isDark ? "text-gray-400" : "text-gray-500"}`}
        >
          /
        </span>

        <Input
          ref={targetInputRef}
          value={targetValue}
          onChange={handleTargetChange}
          onBlur={updateValue}
          onFocus={() => setFocusedInput("target")}
          placeholder="目标"
          className={`text-center ${focusedInput === "target" ? "ring-2 ring-blue-500" : ""}`}
          style={{
            width: "60px",
            fontSize: "12px",
            backgroundColor: isDark ? "#374151" : "#ffffff",
            borderColor:
              focusedInput === "target"
                ? "#3b82f6"
                : isDark
                  ? "#6b7280"
                  : "#d1d5db",
            color: isDark ? "#f3f4f6" : "#111827",
          }}
        />

        {/* 快捷键提示 */}
        <div
          className={`text-xs flex-none ${isDark ? "text-gray-500" : "text-gray-400"} ml-2`}
        >
          Ctrl+← →
        </div>
      </div>
    );
  },
);

ProgressEditor.displayName = "ProgressEditor";

export default ProgressEditor;
