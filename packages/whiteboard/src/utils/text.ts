import { createContentMetrics } from "@tau/db-schema/content-metrics";
const metrics = createContentMetrics();
export const getContentLength = metrics.count;
