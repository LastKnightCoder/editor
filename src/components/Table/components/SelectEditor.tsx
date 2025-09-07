import React, { useState, useEffect, useRef, useMemo } from "react";
import { useMemoizedFn } from "ahooks";
import { v4 as uuid } from "uuid";
import classnames from "classnames";
import { produce } from "immer";

import { CellValue, ColumnDef, SelectOption } from "../types";
import { SELECT_COLORS } from "../constants";
import { Popover } from "antd";
import SelectList from "./SelectList";
import VerticalSelectList from "./VerticalSelectList";

interface SelectEditorProps {
  value: CellValue;
  column: ColumnDef<{ options: SelectOption[] }>;
  onCellValueChange: (value: CellValue) => void;
  onFinishEdit: () => void;
  onColumnChange: (column: ColumnDef<{ options: SelectOption[] }>) => void;
  config?: { options: SelectOption[] };
  theme: "light" | "dark";
}

const SelectEditor: React.FC<SelectEditorProps> = ({
  value,
  column,
  onColumnChange,
  onCellValueChange,
  onFinishEdit,
  theme,
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [options, setOptions] = useState<SelectOption[]>([]);
  const [selectedOptions, setSelectedOptions] = useState<SelectOption[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const nextColor = useMemo(() => {
    return SELECT_COLORS[(options.length + 1) % SELECT_COLORS.length];
  }, [options]);

  const isMultiSelect = column.type === "multiSelect";
  const isDark = theme === "dark";

  useEffect(() => {
    const config = column.config || { options: [] };
    const optionsFromConfig: SelectOption[] = Array.isArray(config.options)
      ? (config.options as SelectOption[])
      : [];

    setOptions(optionsFromConfig);

    // 初始化选中值（严格依赖对象数组）
    if (value) {
      if (isMultiSelect && Array.isArray(value)) {
        setSelectedOptions(
          optionsFromConfig.filter((option) => value.includes(option.id)),
        );
      } else if (!isMultiSelect) {
        const option = optionsFromConfig.find((option) => option.id === value);
        setSelectedOptions(option ? [option] : []);
      }
    } else {
      setSelectedOptions([]);
    }
  }, [column, value, isMultiSelect]);

  const filteredOptions = useMemo(() => {
    if (!searchTerm) {
      return options;
    }
    return options.filter((option) =>
      option.name.toLowerCase().includes(searchTerm.toLowerCase()),
    );
  }, [options, searchTerm]);

  const addOption = (
    option: string,
    color: (typeof SELECT_COLORS)[number],
  ): SelectOption | null => {
    if (option && !options.map((o) => o.name).includes(option)) {
      const newOption = {
        id: uuid(),
        name: option,
        color,
      } satisfies SelectOption;
      const newOptions = [...options, newOption];
      setOptions(newOptions);

      const newColumn = produce(column, (draft) => {
        if (draft.config) {
          draft.config.options = newOptions;
        } else {
          draft.config = { options: newOptions };
        }
      }) as ColumnDef<{ options: SelectOption[] }>;
      onColumnChange?.(newColumn);

      return newOption;
    }
    return null;
  };

  const handleSelect = useMemoizedFn((option: SelectOption) => {
    let newSelectedOptions: SelectOption[];

    if (isMultiSelect) {
      if (selectedOptions.includes(option)) {
        newSelectedOptions = selectedOptions.filter((item) => item !== option);
      } else {
        newSelectedOptions = [...selectedOptions, option];
      }
    } else {
      newSelectedOptions = [option];
    }

    setSelectedOptions(newSelectedOptions);
    onCellValueChange(
      isMultiSelect ? newSelectedOptions.map((o) => o.id) : option.id,
    );
  });

  const handleKeyDown = useMemoizedFn((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && searchTerm) {
      e.preventDefault();
      const matchingOption = options.find(
        (option) => option.name.toLowerCase() === searchTerm.toLowerCase(),
      );

      if (matchingOption) {
        handleSelect(matchingOption);
      } else {
        const addedOption = addOption(searchTerm, nextColor);
        if (addedOption) {
          handleSelect(addedOption);
        }
      }
      setSearchTerm("");
    } else if (e.key === "Escape") {
      setIsOpen(false);
      onFinishEdit();
    }
  });

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 100);
    }
  }, [isOpen]);

  return (
    <div
      className="relative w-full h-full py-0 px-4 relative"
      onClick={() => {
        setIsOpen(!isOpen);
      }}
      ref={containerRef}
    >
      <SelectList options={selectedOptions} theme={theme} />
      <Popover
        placement="bottomLeft"
        trigger="click"
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsOpen(false);
            onFinishEdit();
          }
        }}
        arrow={false}
        styles={{
          body: {
            padding: 0,
            background: "transparent",
          },
        }}
        content={
          <div
            className={classnames(
              "max-w-[180px] max-h-100 flex flex-col overflow-y-auto rounded-lg shadow-lg mt-2 -ml-2 p-0 border",
              {
                "bg-white border-gray-200": !isDark,
                "bg-gray-900 border-gray-700": isDark,
              },
            )}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
            ref={popoverRef}
          >
            <input
              ref={inputRef}
              type="text"
              className={classnames(
                "outline-none border-b-1 bg-transparent text-[14px] px-4 py-2 placeholder-gray-400",
                {
                  "text-gray-900 border-gray-200": !isDark,
                  "text-gray-100 border-gray-700": isDark,
                },
              )}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={selectedOptions.length > 0 ? "" : "选择或输入..."}
              autoFocus
            />
            <div className="px-2 mt-2 mb-1 text-[12px] text-gray-500">
              选择或创建一个选项
            </div>
            <VerticalSelectList
              options={filteredOptions}
              theme={theme}
              onSelect={handleSelect}
              className="my-1 px-1"
            />
            {searchTerm && filteredOptions.length === 0 && (
              <div
                onClick={() => {
                  const addedOption = addOption(searchTerm, nextColor);
                  if (addedOption) {
                    handleSelect(addedOption);
                  }
                  setSearchTerm("");
                }}
              >
                <div
                  className={classnames(
                    "m-1 p-1 rounded-md flex items-center gap-1 cursor-pointer text-[12px] text-gray-500",
                    {
                      "hover:bg-gray-100": !isDark,
                      "hover:bg-gray-700": isDark,
                    },
                  )}
                >
                  <div>创建</div>
                  <SelectList
                    options={[
                      {
                        id: nextColor,
                        name: searchTerm,
                        color: nextColor,
                      },
                    ]}
                    theme={theme}
                  />
                </div>
              </div>
            )}
          </div>
        }
      >
        <div style={{ width: 200 }}></div>
      </Popover>
    </div>
  );
};

export default SelectEditor;
