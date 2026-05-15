import React from "react";
import type { ReactNode } from "react";
import { Text } from "ink";

const HIGHLIGHT_COLORS: Record<string, string> = {
  blue: "#3b82f6",
  yellow: "#eab308",
  green: "#22c55e",
  red: "#ef4444",
  purple: "#a855f7",
};

export function renderFormattedText(leaf: any, index: number): ReactNode {
  const {
    text,
    bold,
    italic,
    underline,
    strikethrough,
    code,
    color,
    highlight,
  } = leaf;

  if (!text) return null;

  if (code) {
    return (
      <Text key={index} backgroundColor="#333333" color="#e5c07b">
        {` ${text} `}
      </Text>
    );
  }

  const props: Record<string, any> = {};
  if (bold) props.bold = true;
  if (italic) {
    props.dimColor = true;
  }
  if (underline) props.underline = true;
  if (strikethrough) props.strikethrough = true;
  if (color) props.color = color;
  if (highlight) {
    const bgColor =
      typeof highlight === "string" ? HIGHLIGHT_COLORS[highlight] : "#fef08a";
    props.backgroundColor = bgColor;
  }

  if (Object.keys(props).length === 0) {
    return <Text key={index}>{text}</Text>;
  }

  return (
    <Text key={index} {...props}>
      {text}
    </Text>
  );
}
