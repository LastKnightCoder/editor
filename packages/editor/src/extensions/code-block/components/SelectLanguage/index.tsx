import classnames from "classnames";
import { Flex, Popover } from "antd";
import { CODE_BLOCK_LANGUAGE_OPTIONS, normalizeCodeBlockLanguageDisplayName } from "@tau/shared";

import styles from "./index.module.less";
import { For } from "@tau/shared";
import React, { useState } from "react";

interface SelectLanguageProps {
  value: string;
  onChange: (value: string) => void;
  style?: React.CSSProperties;
  className?: string;
  readonly?: boolean;
}

const SelectLanguage = (props: SelectLanguageProps) => {
  const { value, onChange, className, style = {}, readonly } = props;

  const [open, setOpen] = useState(false);
  const normalizedValue = normalizeCodeBlockLanguageDisplayName(value);

  return (
    <Popover
      placement={"bottom"}
      open={!readonly && open}
      onOpenChange={open => {
        if (readonly) {
          setOpen(false);
          return;
        }
        setOpen(open);
      }}
      trigger={"click"}
      styles={{
        content: {
          padding: 4,
          color: "var(--ed-text)",
        },
      }}
      arrow={false}
      content={
        <Flex vertical gap={4} style={{ height: 400, overflow: "auto" }}>
          <For
            data={CODE_BLOCK_LANGUAGE_OPTIONS}
            renderItem={item => {
              return (
                <div
                  key={item.value}
                  className={classnames(styles.languageItem, {
                    [styles.active]: normalizedValue === item.value,
                  })}
                  onClick={() => {
                    if (readonly) return;
                    onChange(item.value);
                    setOpen(false);
                  }}
                  style={{
                    color: "var(--ed-text)",
                  }}
                >
                  {item.label}
                </div>
              );
            }}
          />
        </Flex>
      }
    >
      <div
        style={{
          ...style,
          color: "var(--ed-text)",
        }}
        className={classnames(styles.selectLanguage, className, {
          [styles.disable]: readonly,
        })}
      >
        {normalizedValue}
      </div>
    </Popover>
  );
};

export default SelectLanguage;
