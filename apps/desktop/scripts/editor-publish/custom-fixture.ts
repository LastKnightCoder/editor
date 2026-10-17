export const customSource = `const { useState } = React;
const Component = () => {
  const [count, setCount] = useState(3);
  return <div data-custom-acceptance className="p-[13px] bg-surface text-ink-1"><button onClick={() => setCount(count + 1)}>计数</button><output>{count}</output></div>;
};`;
export const customMarkdown = "```custom-block\n" + customSource + "\n```";
