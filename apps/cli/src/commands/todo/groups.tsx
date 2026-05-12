import React from "react";
import { render, Box, Text } from "ink";
import { closeDataAccess } from "../../data-access/index.js";
import { padEnd } from "../../utils/text.js";
import {
  queryTodoGroupsWithStats,
  type TodoGroupStats,
} from "../../utils/todo-question-helpers.js";

function GroupsOutput({ groups }: { groups: TodoGroupStats[] }) {
  if (groups.length === 0) {
    return (
      <Box paddingX={1}>
        <Text dimColor>No groups found.</Text>
      </Box>
    );
  }

  const systemGroups = groups.filter((g) => g.is_system);
  const userGroups = groups.filter((g) => !g.is_system);

  return (
    <Box flexDirection="column">
      <Box marginBottom={0}>
        <Text bold color="cyan">
          Todo Groups
        </Text>
        <Text dimColor> ({groups.length} groups)</Text>
      </Box>
      <Text dimColor>{"─".repeat(72)}</Text>
      {systemGroups.length > 0 && (
        <Box flexDirection="column">
          {systemGroups.map((g) => (
            <GroupLine key={g.id} group={g} />
          ))}
          <Text dimColor>{"─".repeat(72)}</Text>
        </Box>
      )}
      {userGroups.map((g) => (
        <GroupLine key={g.id} group={g} />
      ))}
      <Text dimColor>{"─".repeat(72)}</Text>
    </Box>
  );
}

function GroupLine({ group }: { group: TodoGroupStats }) {
  const stats = `${group.total} 总 / ${group.pending} 待完成`;
  const overdueText = group.overdue > 0 ? ` / ${group.overdue} 逾期` : "";

  return (
    <Box>
      <Text color={group.color || "white"}> {"■"} </Text>
      <Text>{padEnd(group.title, 20)}</Text>
      <Text dimColor>{padEnd(stats, 24)}</Text>
      {group.overdue > 0 && <Text color="red">{overdueText}</Text>}
      {group.is_system ? <Text dimColor> [系统]</Text> : null}
    </Box>
  );
}

export async function runTodoGroups() {
  try {
    const groups = queryTodoGroupsWithStats();
    const { waitUntilExit } = render(<GroupsOutput groups={groups} />);
    await waitUntilExit();
  } finally {
    closeDataAccess();
  }
}
