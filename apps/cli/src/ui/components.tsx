import React from "react";
import { Box, Text } from "ink";

export function Divider({ width = 35 }: { width?: number }) {
  return <Text dimColor>{"─".repeat(width)}</Text>;
}

export function Header({ children }: { children: React.ReactNode }) {
  return (
    <Box marginBottom={1}>
      <Text bold color="cyan">
        {children}
      </Text>
    </Box>
  );
}

export function KeyValue({
  label,
  value,
  labelWidth = 16,
  color,
}: {
  label: string;
  value: string;
  labelWidth?: number;
  color?: string;
}) {
  return (
    <Box>
      <Box width={labelWidth}>
        <Text dimColor>{label}</Text>
      </Box>
      <Text color={color}>{value}</Text>
    </Box>
  );
}

export function StatusBadge({
  active,
  activeText = "Active",
  inactiveText = "Inactive",
}: {
  active: boolean;
  activeText?: string;
  inactiveText?: string;
}) {
  return (
    <Text color={active ? "green" : "yellow"}>
      {active ? `● ${activeText}` : `○ ${inactiveText}`}
    </Text>
  );
}

export function HelpText({ children }: { children: React.ReactNode }) {
  return (
    <Box marginTop={1}>
      <Text dimColor italic>
        {children}
      </Text>
    </Box>
  );
}
