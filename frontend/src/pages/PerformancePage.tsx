import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  getPerformanceReport,
  getWeakTopics,
} from "../api/performanceApi";

type PerformanceReport = {
  overall_score?: number;
  strong_topics?: string[];
  weak_topics?: string[];
  recommendation?: string;
};

export default function PerformancePage() {
  const { syllabusId } = useParams();

  const [report, setReport] = useState<PerformanceReport | null>(null);
  const [weakTopics, setWeakTopics] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadPerformance = async () => {
      if (!syllabusId) return;

      setLoading(true);
      setError("");

      try {
        const [reportData, weakTopicsData] = await Promise.allSettled([
          getPerformanceReport(syllabusId),
          getWeakTopics(syllabusId),
        ]);

        let normalizedReport: PerformanceReport = {};
        let normalizedWeakTopics: string[] = [];

        if (reportData.status === "fulfilled") {
          const data = reportData.value || {};

          normalizedReport = {
            overall_score:
              typeof data?.overall_score === "number" ? data.overall_score : 0,
            strong_topics: Array.isArray(data?.strong_topics)
              ? data.strong_topics
              : [],
            weak_topics: Array.isArray(data?.weak_topics)
              ? data.weak_topics
              : [],
            recommendation:
              typeof data?.recommendation === "string"
                ? data.recommendation
                : "",
          };
        }

        if (weakTopicsData.status === "fulfilled") {
          const data = weakTopicsData.value;

          if (Array.isArray(data?.weak_topics)) {
            normalizedWeakTopics = data.weak_topics.map((item: any) => {
              if (typeof item === "string") return item;
              return item?.topic_name || item?.name || JSON.stringify(item);
            });
          }
        }

        const mergedWeakTopics = Array.from(
          new Set([
            ...(normalizedReport.weak_topics || []),
            ...normalizedWeakTopics,
          ])
        );

        normalizedReport.weak_topics = mergedWeakTopics;

        setReport(normalizedReport);
        setWeakTopics(mergedWeakTopics);

        if (
          reportData.status === "rejected" &&
          weakTopicsData.status === "rejected"
        ) {
          setError("Failed to load performance data.");
        }
      } catch (err: any) {
        console.error("PERFORMANCE PAGE ERROR:", err?.response?.data || err);
        setError(
          typeof err?.response?.data?.detail === "string"
            ? err.response.data.detail
            : "Failed to load performance data"
        );
      } finally {
        setLoading(false);
      }
    };

    loadPerformance();
  }, [syllabusId]);

  if (loading) {
    return <div className="p-6">Loading performance report...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="bg-white rounded-xl shadow p-6 mb-6">
          <h1 className="text-2xl font-bold mb-4">Performance Report</h1>

          {error && <p className="text-red-500 mb-4">{error}</p>}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h2 className="text-lg font-semibold mb-2">Overall Score</h2>
              <p className="text-3xl font-bold text-blue-700">
                {report?.overall_score?.toFixed(2) ?? "0.00"}%
              </p>
            </div>

            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
              <h2 className="text-lg font-semibold mb-2">Recommendation</h2>
              <p className="text-indigo-700">
                {report?.recommendation || "No recommendation available yet."}
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="bg-white rounded-xl shadow p-6">
            <h2 className="text-xl font-semibold mb-4 text-green-700">
              Strong Topics
            </h2>

            {report?.strong_topics && report.strong_topics.length > 0 ? (
              <ul className="list-disc ml-6 space-y-2">
                {report.strong_topics.map((topic, index) => (
                  <li key={index} className="text-gray-800">
                    {topic}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-500">No strong topics yet.</p>
            )}
          </div>

          <div className="bg-white rounded-xl shadow p-6">
            <h2 className="text-xl font-semibold mb-4 text-red-700">
              Weak Topics
            </h2>

            {weakTopics.length > 0 ? (
              <ul className="list-disc ml-6 space-y-2">
                {weakTopics.map((topic, index) => (
                  <li key={index} className="text-gray-800">
                    {topic}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-500">No weak topics found yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}