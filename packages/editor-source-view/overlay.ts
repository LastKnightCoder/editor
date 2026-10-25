export {
  default as ShikiOverlayEditor,
  type OverlayCursorPosition,
  type OverlayEditorController,
  type OverlayKeydownHelpers,
} from "./src/overlay/ShikiOverlayEditor";
export {
  getShikiHighlighter,
  getShikiTheme,
  renderCodeWithShiki,
  resolveShikiLanguage,
} from "./src/overlay/shikiHighlighter";
export {
  hasHighlightedLineInRange,
  mergeHighlightRange,
  normalizeLineRange,
  parseHighlightLinesToSet,
  removeHighlightRange,
} from "./src/overlay/highlightLineRanges";
export {
  handleSourceKeyDown,
  SOURCE_INDENT,
  type SourceKeyOptions,
} from "./src/overlay/sourceKeys";
