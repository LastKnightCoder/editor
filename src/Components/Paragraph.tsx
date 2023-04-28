import {useEffect, useRef, useState} from 'react';

const Paragraph = () => {
  const el = useRef<HTMLParagraphElement>(null);
  const [text, setText] = useState('Hello World');

  const handleOnChange = (event: React.FormEvent<HTMLParagraphElement>) => {
    setText(event.currentTarget.textContent || '');
  }

  useEffect(() => {
    if (!el.current) return;
    const target = document.createTextNode('');
    el.current.appendChild(target);

    const isTargetFocused = document.activeElement === el.current;
    if (target !== null && target.nodeValue !== null && isTargetFocused) {
      const sel = window.getSelection();
      if (sel !== null) {
        const range = document.createRange();
        range.setStart(target, target.nodeValue.length);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      }
      if (el.current instanceof HTMLElement) el.current.focus();
    }
  }, [text]);

  return (
    <p
      ref={el}
      onInput={handleOnChange}
      contentEditable
    >
      {text}
    </p>
  );
}

export default Paragraph;