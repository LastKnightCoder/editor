import type { Editor } from "slate";
import { setOrInsertNode, focusInsertedPreviewElement } from "@tau/editor/api";
import type { MermaidElement, PlantUMLElement } from "./types";

type DiagramElement = MermaidElement | PlantUMLElement;

const insertDiagram = (editor: Editor, node: DiagramElement) => {
  const path = setOrInsertNode(editor, node);
  focusInsertedPreviewElement(editor, path);
  return path;
};

export const insertMermaid = (editor: Editor) =>
  insertDiagram(editor, {
    type: "mermaid",
    chart: "",
    children: [{ type: "formatted", text: "" }],
  });
export const insertPlantUML = (editor: Editor) =>
  insertDiagram(editor, {
    type: "plantuml",
    content: "",
    children: [{ type: "formatted", text: "" }],
  });
