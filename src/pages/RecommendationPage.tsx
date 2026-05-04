import { useEffect, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import {
  getTopicRecommendation,
  getWeakTopicRecommendations,
} from "../api/recommendationApi";

export default function RecommendationPage() {
  const { syllabusId } = useParams();
  const location = useLocation();
  const topicName = location.state?.topicName;

  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadData = async () => {
      try {
        if (topicName) {
          const topicData = await getTopicRecommendation(syllabusId!, topicName);
          setData(topicData);
        } else {
          const weakData = await getWeakTopicRecommendations(syllabusId!);
          setData(weakData);
        }
      } catch (err: any) {
        console.error("RECOMMENDATION ERROR:", err?.response?.data || err);
        setError(
          typeof err?.response?.data?.detail === "string"
            ? err.response.data.detail
            : "Failed to load recommendations"
        );
      }
    };

    loadData();
  }, [syllabusId, topicName]);

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-5xl mx-auto bg-white rounded-xl shadow p-6">
        <h1 className="text-2xl font-bold mb-4">Recommendations</h1>
        {topicName && <p className="mb-4 text-gray-600">Topic: {topicName}</p>}
        {error && <p className="text-red-500 mb-4">{error}</p>}

        <pre className="whitespace-pre-wrap text-sm bg-gray-100 p-4 rounded overflow-auto">
          {data ? JSON.stringify(data, null, 2) : "Loading recommendations..."}
        </pre>
      </div>
    </div>
  );
}