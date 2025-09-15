import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import useSliderStore from "@/stores/useSliderStore";

const SliderListView = () => {
  const { decks, initDecks, createDeck } = useSliderStore();
  const navigate = useNavigate();

  useEffect(() => {
    initDecks();
  }, [initDecks]);

  return (
    <div style={{ padding: 16 }}>
      <h2>Slides</h2>
      <div style={{ marginBottom: 12 }}>
        <button
          onClick={async () => {
            const now = new Date();
            const deck = await createDeck({
              title: `未命名演示 ${now.toLocaleString()}`,
              description: "",
              tags: [],
              snapshot: "",
              templateSetId: null,
            });
            navigate(`/sliders/detail/${deck.id}`);
          }}
        >
          新建 Slide
        </button>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, 260px)",
          gap: 12,
        }}
      >
        {decks.map((d) => (
          <div
            key={d.id}
            style={{
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              padding: 12,
              cursor: "pointer",
            }}
            onClick={() => navigate(`/sliders/detail/${d.id}`)}
          >
            <div
              style={{
                height: 120,
                background: "#f5f5f5",
                borderRadius: 6,
                marginBottom: 8,
              }}
            />
            <div style={{ fontWeight: 600 }}>{d.title}</div>
            <div style={{ color: "var(--text-2)", fontSize: 12 }}>
              {d.description}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SliderListView;
