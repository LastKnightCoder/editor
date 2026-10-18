import type { EventProperties } from "./index";

interface PropertyRule {
  type: "string" | "number" | "boolean";
  required?: boolean;
  max?: number;
}
interface EventDefinition {
  properties: Record<string, PropertyRule>;
  dimension?: string;
}
const number = (max = 30 * 86400000): PropertyRule => ({ type: "number", max });
const text = (max = 128, required = false): PropertyRule => ({ type: "string", max, required });

export const eventDefinitions: Readonly<Record<string, Readonly<Record<number, EventDefinition>>>> =
  {
    session_start: {
      1: {
        properties: {
          first_run: { type: "boolean", required: true },
          app_version: text(),
          os: text(),
          arch: text(),
          locale: text(),
        },
      },
    },
    app_ready: { 1: { properties: { startup_ms: number(3600000) } } },
    heartbeat: { 1: { properties: { uptime_ms: number(), active_ms: number() } } },
    session_end: { 1: { properties: { duration_ms: number(), active_ms: number() } } },
    screen_view: { 1: { properties: { page: text(128, true) }, dimension: "page" } },
    crash: {
      1: {
        properties: {
          kind: text(64, true),
          reason: text(128),
          exit_code: { type: "number", max: 2147483647 },
          type: text(64),
          stack: text(300),
        },
        dimension: "kind",
      },
    },
    feature_used: {
      1: { properties: { feature: text(128, true), result: text(32) }, dimension: "feature" },
    },
  };

export function validateProperties(
  name: string,
  version: number,
  input: unknown
): EventProperties | null {
  const definition = eventDefinitions[name]?.[version];
  if (!definition || !input || typeof input !== "object" || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some(key => !Object.hasOwn(definition.properties, key))) return null;
  for (const [key, rule] of Object.entries(definition.properties)) {
    const property = value[key];
    if (property === undefined && !rule.required) continue;
    if (typeof property !== rule.type) return null;
    if (typeof property === "string" && (!property.length || property.length > (rule.max ?? 128)))
      return null;
    if (
      typeof property === "number" &&
      (!Number.isFinite(property) ||
        Math.abs(property) > (rule.max ?? Infinity) ||
        (key !== "exit_code" && property < 0))
    )
      return null;
  }
  return value as EventProperties;
}

export function eventDimension(name: string, version: number, properties: EventProperties): string {
  const key = eventDefinitions[name]?.[version]?.dimension;
  return key ? String(properties[key] ?? "") : "";
}
