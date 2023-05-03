import { useState } from "react";
import CodeMirror from "./components/CodeBlock";
import { Editor, EditorChange } from "codemirror";

const App = () => {
  const [code, setCode] = useState(() => {
    return localStorage.getItem('code') || '';
  });
  const handleChange = (editor: Editor, change: EditorChange, code: string) => {
    setCode(code);
    localStorage.setItem('code', code);
  }

  return (
    <div>
      <CodeMirror
        defaultCode={code}
        onChange={handleChange}
        language="css"
      />
      <CodeMirror
        defaultCode={code}
        onChange={handleChange}
        language="html"
      />
    </div>
  )
}

export default App;