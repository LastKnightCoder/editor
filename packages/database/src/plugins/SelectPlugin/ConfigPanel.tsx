import React, { useEffect, useState } from "react";
import { v4 as uuid } from "uuid";
import { SELECT_COLORS } from "../../constants";
import SelectList from "../../views/TableView/components/SelectList";
import type { FieldConfigPanelProps, SelectOption } from "../../types";
import { Input } from "@tau/ui";

const labelClass = "text-tau-meta font-medium text-ink-2";

/** 单选 / 多选字段共用的选项编辑面板 */
const OptionsConfigPanel: React.FC<FieldConfigPanelProps<{ options: SelectOption[] }>> = ({
  config,
  onChange,
}) => {
  const [optionInput, setOptionInput] = useState("");
  const options = Array.isArray(config?.options) ? config.options : [];

  // config 缺省（新建列 / 切换类型）时落默认空选项，保证保存写入 { options: [] }
  useEffect(() => {
    if (!config) onChange({ options: [] });
  }, [config, onChange]);

  const addOption = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (options.some(o => o.name === trimmed)) return;
    const newOption: SelectOption = {
      id: uuid(),
      name: trimmed,
      color: SELECT_COLORS[(options.length + 1) % SELECT_COLORS.length],
    };
    onChange({ options: [...options, newOption] });
  };

  const removeOption = (id: string) => {
    onChange({ options: options.filter(op => op.id !== id) });
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span className={labelClass}>选项</span>
      <Input
        value={optionInput}
        onChange={e => {
          setOptionInput(e.target.value);
        }}
        onKeyDown={e => {
          if (e.key === "Enter") {
            e.preventDefault();
            addOption(optionInput);
            setOptionInput("");
          }
        }}
        placeholder="输入后按回车新增"
      />
      {options.length > 0 && (
        <div className="mt-1">
          <SelectList options={options} onClear={removeOption} className="flex-wrap" />
        </div>
      )}
    </div>
  );
};

export default OptionsConfigPanel;
