import React, { useState, useEffect, useRef, useMemo } from "react";
import { useMemoizedFn } from "ahooks";
import { v4 as uuid } from "uuid";
import classnames from "classnames";
import { produce } from "immer";

import { CellValue, ColumnDef, SelectOption } from "../../types";
import { SELECT_COLORS } from "../../constants";
import styles from "./index.module.less";
import { Popover } from "antd";
import Tags from "@/components/Tags";

interface SelectEditorProps {
  value: CellValue;
  column: ColumnDef<{ options: SelectOption[] }>;
  onCellValueChange: (value: CellValue) => void;
  onBlur: () => void;
  onColumnChange: (column: ColumnDef) => void;
}

const SelectEditor: React.FC<SelectEditorProps> = ({
  value,
  column,
  onColumnChange,
  onCellValueChange,
  onBlur,
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [options, setOptions] = useState<SelectOption[]>([]);
  const [selectedOptions, setSelectedOptions] = useState<SelectOption[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const isMultiSelect = column.type === "multiSelect";

  useEffect(() => {
    const config = column.config || { options: [] };
    const optionsFromConfig = Array.isArray(config.options)
      ? config.options
      : [];
    setOptions(optionsFromConfig);

    if (value) {
      if (isMultiSelect && Array.isArray(value)) {
        setSelectedOptions(
          config.options.filter((option) => value.includes(option.id)),
        );
      } else if (!isMultiSelect) {
        const option = config.options.find((option) => option.id === value);
        if (option) {
          setSelectedOptions([option]);
        } else {
          setSelectedOptions([]);
        }
      }
    }
  }, [column, value, isMultiSelect]);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const filteredOptions = useMemo(() => {
    if (!searchTerm) {
      return options;
    }
    return options.filter((option) =>
      option.name.toLowerCase().includes(searchTerm.toLowerCase()),
    );
  }, [options, searchTerm]);

  const addOption = (option: string): SelectOption | null => {
    if (option && !options.map((o) => o.name).includes(option)) {
      const newOption = {
        id: uuid(),
        name: option,
        color: SELECT_COLORS[(options.length + 1) % SELECT_COLORS.length],
      };
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
      // setIsOpen(false);
      // onBlur();
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
        const addedOption = addOption(searchTerm);
        if (addedOption) {
          handleSelect(addedOption);
        }
      }
      setSearchTerm("");
    } else if (e.key === "Escape") {
      setIsOpen(false);
      onBlur();
    }
  });

  return (
    <div className={styles.selectEditorContainer} ref={containerRef}>
      <div
        className={styles.selectDisplay}
        onClick={() => {
          setIsOpen(!isOpen);
          if (inputRef.current) {
            inputRef.current.focus();
          }
        }}
      >
        <div className={styles.selectedOptions}>
          <Tags
            tags={selectedOptions.map((option) => option.name)}
            showSharp={false}
            showIcon={false}
            hoverAble={false}
            onClose={(tag) => {
              const option = options?.find((option) => option.name === tag);
              if (option) {
                handleSelect(option);
              }
            }}
          />
          <input
            ref={inputRef}
            type="text"
            className={styles.searchInput}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={selectedOptions.length > 0 ? "" : "选择或输入..."}
          />
        </div>
      </div>
      <Popover
        placement="bottomLeft"
        trigger="click"
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsOpen(false);
            onBlur();
          }
        }}
        arrow={false}
        styles={{
          body: {
            width: 180,
            padding: 0,
          },
        }}
        content={
          <div className={styles.optionsDropdown} ref={popoverRef}>
            {filteredOptions.map((option) => (
              <div
                key={option.id}
                className={classnames(styles.option, {
                  [styles.selected]: selectedOptions.includes(option),
                })}
                onClick={() => handleSelect(option)}
              >
                {option.name}
              </div>
            ))}
            {searchTerm && filteredOptions.length === 0 && (
              <div
                className={styles.createOption}
                onClick={() => {
                  const addedOption = addOption(searchTerm);
                  if (addedOption) {
                    handleSelect(addedOption);
                  }
                  setSearchTerm("");
                }}
              >
                创建 "{searchTerm}"
              </div>
            )}
            {!searchTerm && filteredOptions.length === 0 && (
              <div className={styles.noOptions}>暂无选项</div>
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
