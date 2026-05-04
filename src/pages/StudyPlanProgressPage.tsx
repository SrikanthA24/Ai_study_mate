import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getStudyPlan } from "../api/studyPlanApi";
import { saveStudyPlan } from "../api/studyPlanProgressApi";

export default function StudyPlanPage() {
  const { syllabusId } = useParams();
  const navigate = useNavigate();

  const [plan, setPlan] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loadPlan = async () => {
      try {
        const data = await getStudyPlan(syllabusId!);
        setPlan(Array.isArray(data) ? data : data?.study_plan || data?.items || []);
      } catch (err: any) {
        console.error("STUDY PLAN ERROR:", err?.response?.data || err);
        setError(
          typeof err?.response?.data?.detail === "string"
            ? err.response.data.detail
            : "Failed to load study plan"
        );
      } finally {
        setLoading(false);
      }
    };

    loadPlan();
  }, [syllabusId]);

  const handleSave = async () => {
    setError("");
    setMessage("");
    setSaving(true);

    try {
      await saveStudyPlan({
        syllabus_id: Number(syllabusId),
        study_plan: plan,
      });

      setMessage("Study plan saved successfully.");
      navigate(`/study-plan-progress/${syllabusId}`);
    } catch (err: any) {
      console.error("SAVE STUDY PLAN ERROR:", err?.response?.data || err);
      setError(
        typeof err?.response?.data?.detail === "string"
          ? err.response.data.detail
          : "Failed to save study plan"
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-6">Loading study plan...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="bg-white rounded-xl shadow p-6 mb-6">
          <h1 className="text-2xl font-bold mb-4">Study Plan</h1>

          {error && <p className="text-red-500 mb-4">{error}</p>}
          {message && <p className="text-green-600 mb-4">{message}</p>}

          <button
            onClick={handleSave}
            disabled={saving || plan.length === 0}
            className="bg-blue-600 text-white px-5 py-3 rounded"
          >
            {saving ? "Saving..." : "Save Study Plan"}
          </button>
        </div>

        {plan.length === 0 ? (
          <div className="bg-white rounded-xl shadow p-6">
            No study plan available.
          </div>
        ) : (
          <div className="grid gap-4">
            {plan.map((dayPlan, index) => (
              <div key={index} className="bg-white rounded-xl shadow p-6">
                <h2 className="text-xl font-semibold mb-2">
                  Day {dayPlan?.day || index + 1}
                </h2>

                <p className="text-gray-700 mb-3">
                  Topic: {dayPlan?.topic_name || "N/A"}
                </p>

                <div className="space-y-2">
                  {(dayPlan?.tasks || []).map((task: string, taskIndex: number) => (
                    <div key={taskIndex} className="border rounded p-3">
                      {task}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}