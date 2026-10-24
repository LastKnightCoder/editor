import type { ContentMetricRule } from "@tau/db-schema/content-metrics";

export const tabsMetricRules = [
  {
    type: "tabs",
    textFields: [],
    additionalChildren: [
      {
        path: "tabsContent",
        exclude: {
          field: "key",
          equalsField: "activeKey",
        },
        childrenPath: "content",
      },
    ],
  },
] as const satisfies readonly ContentMetricRule[];
