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

  const initOptions = useMemoizedFn(() => {
    const config = column.config || { options: [] };
    const optionsFromConfig: SelectOption[] = Array.isArray(config.options)
      ? (config.options as SelectOption[])
      : [];

    setOptions(optionsFromConfig);

    if (value) {
      if (isMultiSelect && Array.isArray(value)) {
        setSelectedOptions(
          value
            .map((optionId) =>
              optionsFromConfig.find((option) => option.id === optionId),
            )
            .filter((option) => option !== undefined),
        );
      } else if (!isMultiSelect) {
        const option = optionsFromConfig.find((option) => option.id === value);
        setSelectedOptions(option ? [option] : []);
      }
    } else {
      setSelectedOptions([]);
    }
  });

  useEffect(() => {
    initOptions();
  }, [initOptions]);

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

  const removeSelectedOption = useMemoizedFn((optionId: string) => {
    onCellValueChange(
      isMultiSelect
        ? selectedOptions
            .filter((item) => item.id !== optionId)
            .map((o) => o.id)
        : selectedOptions.filter((item) => item.id !== optionId)[0].id,
    );
    setSelectedOptions(selectedOptions.filter((item) => item.id !== optionId));
    console.log(
      "[SelectEditor] removeSelectedOption:",
      selectedOptions.filter((item) => item.id !== optionId),
    );
  });

  const deleteOption = useMemoizedFn((option: SelectOption) => {
    // 从选项列表中删除该选项
    const newOptions = options.filter((o) => o.id !== option.id);
    setOptions(newOptions);

    // 更新列配置
    const newColumn = produce(column, (draft) => {
      if (draft.config) {
        draft.config.options = newOptions;
      }
    }) as ColumnDef<{ options: SelectOption[] }>;
    onColumnChange?.(newColumn);

    // 如果该选项被选中，则从选中项中移除
    const newSelectedOptions = selectedOptions.filter(
      (selected) => selected.id !== option.id,
    );
    setSelectedOptions(newSelectedOptions);
    onCellValueChange(
      isMultiSelect
        ? newSelectedOptions.map((o) => o.id)
        : newSelectedOptions[0].id,
    );
  });

  const changeOptionColor = useMemoizedFn(
    (option: SelectOption, newColor: (typeof SELECT_COLORS)[number]) => {
      // 更新选项颜色
      const newOptions = options.map((o) =>
        o.id === option.id ? { ...o, color: newColor } : o,
      );
      setOptions(newOptions);

      // 更新列配置
      const newColumn = produce(column, (draft) => {
        if (draft.config) {
          draft.config.options = newOptions;
        }
      }) as ColumnDef<{ options: SelectOption[] }>;
      onColumnChange?.(newColumn);

      // 更新已选中的选项（如果该选项被选中）
      const newSelectedOptions = selectedOptions.map((selected) =>
        selected.id === option.id ? { ...selected, color: newColor } : selected,
      );
      setSelectedOptions(newSelectedOptions);
      onCellValueChange(
        isMultiSelect
          ? newSelectedOptions.map((o) => o.id)
          : newSelectedOptions[0].id,
      );
    },
  );

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
      isMultiSelect
        ? newSelectedOptions.map((o) => o.id)
        : newSelectedOptions[0].id,
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
      onCellValueChange(
        isMultiSelect
          ? selectedOptions.map((o) => o.id)
          : selectedOptions[0].id,
      );
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
        placement="bottom"
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
              "relative max-w-[180px] max-h-[240px] flex flex-col overflow-y-auto rounded-lg shadow-lg border",
              {
                "bg-white border-gray-200": !isDark,
                "bg-black border-gray-500": isDark,
                "-mt-10": selectedOptions.length > 0,
              },
            )}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
            ref={popoverRef}
          >
            {selectedOptions.length > 0 && (
              <div className="my-2">
                <SelectList
                  options={selectedOptions}
                  onClear={removeSelectedOption}
                  theme={theme}
                  className="flex-wrap px-3 gap-2"
                />
              </div>
            )}
            <input
              ref={inputRef}
              type="text"
              className={classnames(
                "outline-none border-b-1 bg-transparent text-[14px] px-3 py-2 placeholder-gray-400",
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
            <div className="px-3 mt-2 mb-1 text-[12px] text-gray-500">
              选择或创建一个选项
            </div>
            <VerticalSelectList
              options={filteredOptions}
              theme={theme}
              onSelect={handleSelect}
              onDelete={deleteOption}
              onColorChange={changeOptionColor}
              className="my-1 px-2 max-h-[160px] overflow-y-auto"
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
                    "m-1 px-2 py-1 rounded-md flex items-center gap-1 cursor-pointer text-[12px] text-gray-500",
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
        <div className="w-full h-full"></div>
      </Popover>
    </div>
  );
};

export default SelectEditor;
