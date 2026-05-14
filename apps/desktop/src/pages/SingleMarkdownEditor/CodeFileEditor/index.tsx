import React, { memo, useEffect, useRef, useState } from "react";
import { UnControlled as CodeMirrorEditor } from "react-codemirror2";
import { Editor, InputStyle } from "codemirror";
import { useMemoizedFn, useThrottleFn } from "ahooks";
import { readTextFile, writeTextFile } from "@/commands/file";
import { getCodeMirrorMode } from "../fileTypes";
import isHotkey from "is-hotkey";
import { message } from "antd";

import "codemirror/mode/javascript/javascript.js";
import "codemirror/mode/jsx/jsx.js";
import "codemirror/mode/css/css.js";
import "codemirror/mode/htmlmixed/htmlmixed.js";
import "codemirror/mode/xml/xml.js";
import "codemirror/mode/yaml/yaml.js";
import "codemirror/mode/python/python.js";
import "codemirror/mode/go/go.js";
import "codemirror/mode/rust/rust.js";
import "codemirror/mode/clike/clike.js";
import "codemirror/mode/shell/shell.js";
import "codemirror/mode/sql/sql.js";
import "codemirror/mode/vue/vue.js";
import "codemirror/mode/markdown/markdown.js";
import "codemirror/mode/ruby/ruby.js";
import "codemirror/mode/php/php.js";
import "codemirror/mode/swift/swift.js";
import "codemirror/mode/clojure/clojure.js";
import "codemirror/mode/lua/lua.js";
import "codemirror/mode/r/r.js";
import "codemirror/mode/dart/dart.js";
import "codemirror/mode/elm/elm.js";
import "codemirror/mode/erlang/erlang.js";
import "codemirror/mode/dockerfile/dockerfile.js";
import "codemirror/mode/toml/toml.js";
import "codemirror/mode/properties/properties.js";
import "codemirror/addon/edit/closebrackets.js";

import "codemirror/lib/codemirror.css";
import "codemirror/theme/blackboard.css";

import styles from "./index.module.less";

interface CodeFileEditorProps {
  filePath: string;
  isDark?: boolean;
}

const CodeFileEditor: React.FC<CodeFileEditorProps> = memo(
  ({ filePath, isDark = false }) => {
    const [content, setContent] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const editorRef = useRef<Editor | null>(null);
    const currentContent = useRef<string>("");
    const filePathRef = useRef(filePath);

    useEffect(() => {
      filePathRef.current = filePath;
    }, [filePath]);

    useEffect(() => {
      let cancelled = false;
      setLoading(true);

      readTextFile(filePath)
        .then((text) => {
          if (!cancelled) {
            setContent(text);
            currentContent.current = text;
          }
        })
        .catch((err) => {
          console.error("读取文件失败:", err);
          if (!cancelled) {
            setContent("");
            currentContent.current = "";
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });

      return () => {
        cancelled = true;
      };
    }, [filePath]);

    const saveFile = useMemoizedFn(async () => {
      try {
        await writeTextFile(filePathRef.current, currentContent.current);
        message.success("已保存");
      } catch (err) {
        console.error("保存文件失败:", err);
        message.error("保存失败");
      }
    });

    const { run: throttledSave } = useThrottleFn(saveFile, { wait: 1000 });

    const handleKeyDown = useMemoizedFn(
      (_editor: Editor, event: KeyboardEvent) => {
        if (isHotkey("mod+s", event)) {
          event.preventDefault();
          throttledSave();
        }
      },
    );

    const mode = getCodeMirrorMode(filePath);

    const options = {
      inputStyle: "textarea" as InputStyle,
      mode,
      theme: isDark ? "blackboard" : "one-light",
      viewportMargin: Infinity,
      lineNumbers: true,
      firstLineNumber: 1,
      lineWrapping: true,
      smartIndent: true,
      cursorHeight: 1,
      tabindex: -1,
      extraKeys: {
        "Shift-Tab": "indentLess",
      },
      indentUnit: 2,
      tabSize: 2,
      autoCloseBrackets: true,
    };

    if (loading || content === null) {
      return <div className={styles.loading}>加载中...</div>;
    }

    return (
      <div className={styles.CodeMirrorContainer}>
        <CodeMirrorEditor
          value={content}
          options={options}
          onChange={(_editor, _data, value) => {
            currentContent.current = value;
          }}
          editorDidMount={(editor) => {
            editorRef.current = editor;
          }}
          onKeyDown={handleKeyDown}
          className={styles.codeMirror}
        />
      </div>
    );
  },
);

CodeFileEditor.displayName = "CodeFileEditor";

export default CodeFileEditor;
