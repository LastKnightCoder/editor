import type { IngestContext } from "@tau/editor/api";
import { ingestMedia } from "../../utils/ingestMedia";

export const videoIngestSpec = {
  files: {
    accept: "video/*",
    run: (ctx: IngestContext) => ingestMedia(ctx, "video"),
  },
};
