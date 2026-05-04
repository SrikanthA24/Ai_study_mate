import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  generateAssessment,
  getAssessment,
  getAssessmentSummary,
} from "../api/assessmentApi";
import { submitPerformance } from "../api/performanceApi";

export default function AssessmentPage() {
  const { syllabusId, videoId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const videoTitle = location.state?.videoTitle || "Selected Video";

  const [summary, setSummary] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [submittingId, setSubmittingId] = useState<number | null>(null);
  const [submittedAnswers, setSubmittedAnswers] = useState<Record<string, string>>(
    {}
  );
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const loadExisting = async () => {
      if (!syllabusId || !videoId) return;

      try {
        const summaryData = await getAssessmentSummary(syllabusId, videoId);
        setSummary(summaryData);
      } catch (err) {
        console.log("No summary yet");
      }

      try {
        const qData = await getAssessment(syllabusId, videoId);
        setQuestions(
          Array.isArray(qData)
            ? qData
            : qData?.questions || qData?.items || qData?.data || []
        );
      } catch (err) {
        console.log("No questions yet");
      }
    };

    loadExisting();
  }, [syllabusId, videoId]);

  const handleGenerate = async () => {
    if (!syllabusId || !videoId) return;

    setError("");
    setMessage("");
    setLoading(true);

    try {
      await generateAssessment({
        syllabus_id: Number(syllabusId),
        video_id: String(videoId),
        video_title: videoTitle,
      });

      const summaryData = await getAssessmentSummary(syllabusId, videoId);
      setSummary(summaryData);

      const qData = await getAssessment(syllabusId, videoId);
      setQuestions(
        Array.isArray(qData)
          ? qData
          : qData?.questions || qData?.items || qData?.data || []
      );

      setSubmittedAnswers({});
      setMessage("Assessment generated successfully.");
    } catch (err: any) {
      console.error("ASSESSMENT ERROR:", err?.response?.data || err);
      setError(
        typeof err?.response?.data?.detail === "string"
          ? err.response.data.detail
          : JSON.stringify(err?.response?.data || "Failed to generate assessment")
      );
    } finally {
      setLoading(false);
    }
  };

  const normalizeOptions = (q: any) => {
    if (q?.options && typeof q.options === "object" && !Array.isArray(q.options)) {
      return q.options;
    }

    if (q?.choices && typeof q.choices === "object" && !Array.isArray(q.choices)) {
      return q.choices;
    }

    if (Array.isArray(q?.options)) {
      const mapped: Record<string, string> = {};
      q.options.forEach((opt: string, index: number) => {
        const key = ["A", "B", "C", "D"][index] || `Option${index + 1}`;
        mapped[key] = opt;
      });
      return mapped;
    }

    if (Array.isArray(q?.choices)) {
      const mapped: Record<string, string> = {};
      q.choices.forEach((opt: string, index: number) => {
        const key = ["A", "B", "C", "D"][index] || `Option${index + 1}`;
        mapped[key] = opt;
      });
      return mapped;
    }

    return {
      A: q?.option_a,
      B: q?.option_b,
      C: q?.option_c,
      D: q?.option_d,
    };
  };

  const handleSubmitAnswer = async (question: any, optionKey: string) => {
    if (!syllabusId || !videoId) return;

    const assessmentId =
      question?.id ?? question?.assessment_id ?? question?.question_id;

    if (!assessmentId) {
      setError("Assessment ID not found for this question.");
      return;
    }

    setError("");
    setMessage("");
    setSubmittingId(Number(assessmentId));

    try {
      const result = await submitPerformance({
        syllabus_id: Number(syllabusId),
        video_id: String(videoId),
        assessment_id: Number(assessmentId),
        selected_option: optionKey,
        topic_name: summary?.topic_name || videoTitle,
      });

      setSubmittedAnswers((prev) => ({
        ...prev,
        [String(assessmentId)]: optionKey,
      }));

      setMessage(
        result?.is_correct
          ? `Answer submitted. Correct answer. Mastery: ${
              result?.mastery_percentage ?? 0
            }%`
          : `Answer submitted. Correct option: ${
              result?.correct_option ?? "N/A"
            }. Mastery: ${result?.mastery_percentage ?? 0}%`
      );
    } catch (err: any) {
      console.error("SUBMIT ANSWER ERROR:", err?.response?.data || err);
      setError(
        typeof err?.response?.data?.detail === "string"
          ? err.response.data.detail
          : JSON.stringify(err?.response?.data || "Failed to submit answer")
      );
    } finally {
      setSubmittingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="bg-white rounded-xl shadow p-6 mb-6">
          <h1 className="text-2xl font-bold mb-2">Assessment</h1>
          <p className="text-gray-600 mb-4">{videoTitle}</p>

          <div className="flex gap-3 flex-wrap">
            <button
              onClick={handleGenerate}
              disabled={loading}
              className="bg-blue-600 text-white px-5 py-3 rounded"
            >
              {loading ? "Generating..." : "Generate Assessment"}
            </button>

            <button
              onClick={() => navigate(`/performance/${syllabusId}`)}
              className="bg-green-600 text-white px-5 py-3 rounded"
            >
              View Performance
            </button>
          </div>

          {error && <p className="text-red-500 mt-4 break-words">{error}</p>}
          {message && <p className="text-green-600 mt-4">{message}</p>}
        </div>

        {summary && (
          <div className="bg-white rounded-xl shadow p-6 mb-6">
            <h2 className="text-xl font-semibold mb-3">Summary</h2>
            <pre className="whitespace-pre-wrap text-sm bg-gray-100 p-4 rounded overflow-auto">
              {typeof summary === "string"
                ? summary
                : JSON.stringify(summary, null, 2)}
            </pre>
          </div>
        )}

        <div className="grid gap-4">
          {questions.length === 0 ? (
            <div className="bg-white rounded-xl shadow p-6">
              No assessment questions yet. Click Generate Assessment.
            </div>
          ) : (
            questions.map((q, index) => {
              const safeOptions = normalizeOptions(q);
              const assessmentId =
                q?.id ?? q?.assessment_id ?? q?.question_id;
              const selectedOption = submittedAnswers[String(assessmentId)];

              return (
                <div
                  key={assessmentId || index}
                  className="bg-white rounded-xl shadow p-6"
                >
                  <h3 className="text-lg font-semibold mb-4">
                    {index + 1}. {q?.question || q?.question_text || "Question"}
                  </h3>

                  <div className="grid gap-3">
                    {Object.entries(safeOptions)
                      .filter(([, value]) => value)
                      .map(([key, value]) => {
                        const isChosen = selectedOption === key;

                        return (
                          <button
                            key={key}
                            onClick={() => handleSubmitAnswer(q, key)}
                            disabled={
                              submittingId === Number(assessmentId) ||
                              !!selectedOption
                            }
                            className={`text-left border rounded p-3 ${
                              isChosen
                                ? "bg-green-100 border-green-500"
                                : "hover:bg-gray-50"
                            }`}
                          >
                            <span className="font-semibold mr-2">{key}.</span>
                            <span>{String(value)}</span>
                          </button>
                        );
                      })}
                  </div>

                  {selectedOption && (
                    <p className="text-sm text-green-700 mt-3">
                      Submitted answer: {selectedOption}
                    </p>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}