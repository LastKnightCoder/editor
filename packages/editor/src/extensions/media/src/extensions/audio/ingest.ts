import type { IngestContext } from "@tau/editor/api";
import { ingestMedia } from "../../utils/ingestMedia";

export const audioIngestSpec = {
  files: {
    accept: "audio/*",
    run: (ctx: IngestContext) => ingestMedia(ctx, "audio"),
  },
};
