import React, { useState, useEffect, useRef, useMemo } from "react";
import { useMemoizedFn } from "ahooks";
import { v4 as uuid } from "uuid";
import { Plus } from "lucide-react";
import { produce } from "immer";

import { CellValue, ColumnDef, SelectOption } from "../../../types";
import { SELECT_COLORS } from "../../../constants";
import { Popover } from "@tau/ui";
import SelectList from "./SelectList";
import VerticalSelectList from "./VerticalSelectList";

interface SelectEditorProps {
  value: CellValue;
  column: ColumnDef<{ options: SelectOption[] }>;
  onCellValueChange: (value: CellValue) => void;
  onFinishEdit: () => void;
  onColumnChange: (column: ColumnDef<{ options: SelectOption[] }>) => void;
  theme: "light" | "dark";
  autoOpen?: boolean;
}

const SelectEditor: React.FC<SelectEditorProps> = ({
  value,
  column,
  onColumnChange,
  onCellValueChange,
  onFinishEdit,
  autoOpen = false,
}) => {
  const [isOpen, setIsOpen] = useState(autoOpen);
  const [searchTerm, setSearchTerm] = useState("");
  const [options, setOptions] = useState<SelectOption[]>([]);
  const [selectedOptions, setSelectedOptions] = useState<SelectOption[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const nextColor = useMemo(() => {
    return SELECT_COLORS[(options.length + 1) % SELECT_COLORS.length];
  }, [options]);

  const isMultiSelect = column.type === "multiSelect";

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
            .map(optionId => optionsFromConfig.find(option => option.id === optionId))
            .filter(option => option !== undefined)
        );
      } else if (!isMultiSelect) {
        const option = optionsFromConfig.find(option => option.id === value);
        setSelectedOptions(option ? [option] : []);
      }
    } else {
      setSelectedOptions([]);
    }
  });

  useEffect(() => {
    initOptions();
  }, [initOptions, value, column.id]);

  const filteredOptions = useMemo(() => {
    if (!searchTerm) {
      return options;
    }
    return options.filter(option => option.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [options, searchTerm]);

  const addOption = (
    option: string,
    color: (typeof SELECT_COLORS)[number]
  ): SelectOption | null => {
    if (option && !options.map(o => o.name).includes(option)) {
      const newOption = {
        id: uuid(),
        name: option,
        color,
      } satisfies SelectOption;
      const newOptions = [...options, newOption];
      setOptions(newOptions);

      const newColumn = produce(column, draft => {
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
        ? selectedOptions.filter(item => item.id !== optionId).map(o => o.id)
        : selectedOptions.filter(item => item.id !== optionId)[0].id
    );
    setSelectedOptions(selectedOptions.filter(item => item.id !== optionId));
  });

  const deleteOption = useMemoizedFn((option: SelectOption) => {
    // 从选项列表中删除该选项
    const newOptions = options.filter(o => o.id !== option.id);
    setOptions(newOptions);

    // 更新列配置
    const newColumn = produce(column, draft => {
      if (draft.config) {
        draft.config.options = newOptions;
      }
    }) as ColumnDef<{ options: SelectOption[] }>;
    onColumnChange?.(newColumn);

    // 如果该选项被选中，则从选中项中移除
    const newSelectedOptions = selectedOptions.filter(selected => selected.id !== option.id);
    setSelectedOptions(newSelectedOptions);
    onCellValueChange(isMultiSelect ? newSelectedOptions.map(o => o.id) : newSelectedOptions[0].id);
  });

  const changeOptionColor = useMemoizedFn(
    (option: SelectOption, newColor: (typeof SELECT_COLORS)[number]) => {
      // 更新选项颜色
      const newOptions = options.map(o => (o.id === option.id ? { ...o, color: newColor } : o));
      setOptions(newOptions);

      // 更新列配置
      const newColumn = produce(column, draft => {
        if (draft.config) {
          draft.config.options = newOptions;
        }
      }) as ColumnDef<{ options: SelectOption[] }>;
      onColumnChange?.(newColumn);

      // 更新已选中的选项（如果该选项被选中）
      const newSelectedOptions = selectedOptions.map(selected =>
        selected.id === option.id ? { ...selected, color: newColor } : selected
      );
      setSelectedOptions(newSelectedOptions);
      onCellValueChange(
        isMultiSelect ? newSelectedOptions.map(o => o.id) : newSelectedOptions[0].id
      );
    }
  );

  const editOptionName = useMemoizedFn((option: SelectOption, newName: string) => {
    // 检查新名称是否已存在（排除当前选项）
    const nameExists = options.some(o => o.id !== option.id && o.name === newName);

    if (nameExists || !newName.trim()) {
      return;
    }

    // 更新选项名称
    const newOptions = options.map(o => (o.id === option.id ? { ...o, name: newName } : o));
    setOptions(newOptions);

    // 更新列配置
    const newColumn = produce(column, draft => {
      if (draft.config) {
        draft.config.options = newOptions;
      }
    }) as ColumnDef<{ options: SelectOption[] }>;
    onColumnChange?.(newColumn);

    // 更新已选中的选项（如果该选项被选中）
    const newSelectedOptions = selectedOptions.map(selected =>
      selected.id === option.id ? { ...selected, name: newName } : selected
    );
    setSelectedOptions(newSelectedOptions);
  });

  const handleSelect = useMemoizedFn((option: SelectOption) => {
    let newSelectedOptions: SelectOption[];

    if (isMultiSelect) {
      if (selectedOptions.includes(option)) {
        newSelectedOptions = selectedOptions.filter(item => item !== option);
      } else {
        newSelectedOptions = [...selectedOptions, option];
      }
    } else {
      newSelectedOptions = [option];
    }
    setSelectedOptions(newSelectedOptions);
    onCellValueChange(isMultiSelect ? newSelectedOptions.map(o => o.id) : newSelectedOptions[0].id);
  });

  const handleKeyDown = useMemoizedFn((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && searchTerm) {
      e.preventDefault();
      const matchingOption = options.find(
        option => option.name.toLowerCase() === searchTerm.toLowerCase()
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
      onCellValueChange(isMultiSelect ? selectedOptions.map(o => o.id) : selectedOptions[0].id);
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
      className="relative h-full w-full px-2 py-0"
      onClick={() => {
        setIsOpen(!isOpen);
      }}
      ref={containerRef}
    >
      <SelectList options={selectedOptions} />
      <Popover
        anchor={containerRef.current}
        placement="bottom"
        open={isOpen}
        onOpenChange={open => {
          if (!open) {
            setIsOpen(false);
            onFinishEdit();
          }
        }}
        arrow={false}
        className={selectedOptions.length > 0 ? "-mt-10 w-[236px]" : "w-[236px]"}
      >
        <div
          className="text-ink-1 relative flex max-h-[240px] flex-col overflow-y-auto"
          onClick={e => {
            e.stopPropagation();
            e.preventDefault();
          }}
          onMouseDown={e => {
            e.stopPropagation();
          }}
        >
          {selectedOptions.length > 0 && (
            <div className="my-2">
              <SelectList
                options={selectedOptions}
                onClear={removeSelectedOption}
                className="flex-wrap gap-2 px-3"
              />
            </div>
          )}
          <input
            ref={inputRef}
            type="text"
            className="border-line-2 placeholder:text-ink-3 text-tau-body border-b bg-transparent px-3 py-2 outline-none"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={selectedOptions.length > 0 ? "" : "选择或输入..."}
            autoFocus
          />
          <div className="text-tau-sm text-ink-3 mb-1 mt-2 px-3">选择或创建一个选项</div>
          <VerticalSelectList
            options={filteredOptions}
            onSelect={handleSelect}
            onDelete={deleteOption}
            onEdit={editOptionName}
            onColorChange={changeOptionColor}
            className="my-1 max-h-[160px] overflow-y-auto px-2"
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
              <div className="hover:bg-hover text-ink-2 rounded-tau-sm text-tau-sm m-1 flex cursor-pointer items-center gap-1 px-2 py-1">
                <Plus className="size-3.5" strokeWidth={1.75} />
                <div>创建</div>
                <SelectList
                  options={[
                    {
                      id: nextColor,
                      name: searchTerm,
                      color: nextColor,
                    },
                  ]}
                />
              </div>
            </div>
          )}
        </div>
      </Popover>
    </div>
  );
};

export default SelectEditor;
