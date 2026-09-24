export function JudgementList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <>
      <div className="text-ink-3 mt-2 text-[11.5px]">{title}</div>
      <ul className="text-ink-2 ml-[18px] list-disc">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </>
  );
}
