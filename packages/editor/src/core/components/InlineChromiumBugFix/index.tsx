import { memo } from "react";

const InlineChromiumBugfix = memo(() => {
  return (
    <span contentEditable={false} style={{ fontSize: 0 }}>
      {String.fromCodePoint(160) /* Non-breaking space */}
    </span>
  );
});

export default InlineChromiumBugfix;
