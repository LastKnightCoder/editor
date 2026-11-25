import colors from "./directory-colors.json";

export type DirectoryColor = keyof typeof colors;
export type DirectoryEntity = "todo-list" | "calendar";
export interface TodoListInput {
  title: string;
  color?: DirectoryColor | null;
}
export type TodoListPatch = Partial<TodoListInput>;
export interface CalendarDirectoryInput {
  title: string;
  color?: DirectoryColor;
  visible?: boolean;
}
export type CalendarDirectoryPatch = Partial<CalendarDirectoryInput>;

export function readDirectoryFields(
  entity: DirectoryEntity,
  input: unknown,
  create: boolean
): TodoListInput | TodoListPatch | CalendarDirectoryInput | CalendarDirectoryPatch {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("目录字段必须是对象");
  const fields = input as Record<string, unknown>;
  const allowed = entity === "calendar" ? ["title", "color", "visible"] : ["title", "color"];
  if (Object.keys(fields).some(key => !allowed.includes(key)))
    throw new Error("目录包含不支持的修改字段");
  const result: Record<string, unknown> = {};
  if (create || fields.title !== undefined) {
    if (
      typeof fields.title !== "string" ||
      !fields.title.trim() ||
      hasControlCharacter(fields.title)
    )
      throw new Error("目录名称不能为空或包含控制字符");
    result.title = fields.title;
  }
  if (fields.color !== undefined) {
    if (
      !(entity === "todo-list" && fields.color === null) &&
      !(typeof fields.color === "string" && Object.hasOwn(colors, fields.color))
    )
      throw new Error("目录颜色不属于宿主色板");
    result.color = fields.color;
  }
  if (fields.visible !== undefined) {
    if (entity !== "calendar" || typeof fields.visible !== "boolean")
      throw new Error("日历可见性必须是布尔值");
    result.visible = fields.visible;
  }
  if (!Object.keys(result).length) throw new Error("目录修改至少包含一个字段");
  return result as unknown as
    | TodoListInput
    | TodoListPatch
    | CalendarDirectoryInput
    | CalendarDirectoryPatch;
}

function hasControlCharacter(text: string): boolean {
  return Array.from(text).some(character => {
    const code = character.charCodeAt(0);
    return code < 32 || (code >= 127 && code <= 159) || code === 0x2028 || code === 0x2029;
  });
}
