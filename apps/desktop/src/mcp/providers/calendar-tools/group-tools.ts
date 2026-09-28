import * as commands from "@/commands";
import { bindDatabaseCommands } from "@/services/command-context";
import { contextualTools } from "@/tools/contextualTools";
import type { ToolDefinition } from "@/types";
import {
  buildCalendarMessage,
  ensureEditableGroup,
  nullableNumberSchema,
  toFailureResult,
  toMutationResult,
} from "./shared";
import { CALENDAR_MUTATION_ACTIONS } from "@/mcp/calendar/mutation";

export const buildCalendarGroupTools = (): ToolDefinition[] =>
  contextualTools((context): ToolDefinition[] => {
    const {
      createCalendarGroup,
      deleteCalendarGroup,
      getAllCalendarGroups,
      getCalendarGroupById,
      updateCalendarGroup,
    } = bindDatabaseCommands(commands, context);
    return [
      {
        name: "create_calendar_group",
        description: "创建日历分组。适用于用户希望整理自己的日历结构时新增一个可归类的分组。",
        parameters: {
          type: "object",
          properties: {
            name: { type: "string" },
            parentGroupId: nullableNumberSchema,
            orderIndex: { type: "number" },
          },
          required: ["name"],
          additionalProperties: false,
        },
        executor: async args => {
          const groups = await getAllCalendarGroups();
          const group = await createCalendarGroup({
            name: args.name as string,
            isSystem: false,
            parentGroupId: (args.parentGroupId as number | null | undefined) ?? null,
            orderIndex:
              (args.orderIndex as number | undefined) ??
              groups.filter(item => !item.isSystem).length,
          });
          return toMutationResult({
            source: "calendar-mcp",
            entityType: "calendar-group",
            entityId: group.id,
            groupId: group.id,
            action: CALENDAR_MUTATION_ACTIONS.CREATE_GROUP,
            changedFields: ["name", "parentGroupId", "orderIndex"],
            data: group,
            message: "已创建日历分组。",
          });
        },
      },
      {
        name: "update_calendar_group",
        description: "更新日历分组。可修改分组名称、父分组和排序，系统分组默认只读。",
        parameters: {
          type: "object",
          properties: {
            id: { type: "number" },
            name: { type: "string" },
            parentGroupId: nullableNumberSchema,
            orderIndex: { type: "number" },
          },
          required: ["id"],
          additionalProperties: false,
        },
        executor: async args => {
          const current = await getCalendarGroupById(args.id as number);
          const errorCode = ensureEditableGroup(current);
          if (errorCode) {
            return toFailureResult({
              entityType: "calendar-group",
              action: CALENDAR_MUTATION_ACTIONS.UPDATE_GROUP,
              message: buildCalendarMessage(errorCode),
              data: current,
            });
          }

          const group = await updateCalendarGroup({
            ...current,
            name: (args.name as string | undefined) ?? current.name,
            parentGroupId:
              args.parentGroupId !== undefined
                ? ((args.parentGroupId as number | null) ?? null)
                : current.parentGroupId,
            orderIndex: (args.orderIndex as number | undefined) ?? current.orderIndex,
          });
          return toMutationResult({
            source: "calendar-mcp",
            entityType: "calendar-group",
            entityId: group.id,
            groupId: group.id,
            action: CALENDAR_MUTATION_ACTIONS.UPDATE_GROUP,
            changedFields: ["name", "parentGroupId", "orderIndex"],
            data: group,
            message: "已更新日历分组。",
          });
        },
      },
      {
        name: "delete_calendar_group",
        description: "删除日历分组。系统分组默认只读；删除前应确保该分组可安全移除。",
        parameters: {
          type: "object",
          properties: {
            id: { type: "number" },
          },
          required: ["id"],
          additionalProperties: false,
        },
        executor: async args => {
          const current = await getCalendarGroupById(args.id as number);
          const errorCode = ensureEditableGroup(current);
          if (errorCode) {
            return toFailureResult({
              entityType: "calendar-group",
              action: CALENDAR_MUTATION_ACTIONS.DELETE_GROUP,
              message: buildCalendarMessage(errorCode),
              data: current,
            });
          }

          await deleteCalendarGroup(current.id);
          return toMutationResult({
            source: "calendar-mcp",
            entityType: "calendar-group",
            entityId: current.id,
            groupId: current.id,
            action: CALENDAR_MUTATION_ACTIONS.DELETE_GROUP,
            data: {
              id: current.id,
              name: current.name,
            },
            message: "已删除日历分组。",
          });
        },
      },
    ];
  });
