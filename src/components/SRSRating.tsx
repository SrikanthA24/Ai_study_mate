// components/SRSRating.tsx
import { useState } from "react";
import { submitSRSReview } from "../api/srsApi";

const ratings = [
  { value: 0, label: "Blank", color: "#E24B4A" },
  { value: 1, label: "Wrong", color: "#E24B4A" },
  { value: 2, label: "Hard fail", color: "#EF9F27" },
  { value: 3, label: "Hard pass", color: "#EF9F27" },
  { value: 4, label: "Good", color: "#1D9E75" },
  { value: 5, label: "Easy", color: "#1D9E75" },
];

export default function SRSRating({ topicId, onDone }: {
  topicId: number;
  onDone: (result: any) => void;
}) {
  const [loading, setLoading] = useState(false);

  const handleRate = async (quality: number) => {
    setLoading(true);
    const result = await submitSRSReview({ topic_id: topicId, quality });
    setLoading(false);
    onDone(result);
  };

  return (
    <div style={{ textAlign: "center", padding: "16px 0" }}>
      <p style={{ marginBottom: 12, fontWeight: 500 }}>
        How well did you know this?
      </p>
      <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
        {ratings.map((r) => (
          <button
            key={r.value}
            disabled={loading}
            onClick={() => handleRate(r.value)}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: `1px solid ${r.color}`,
              color: r.color,
              background: "transparent",
              cursor: "pointer",
              fontWeight: 500,
              fontSize: 13,
            }}
          >
            {r.value} — {r.label}
          </button>
        ))}
      </div>
    </div>
  );
}