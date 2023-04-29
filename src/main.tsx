import React from 'react'
import ReactDOM from 'react-dom/client'
import './main.css'

import Paragraph from "./components/Paragraph";
import Highlight from './components/Highlight';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <div contentEditable suppressContentEditableWarning>
      <Paragraph>
        Hello World!<Highlight>你的锤子</Highlight>
      </Paragraph>
      <Highlight>真的丝滑</Highlight>
    </div>
  </React.StrictMode>
)
