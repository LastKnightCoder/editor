import type { ContentMetricRule } from "@tau/db-schema/content-metrics";

export const mediaMetricRules = [
  {
    type: "image",
    textFields: [],
  },
  {
    type: "inline-image",
    textFields: [],
  },
  {
    type: "audio",
    textFields: [],
  },
  {
    type: "video",
    textFields: [],
  },
] as const satisfies readonly ContentMetricRule[];
