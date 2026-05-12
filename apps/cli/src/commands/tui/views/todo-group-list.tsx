import React, { useState, useEffect, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import { closeDataAccess } from "../../../data-access/index.js";
import { padEnd } from "../../../utils/text.js";
import {
  queryTodoGroupsWithStats,
  type TodoGroupStats,
} from "../../../utils/todo-question-helpers.js";

export interface GroupSelection {
  groupId?: number;
  systemType?: string;
}

export function TodoGroupListView({
  onBack,
  onSelectGroup,
}: {
  onBack: () => void;
  onSelectGroup: (selection: GroupSelection) => void;
}) {
  const [groups, setGroups] = useState<TodoGroupStats[]>([]);
  const [cursor, setCursor] = useState(0);
  const [message, setMessage] = useState("");

  const loadGroups = useCallback(() => {
    try {
      setGroups(queryTodoGroupsWithStats());
    } catch (e: any) {
      setMessage(`Error: ${e.message}`);
    }
  }, []);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  const systemGroups = groups.filter((g) => g.is_system);
  const userGroups = groups.filter((g) => !g.is_system);
  const allDisplayed = [...systemGroups, ...userGroups];

  useInput((input, key) => {
    if (key.escape || input === "q") {
      closeDataAccess();
      onBack();
      return;
    }

    if (key.upArrow || input === "k") {
      setCursor((c) => (c > 0 ? c - 1 : allDisplayed.length - 1));
    } else if (key.downArrow || input === "j") {
      setCursor((c) => (c < allDisplayed.length - 1 ? c + 1 : 0));
    } else if (key.return) {
      const group = allDisplayed[cursor];
      if (group) {
        closeDataAccess();
        if (group.is_system) {
          onSelectGroup({ systemType: group.system_type || undefined });
        } else {
          onSelectGroup({ groupId: group.id });
        }
      }
    } else if (input === "r") {
      loadGroups();
      setMessage("Refreshed");
      setTimeout(() => setMessage(""), 1500);
    }
  });

  return (
    <Box flexDirection="column">
      <Box marginBottom={0}>
        <Text bold color="cyan">
          Todo Groups
        </Text>
        <Text dimColor> ({groups.length} groups)</Text>
      </Box>
      <Text dimColor>{"─".repeat(76)}</Text>

      {allDisplayed.length === 0 ? (
        <Box marginY={1}>
          <Text dimColor>No groups found.</Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          {allDisplayed.map((group, i) => {
            const isSelected = i === cursor;
            const showSeparator =
              i === systemGroups.length - 1 && userGroups.length > 0;
            const stats = `${group.total} 总 / ${group.pending} 待完成`;
            const overdueText =
              group.overdue > 0 ? ` / ${group.overdue} 逾期` : "";

            return (
              <React.Fragment key={group.id}>
                <Box>
                  <Text
                    color={isSelected ? "cyan" : undefined}
                    bold={isSelected}
                  >
                    {isSelected ? "❯" : " "}{" "}
                  </Text>
                  <Text color={group.color || "white"}>{"■"} </Text>
                  <Text
                    color={isSelected ? "white" : undefined}
                    bold={isSelected}
                  >
                    {padEnd(group.title, 18)}
                  </Text>
                  <Text dimColor>{padEnd(stats, 22)}</Text>
                  {group.overdue > 0 && <Text color="red">{overdueText}</Text>}
                  {group.is_system ? <Text dimColor> [系统]</Text> : null}
                </Box>
                {showSeparator && <Text dimColor>{"─".repeat(76)}</Text>}
              </React.Fragment>
            );
          })}
        </Box>
      )}

      <Text dimColor>{"─".repeat(76)}</Text>
      {message ? (
        <Text color="green">{message}</Text>
      ) : (
        <Text dimColor>
          ↑↓/jk navigate · Enter view tasks · r refresh · Esc back
        </Text>
      )}
    </Box>
  );
}
