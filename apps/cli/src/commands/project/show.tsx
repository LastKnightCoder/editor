import React from "react";
import { render, Box, Text } from "ink";
import { getDataAccess, closeDataAccess } from "../../data-access/index.js";
import { getActiveDbName } from "../../utils/path.js";
import { Header, Divider } from "../../ui/components.js";
import { formatDate } from "../../utils/text.js";
import { buildTreeLines, TreeNode } from "../../utils/tree.js";

interface ProjectRow {
  id: number;
  create_time: number;
  update_time: number;
  title: string;
  desc: string | null;
  children: string;
  archived: number;
  pinned: number;
  project_type: string;
}

interface ProjectItemRow {
  id: number;
  title: string;
  children: string;
  project_item_type: string;
}

function getTypeLabel(type: string): string {
  switch (type) {
    case "document-tree":
      return "文档树";
    case "data-table":
      return "数据表";
    case "vibe-learning":
      return "学习";
    default:
      return type;
  }
}

function ProjectShowView({
  project,
  treeLines,
}: {
  project: ProjectRow;
  treeLines: { text: string; id: number }[];
}) {
  return (
    <Box flexDirection="column" paddingX={1}>
      <Header>
        Project #{project.id}: {project.title}
      </Header>
      <Divider width={60} />
      <Box flexDirection="column" gap={0} marginBottom={1}>
        <Box>
          <Box width={14}>
            <Text dimColor>Type</Text>
          </Box>
          <Text>{getTypeLabel(project.project_type)}</Text>
        </Box>
        <Box>
          <Box width={14}>
            <Text dimColor>Pinned</Text>
          </Box>
          <Text>{project.pinned ? "Yes" : "No"}</Text>
        </Box>
        <Box>
          <Box width={14}>
            <Text dimColor>Archived</Text>
          </Box>
          <Text>{project.archived ? "Yes" : "No"}</Text>
        </Box>
        <Box>
          <Box width={14}>
            <Text dimColor>Items</Text>
          </Box>
          <Text>{treeLines.length}</Text>
        </Box>
        <Box>
          <Box width={14}>
            <Text dimColor>Created</Text>
          </Box>
          <Text dimColor>{formatDate(project.create_time)}</Text>
        </Box>
        <Box>
          <Box width={14}>
            <Text dimColor>Updated</Text>
          </Box>
          <Text dimColor>{formatDate(project.update_time)}</Text>
        </Box>
      </Box>
      <Divider width={60} />
      {treeLines.length > 0 ? (
        <Box flexDirection="column" marginTop={1}>
          <Text bold dimColor>
            Items:
          </Text>
          {treeLines.map((line) => (
            <Text key={line.id}>{line.text}</Text>
          ))}
        </Box>
      ) : (
        <Box marginTop={1}>
          <Text dimColor>(no items)</Text>
        </Box>
      )}
    </Box>
  );
}

export async function runProjectShow(projectId: number) {
  const dbName = getActiveDbName();
  const da = getDataAccess(dbName);

  const project = da.queryOne<ProjectRow>(
    `SELECT id, create_time, update_time, title, desc, children, archived, pinned, project_type
     FROM project WHERE id = ?`,
    projectId,
  );

  if (!project) {
    closeDataAccess();
    render(
      <Box paddingX={1}>
        <Text color="red">Project #{projectId} not found.</Text>
      </Box>,
    );
    return;
  }

  let rootIds: number[] = [];
  try {
    rootIds = JSON.parse(project.children) as number[];
  } catch {
    /* ignore parse error */
  }

  const items = da.query<ProjectItemRow>(
    `SELECT id, title, children, project_item_type FROM project_item
     WHERE EXISTS (SELECT 1 FROM json_each(projects) WHERE value = ?)`,
    projectId,
  );

  closeDataAccess();

  const nodeMap = new Map<number, TreeNode>();
  for (const item of items) {
    let children: number[] = [];
    try {
      children = JSON.parse(item.children) as number[];
    } catch {
      /* ignore parse error */
    }
    nodeMap.set(item.id, {
      id: item.id,
      title: item.title,
      type: item.project_item_type,
      children,
    });
  }

  const treeLines = buildTreeLines(rootIds, nodeMap);

  render(<ProjectShowView project={project} treeLines={treeLines} />);
}
