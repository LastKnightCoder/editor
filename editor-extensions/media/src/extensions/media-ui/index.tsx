import { defineExtension } from "@tau/editor/api";
import MediaLayer from "./MediaLayer";

export const mediaUiExtension = defineExtension({
  id: "tau.media-ui",
  layers: [MediaLayer],
});
