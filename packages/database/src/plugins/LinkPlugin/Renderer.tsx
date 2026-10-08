import type { CellPlugin } from "../../types";
import { normalizeUrl } from "./utils";

const Renderer: CellPlugin<unknown>["Renderer"] = ({ value }) => {
  const url = normalizeUrl(String(value ?? ""));
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={event => event.stopPropagation()}
      className="text-accent-text text-tau-body block truncate px-2 underline"
    >
      {String(value)}
    </a>
  );
};

export default Renderer;
