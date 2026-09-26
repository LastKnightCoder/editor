/**
 * Skill 文件源码编辑（SKILL.md「源码」视图与非 Markdown 文件）：CodeMirror 5 语法高亮，
 * 按扩展名选模式；高度随内容增长，由外层 FadeScroll 负责滚动与渐隐。
 */

import { UnControlled as CodeMirror } from "react-codemirror2";
import type { ModeSpec, ModeSpecOptions } from "codemirror";
import "codemirror/lib/codemirror.css";
import "codemirror/mode/javascript/javascript.js";
import "codemirror/mode/css/css.js";
import "codemirror/mode/xml/xml.js";
import "codemirror/mode/htmlmixed/htmlmixed.js";
import "codemirror/mode/markdown/markdown.js";
import "codemirror/mode/gfm/gfm.js";
import "codemirror/mode/yaml/yaml.js";
import "codemirror/mode/yaml-frontmatter/yaml-frontmatter.js";
import "codemirror/mode/python/python.js";
import "codemirror/mode/shell/shell.js";
import "codemirror/mode/sql/sql.js";
import "codemirror/mode/toml/toml.js";
import "codemirror/addon/edit/closebrackets.js";
import "codemirror/addon/edit/matchbrackets.js";
import styles from "./SkillCodeEditor.module.css";

type Mode = string | ModeSpec<ModeSpecOptions & Record<string, unknown>>;

const MODES: Record<string, Mode> = {
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: { name: "javascript", jsx: true },
  ts: { name: "javascript", typescript: true },
  tsx: { name: "javascript", typescript: true },
  json: { name: "javascript", json: true },
  css: "css",
  html: "htmlmixed",
  htm: "htmlmixed",
  xml: "xml",
  svg: "xml",
  // SKILL.md 等 Markdown：front-matter 按 YAML 高亮
  md: { name: "yaml-frontmatter", base: "gfm" },
  markdown: { name: "yaml-frontmatter", base: "gfm" },
  yml: "yaml",
  yaml: "yaml",
  py: "python",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  sql: "sql",
  toml: "toml",
};

export const codeModeFor = (fileName: string): Mode =>
  MODES[fileName.split(".").pop()?.toLowerCase() ?? ""] ?? "text/plain";

export function SkillCodeEditor({
  fileName,
  value,
  readonly,
  onChange,
}: {
  fileName: string;
  value: string;
  readonly: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className={styles.root}>
      <CodeMirror
        value={value}
        autoCursor={false}
        options={{
          mode: codeModeFor(fileName),
          readOnly: readonly,
          lineNumbers: true,
          lineWrapping: true,
          viewportMargin: Infinity,
          indentUnit: 2,
          tabSize: 2,
          autoCloseBrackets: true,
          matchBrackets: true,
          extraKeys: { "Shift-Tab": "indentLess" },
        }}
        onChange={(_editor, _change, next) => onChange(next)}
      />
    </div>
  );
}
