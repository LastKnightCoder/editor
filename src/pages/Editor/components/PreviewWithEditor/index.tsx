import React, {PropsWithChildren, useRef, useState} from "react";
import {UnControlled as CodeEditor} from "react-codemirror2";
import {Editor, EditorChange} from "codemirror";
import styles from "./index.module.less";
import AddParagraph from "../AddParagraph";
import {CustomElement} from "../../types";
import classnames from "classnames";
import { useClickAway } from "ahooks";
import {DeleteOutlined} from "@ant-design/icons";
import {ReactEditor, useSlate, useReadOnly} from "slate-react";
import {Transforms} from "slate";
import { useDebounceFn } from "ahooks";

interface IPreviewWithEditorProps {
  mode: string;
  initValue: string;
  onChange: (value: string) => void;
  element: CustomElement;
  center?: boolean;
}

class ErrorBoundary extends React.Component {
  constructor(props: any) {
    super(props);
    this.state = {error: ""};
  }

  componentDidCatch(error: any) {
    this.setState({error: `${error.name}: ${error.message}`});
  }

  render() {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const {error} = this.state;
    if (error) {
      return (
        <div>{error}</div>
      );
    } else {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      return <>{this.props.children}</>;
    }
  }
}

const PreviewWithEditor: React.FC<PropsWithChildren<IPreviewWithEditorProps>> = (props) => {
  const { mode, initValue, onChange, children, element, center } = props;
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initValue);
  const [editor, setEditor] = useState<Editor | null>(null);
  const ref= useRef<HTMLDivElement>(null);
  const slateEditor = useSlate();
  const readOnly = useReadOnly();

  useClickAway(() => {
    if (editing) {
      setEditing(false);
      setValue(editor?.getValue() || '');
    }
  }, ref);

  const onClick = () => {
    setEditing(true);
  }

  const { run: handleInputChange } = useDebounceFn((_editor: Editor, _change: EditorChange, code: string) => {
    onChange(code);
  }, {
    wait: 500
  });

  const deleteElement = () => {
    const path = ReactEditor.findPath(slateEditor, element);
    Transforms.removeNodes(slateEditor, {
      at: path
    });
    setTimeout(() => {
      ReactEditor.focus(slateEditor);
    }, 100)
  }

  return (
    <div>
      <div ref={ref} className={classnames(styles.container, { [styles.editing]: editing })}>
        {
          editing &&
          <CodeEditor
            value={value || ''}
            autoCursor
            autoScroll
            options={{
              mode,
              theme: 'one-light',
              lineNumbers: true,
              firstLineNumber: 1,
              scrollbarStyle: "null",
              viewportMargin: Infinity,
              lineWrapping: false,
              smartIndent: true,
              extraKeys: {
                'Shift-Tab': 'indentLess',
              },
              readOnly,
              indentUnit: 2,
              tabSize: 2,
              cursorHeight: 1,
              autoCloseBrackets: true,
              tabindex: -1,
            }}
            className={styles.editor}
            onChange={handleInputChange}
            editorDidMount={(editor) => { setEditor(editor) }}
            editorWillUnmount={() => { setEditor(null) }}
          />
        }
        { editing && <div className={styles.divider}></div> }
        <div className={classnames(styles.preview, {[styles.center]: center})} onClick={onClick}>
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </div>
        <div className={styles.actions}>
          <div onClick={deleteElement} className={styles.item}>
            <DeleteOutlined />
          </div>
        </div>
      </div>
      <AddParagraph element={element} />
    </div>
  )
}

export default PreviewWithEditor;