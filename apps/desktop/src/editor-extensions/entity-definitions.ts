/** 宿主实体块的持久化声明，后台转换与界面装配共用。 */
export const entityElementDefinitions = [
  { type: "whiteboard", dataVersion: 1, kind: "block", isVoid: true },
  { type: "database", dataVersion: 1, kind: "block", isVoid: true },
  { type: "project-card-list", dataVersion: 1, kind: "block", isVoid: true },
] as const;
export const [
  whiteboardElementDefinition,
  databaseElementDefinition,
  projectCardListElementDefinition,
] = entityElementDefinitions;
