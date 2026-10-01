import type { IngestContext } from "@tau/editor/api";
import { ingestMedia } from "../../utils/ingestMedia";

export const imageIngestSpec = {
  files: {
    accept: "image/*",
    run: (ctx: IngestContext) => ingestMedia(ctx, "image"),
  },
};
