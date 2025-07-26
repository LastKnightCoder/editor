import classnames from "classnames";
import { Flex, Popover } from "antd";

import styles from "./index.module.less";
import For from "@/components/For";
import React, { useState } from "react";
import useTheme from "../../../../hooks/useTheme";

interface SelectLanguageProps {
  value: string;
  onChange: (value: string) => void;
  style?: React.CSSProperties;
  className?: string;
  readonly?: boolean;
}

const aliases: Record<string, string> = {
  js: "JavaScript",
  ts: "TypeScript",
  rs: "Rust",
  py: "Python",
  md: "Markdown",
  xml: "HTML",
  latex: "LaTex",
  cpp: "C++",
  sh: "Shell",
  zsh: "Shell",
};

const languages = [
  { label: "JavaScript", value: "JavaScript" },
  { label: "TypeScript", value: "TypeScript" },
  { label: "JSX", value: "JSX" },
  { label: "TSX", value: "TSX" },
  { label: "HTML", value: "HTML" },
  { label: "CSS", value: "CSS" },
  { label: "Vue", value: "Vue" },
  { label: "C", value: "C" },
  { label: "C++", value: "C++" },
  { label: "C#", value: "C#" },
  { label: "Java", value: "Java" },
  { label: "Rust", value: "Rust" },
  { label: "Go", value: "Go" },
  { label: "Python", value: "Python" },
  { label: "Objective C", value: "Objective C" },
  { label: "Scale", value: "Scale" },
  { label: "JSON", value: "JSON" },
  { label: "XML", value: "HTML/XML" },
  { label: "YAML", value: "YAML" },
  { label: "HTTP", value: "HTTP" },
  { label: "Diff", value: "Diff" },
  { label: "Bash", value: "Bash" },
  { label: "Shell", value: "Shell" },
  { label: "MySQL", value: "MySQL" },
  { label: "SQL", value: "sql" },
  { label: "Latex", value: "stex" },
  { label: "Markdown", value: "markdown" },
];

const SelectLanguage = (props: SelectLanguageProps) => {
  const { value, onChange, className, style = {}, readonly } = props;
  const { isDark } = useTheme();

  const [open, setOpen] = useState(false);

  return (
    <Popover
      placement={"bottom"}
      open={!readonly && open}
      onOpenChange={(open) => {
        if (readonly) {
          setOpen(false);
          return;
        }
        setOpen(open);
      }}
      trigger={"click"}
      styles={{
        body: {
          padding: 4,
          color: isDark ? "#fff" : "#000",
        },
      }}
      arrow={false}
      content={
        <Flex vertical gap={4} style={{ height: 400, overflow: "auto" }}>
          <For
            data={languages}
            renderItem={(item) => {
              return (
                <div
                  key={item.value}
                  className={classnames(styles.languageItem, {
                    [styles.active]: value === item.value,
                  })}
                  onClick={() => {
                    if (readonly) return;
                    onChange(item.value);
                    setOpen(false);
                  }}
                  style={{
                    color: isDark ? "#fff" : "#000",
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
          color: isDark ? "#fff" : "#000",
        }}
        className={classnames(styles.selectLanguage, className, {
          [styles.disable]: readonly,
        })}
      >
        {aliases[value] || value}
      </div>
    </Popover>
  );
};

export default SelectLanguage;
