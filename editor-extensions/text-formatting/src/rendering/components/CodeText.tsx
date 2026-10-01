import React, { memo } from "react";

interface CodeTextProps {
  children: React.ReactNode;
}

const CodeText = memo(({ children }: CodeTextProps) => {
  return (
    <code className="rounded-[4px] border border-solid border-[var(--ed-border)] bg-[var(--ed-tag-bg)] px-[0.35em] py-[0.15em] font-[family-name:var(--ed-font-mono,monospace)] text-[0.9em] text-[var(--ed-text)]">
      {children}
    </code>
  );
});

CodeText.displayName = "CodeText";

export default CodeText;
