import { UnControlled as CodeEditor } from 'react-codemirror2';
import 'codemirror/lib/codemirror.css';
import 'codemirror/theme/blackboard.css';
import { Editor, EditorChange } from 'codemirror';
import { useEffect, useState } from 'react';
import { LANGUAGES } from './config';

import 'codemirror/mode/javascript/javascript.js';
import 'codemirror/mode/jsx/jsx.js';
import 'codemirror/mode/rust/rust.js';
import 'codemirror/mode/go/go.js';
import 'codemirror/mode/css/css.js';
import 'codemirror/mode/htmlmixed/htmlmixed.js';
import 'codemirror/mode/clike/clike.js';
import 'codemirror/mode/shell/shell.js';
import 'codemirror/mode/python/python.js';
import 'codemirror/mode/sql/sql.js';
import 'codemirror/mode/markdown/markdown.js';

interface ICodeBlockProps {
  defaultCode: string;
  onChange: (editor: Editor, change: EditorChange, code: string) => void;
  language?: string;
}

interface ILanguageConfig {
  name: string;
  mode: string;
  mime?: string;
}

const CodeBlock: React.FC<ICodeBlockProps> = (props) => {
  const { defaultCode, onChange, language } = props;
  const [code] = useState(defaultCode);

  const [langConfig, setLangConfig] = useState<ILanguageConfig>();
  useEffect(() => {
    const languageConfig = LANGUAGES.find((lang) => lang.name.toLowerCase() === language);
    if (!languageConfig) {
      return;
    }
    setLangConfig(languageConfig);
  }, [language]);

  const handleOnBeforeChange = (editor: Editor, change: EditorChange, code: string) => {
    onChange(editor, change, code);
  }

  return (
    <CodeEditor
      value={code || ''}
      autoCursor
      autoScroll
      options={{
        mode: langConfig?.mime || langConfig?.mode || 'text/plain',
        theme: 'blackboard',
        lineNumbers: true,
        firstLineNumber: 1,
        scrollbarStyle: "null",
        viewportMargin: Infinity,
        lineWrapping: false,
        smartIndent: true,
        extraKeys: {
          'Shift-Tab': 'indentLess',
        },
        readOnly: false,
        indentUnit: 2,
        tabSize: 2,
        cursorHeight: 0.8,
      }}
      className='CodeMirror__container'
      onChange={handleOnBeforeChange}
    />
  )
}

export default CodeBlock;