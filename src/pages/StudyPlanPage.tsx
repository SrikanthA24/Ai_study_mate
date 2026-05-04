import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import {
  adaptStudyPlan,
  generateStudyPlan,
  getCourseFlow,
} from "../api/studyPlanApi";
import {
  generateAssessment,
  getAssessment,
  getAssessmentSummary,
} from "../api/assessmentApi";
import {
  getPerformanceReport,
  getVideoResult,
  submitPerformance,
} from "../api/performanceApi";
import {
  askDoubt,
  deleteDoubtHistoryItem,
  getDoubtHistory,
  reindexDoubtSources,
} from "../api/doubtSolverApi";
import { submitSRSReview } from "../api/srsApi";

type FlowItem = {
  id: number;
  day: number;
  date: string;
  topic: string;
  task: string;
  priority: string;
  estimated_hours: number;
  video_id?: string;
  video_title?: string;
  video_url?: string;
  unlocked: boolean;
  completed: boolean;
  answered_count: number;
  total_questions: number;
};

type CourseFlowResponse = {
  study_plan_id: number;
  syllabus_id: number;
  title: string;
  summary: string;
  end_date: string;
  hours_per_day: number;
  current_item_id: number | null;
  items: FlowItem[];
  warning?: string; // ← compression warning from backend
};

type VideoResult = {
  syllabus_id: number;
  video_id: string;
  score_percentage: number;
  correct_answers: number;
  total_questions: number;
  video_completed: boolean;
  course_progress_percentage: number;
  videos_completed: number;
  total_videos: number;
};

type PerformanceReport = {
  overall_score: number;
  strong_topics: string[];
  weak_topics: string[];
  recommendation: string;
};

type AdaptPlanChange = {
  topic: string;
  mastery_percentage: number;
  mastery_level: string;
  action: string;
};

type DoubtSource = {
  source_type: string;
  source_ref: string;
  video_id?: string | null;
  chunk_text: string;
  score: number;
};

type DoubtResponse = {
  answer: string;
  sources: DoubtSource[];
  mode?: string;
};

type DoubtHistoryItem = {
  id: number;
  question: string;
  answer: string;
  answer_mode?: string;
  video_id?: string | null;
  sources: DoubtSource[];
  created_at: string;
};

// Modal type: which option the user chose
type AdjustModalType = "date" | "hours" | null;

const SRS_RATINGS = [
  { value: 0, label: "Blank",     color: "border-red-300 text-red-700 hover:bg-red-50" },
  { value: 1, label: "Wrong",     color: "border-red-300 text-red-700 hover:bg-red-50" },
  { value: 2, label: "Hard fail", color: "border-orange-300 text-orange-700 hover:bg-orange-50" },
  { value: 3, label: "Hard pass", color: "border-yellow-300 text-yellow-700 hover:bg-yellow-50" },
  { value: 4, label: "Good",      color: "border-green-300 text-green-700 hover:bg-green-50" },
  { value: 5, label: "Easy",      color: "border-emerald-400 text-emerald-700 hover:bg-emerald-50" },
];

export default function StudyPlanPage() {
  const { syllabusId } = useParams();
  const [searchParams] = useSearchParams();

  const [endDate, setEndDate] = useState("");
  const [hoursPerDay, setHoursPerDay] = useState(2);
  const [courseFlow, setCourseFlow] = useState<CourseFlowResponse | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);

  // ── Compression warning state ────────────────────────────────────────────
  const [compressionWarning, setCompressionWarning] = useState<string | null>(null);
  const [adjustModalType, setAdjustModalType] = useState<AdjustModalType>(null);
  // Temporary values shown inside the modal before confirming
  const [modalEndDate, setModalEndDate] = useState("");
  const [modalHours, setModalHours] = useState(2);
  const [adjustLoading, setAdjustLoading] = useState(false);
  const [adjustError, setAdjustError] = useState("");
  // ────────────────────────────────────────────────────────────────────────

  const [summary, setSummary] = useState<any>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [questions, setQuestions] = useState<any[]>([]);
  const [assessmentStarted, setAssessmentStarted] = useState(false);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({});
  const [submittedAssessment, setSubmittedAssessment] = useState(false);

  const [videoResult, setVideoResult] = useState<VideoResult | null>(null);
  const [performanceReport, setPerformanceReport] = useState<PerformanceReport | null>(null);

  const [adaptChanges, setAdaptChanges] = useState<AdaptPlanChange[]>([]);
  const [adaptLoading, setAdaptLoading] = useState(false);

  const [srsSubmitted, setSrsSubmitted] = useState(false);
  const [srsSubmitting, setSrsSubmitting] = useState(false);
  const [srsNextReview, setSrsNextReview] = useState<string | null>(null);

  const [doubtQuestion, setDoubtQuestion] = useState("");
  const [doubtLoading, setDoubtLoading] = useState(false);
  const [doubtReindexing, setDoubtReindexing] = useState(false);
  const [doubtResult, setDoubtResult] = useState<DoubtResponse | null>(null);
  const [doubtError, setDoubtError] = useState("");
  const [doubtHistory, setDoubtHistory] = useState<DoubtHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [expandedHistoryId, setExpandedHistoryId] = useState<number | null>(null);

  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [assessmentLoading, setAssessmentLoading] = useState(false);
  const [submittingAssessment, setSubmittingAssessment] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // ── Helpers ──────────────────────────────────────────────────────────────

  /** Apply the warning from a plan response and sync local state. */
  const applyPlanResponse = (data: CourseFlowResponse) => {
    setCourseFlow(data);
    setEndDate(data.end_date);
    setHoursPerDay(data.hours_per_day);
    setCompressionWarning(data.warning ?? null);
  };

  const loadCourseFlow = async () => {
    if (!syllabusId) return;
    const data = await getCourseFlow(syllabusId);
    applyPlanResponse(data);

    const scrollTo = searchParams.get("scrollTo");

    if (scrollTo === "srs") {
      // Find the first unlocked SRS review item and select it
      const firstSRS = data.items.find(
        (item: FlowItem) => item.unlocked && item.task?.toLowerCase().includes("srs review")
      );
      if (firstSRS) {
        setSelectedItemId(firstSRS.id);
        // Scroll the sidebar item into view after render
        setTimeout(() => {
          document.getElementById(`flow-item-${firstSRS.id}`)?.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        }, 300);
        return;
      }
    }

    if (data.current_item_id) {
      setSelectedItemId(data.current_item_id);
    } else if (data.items.length > 0) {
      const firstUnlocked = data.items.find((item: FlowItem) => item.unlocked);
      setSelectedItemId(firstUnlocked?.id || data.items[0].id);
    }
  };

  const loadPerformanceReport = async () => {
    if (!syllabusId) return;
    try {
      const report = await getPerformanceReport(syllabusId);
      setPerformanceReport(report);
    } catch {
      setPerformanceReport(null);
    }
  };

  const loadDoubtHistory = async () => {
    if (!syllabusId) return;
    setHistoryLoading(true);
    try {
      const data = await getDoubtHistory(Number(syllabusId));
      setDoubtHistory(data.items || []);
    } catch {
      setDoubtHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      if (!syllabusId) { setFetching(false); return; }
      try {
        await loadCourseFlow();
        await loadPerformanceReport();
        await loadDoubtHistory();
      } catch (err: any) {
        if (err?.response?.status !== 404) {
          const detail = err?.response?.data?.detail;
          setError(typeof detail === "string" ? detail : "Failed to load study plan");
        }
      } finally {
        setFetching(false);
      }
    };
    init();
  }, [syllabusId]);

  const selectedItem = useMemo(() => {
    if (!courseFlow || selectedItemId === null) return null;
    return courseFlow.items.find((item) => item.id === selectedItemId) || null;
  }, [courseFlow, selectedItemId]);

  useEffect(() => {
    setSrsSubmitted(false);
    setSrsSubmitting(false);
    setSrsNextReview(null);
    setAutoSrsQuality(null);
    setSrsOverrideMode(false);
  }, [selectedItem?.video_id]);

  useEffect(() => {
    const loadAssessmentForCurrent = async () => {
      if (!syllabusId || !selectedItem?.video_id || !selectedItem.unlocked) return;

      setSummary(null);
      setQuestions([]);
      setSelectedAnswers({});
      setAssessmentStarted(false);
      setSubmittedAssessment(false);
      setVideoResult(null);
      setMessage("");
      setError("");
      setShowSummary(false);
      setSrsSubmitted(false);
      setSrsNextReview(null);
      setAutoSrsQuality(null);
      setSrsOverrideMode(false);

      try {
        const summaryData = await getAssessmentSummary(syllabusId, selectedItem.video_id);
        setSummary(summaryData);
      } catch {
        setSummary(null);
      }

      try {
        const qData = await getAssessment(syllabusId, selectedItem.video_id);
        const qList = Array.isArray(qData)
          ? qData
          : qData?.questions || qData?.items || qData?.data || [];
        setQuestions(qList);

        if (selectedItem.completed) {
          setSubmittedAssessment(true);
          setSrsSubmitted(true);
          try {
            const result = await getVideoResult(syllabusId, selectedItem.video_id);
            setVideoResult(result);
          } catch {
            setVideoResult(null);
          }
        }
      } catch {
        setQuestions([]);
      }
    };

    loadAssessmentForCurrent();
  }, [syllabusId, selectedItem?.video_id, selectedItem?.unlocked, selectedItem?.completed]);

  // ── Plan generation ───────────────────────────────────────────────────────

  const handleGeneratePlan = async (
    overrideEndDate?: string,
    overrideHours?: number,
  ) => {
    if (!syllabusId) return;

    const usedEndDate = overrideEndDate ?? endDate;
    const usedHours   = overrideHours   ?? hoursPerDay;

    if (!usedEndDate) { setError("Please select the course end date."); return; }
    if (usedHours <= 0 || usedHours > 16) { setError("Please enter valid study hours per day."); return; }

    setLoading(true);
    setError("");
    setMessage("");
    setAdaptChanges([]);

    try {
      const data = await generateStudyPlan(syllabusId, {
        end_date: usedEndDate,
        hours_per_day: usedHours,
        force_regenerate: true,
      });

      // generateStudyPlan returns the plan directly (not course-flow shape),
      // so we reload course-flow to get the unified structure + warning field.
      await loadCourseFlow();

      // If the backend returned a warning directly in the generate response,
      // surface it immediately (works even before loadCourseFlow resolves).
      if (data?.warning) setCompressionWarning(data.warning);

      setMessage("Study plan generated successfully.");
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "Failed to generate study plan");
    } finally {
      setLoading(false);
    }
  };

  // ── Compression adjustment modal ─────────────────────────────────────────

  /** Open the modal pre-filled with current values. */
  const openAdjustModal = (type: AdjustModalType) => {
    setModalEndDate(endDate);
    setModalHours(hoursPerDay);
    setAdjustError("");
    setAdjustModalType(type);
  };

  const closeAdjustModal = () => {
    setAdjustModalType(null);
    setAdjustError("");
  };

  const handleConfirmAdjust = async () => {
    if (!syllabusId) return;
    setAdjustError("");

    // Validate modal values
    if (adjustModalType === "date") {
      if (!modalEndDate) { setAdjustError("Please select a new end date."); return; }
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (new Date(modalEndDate) <= today) {
        setAdjustError("End date must be after today.");
        return;
      }
    }
    if (adjustModalType === "hours") {
      if (modalHours <= 0 || modalHours > 16) {
        setAdjustError("Hours must be between 0.5 and 16.");
        return;
      }
    }

    setAdjustLoading(true);
    try {
      const newEndDate = adjustModalType === "date"  ? modalEndDate  : endDate;
      const newHours   = adjustModalType === "hours" ? modalHours    : hoursPerDay;

      // Sync state so the main form reflects the new values too
      setEndDate(newEndDate);
      setHoursPerDay(newHours);

      await handleGeneratePlan(newEndDate, newHours);
      closeAdjustModal();
    } catch {
      setAdjustError("Failed to regenerate. Please try again.");
    } finally {
      setAdjustLoading(false);
    }
  };

  // ── Other handlers (unchanged) ────────────────────────────────────────────

  const handleAdaptPlan = async () => {
    if (!syllabusId) return;
    setAdaptLoading(true);
    setError("");
    setMessage("");

    try {
      const data = await adaptStudyPlan(syllabusId);
      await loadCourseFlow();
      await loadPerformanceReport();
      setAdaptChanges(data.changes || []);
      setMessage(
        (data.added_items || 0) > 0
          ? `Study plan adapted successfully. ${data.added_items} new task(s) added.`
          : "Study plan adapted successfully. No new tasks were needed."
      );
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "Failed to adapt study plan");
    } finally {
      setAdaptLoading(false);
    }
  };

  const handleGenerateAssessment = async () => {
    if (!syllabusId || !selectedItem?.video_id) return;
    setAssessmentLoading(true);
    setError("");
    setMessage("");

    try {
      await generateAssessment({
        syllabus_id: Number(syllabusId),
        video_id: selectedItem.video_id,
        video_title: selectedItem.video_title || selectedItem.topic,
      });

      const summaryData = await getAssessmentSummary(syllabusId, selectedItem.video_id);
      setSummary(summaryData);
      setShowSummary(false);

      const qData = await getAssessment(syllabusId, selectedItem.video_id);
      const qList = Array.isArray(qData)
        ? qData
        : qData?.questions || qData?.items || qData?.data || [];
      setQuestions(qList);

      setAssessmentStarted(false);
      setSelectedAnswers({});
      setSubmittedAssessment(false);
      setVideoResult(null);
      setSrsSubmitted(false);
      setSrsNextReview(null);
      setAutoSrsQuality(null);
      setSrsOverrideMode(false);
      setMessage("Assessment generated successfully.");
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "Failed to generate assessment");
    } finally {
      setAssessmentLoading(false);
    }
  };

  const normalizeOptions = (q: any) => {
    if (q?.options && typeof q.options === "object" && !Array.isArray(q.options)) return q.options;
    if (q?.choices && typeof q.choices === "object" && !Array.isArray(q.choices)) return q.choices;
    return { A: q?.option_a, B: q?.option_b, C: q?.option_c, D: q?.option_d };
  };

  const handleSelectOption = (assessmentId: string, optionKey: string) => {
    if (submittedAssessment) return;
    setSelectedAnswers((prev) => ({ ...prev, [assessmentId]: optionKey }));
  };

  // ── SRS auto-quality from score ──────────────────────────────────────────
  // Stores the quality that was auto-calculated from the score so the user
  // can see what was submitted and optionally override it.
  const [autoSrsQuality, setAutoSrsQuality] = useState<number | null>(null);
  const [srsOverrideMode, setSrsOverrideMode] = useState(false);

  /**
   * Map a score percentage to an SRS quality value (0–5).
   *   0–19%  → 0 (Blank)
   *   20–39% → 1 (Wrong)
   *   40–49% → 2 (Hard fail)
   *   50–64% → 3 (Hard pass)
   *   65–84% → 4 (Good)
   *   85–100%→ 5 (Easy)
   */
  const scoreToSrsQuality = (scorePct: number): number => {
    if (scorePct < 20) return 0;
    if (scorePct < 40) return 1;
    if (scorePct < 50) return 2;
    if (scorePct < 65) return 3;
    if (scorePct < 85) return 4;
    return 5;
  };

  const handleSubmitAssessment = async () => {
    if (!syllabusId || !selectedItem?.video_id) return;
    if (questions.length === 0) { setError("No assessment questions found."); return; }

    const unanswered = questions.filter((q) => {
      const assessmentId = String(q?.id ?? q?.assessment_id ?? q?.question_id ?? "");
      return !selectedAnswers[assessmentId];
    });

    if (unanswered.length > 0) {
      setError("Please answer all questions before submitting the assessment.");
      return;
    }

    setSubmittingAssessment(true);
    setError("");
    setMessage("");

    try {
      // ── 1. Submit each answer ───────────────────────────────────────────
      for (const q of questions) {
        const assessmentId = Number(q?.id ?? q?.assessment_id ?? q?.question_id);
        const chosenOption = selectedAnswers[String(assessmentId)];
        await submitPerformance({
          syllabus_id: Number(syllabusId),
          video_id: selectedItem.video_id,
          assessment_id: assessmentId,
          selected_option: chosenOption,
          topic_name: selectedItem.topic || selectedItem.video_title || "Topic",
        });
      }

      // ── 2. Fetch video result to get score ─────────────────────────────
      const result = await getVideoResult(syllabusId, selectedItem.video_id);
      setVideoResult(result);
      setSubmittedAssessment(true);

      // ── 3. Auto-calculate SRS quality from score and submit ────────────
      const quality = scoreToSrsQuality(result.score_percentage ?? 0);
      setAutoSrsQuality(quality);

      try {
        const srsResult = await submitSRSReview({
          syllabus_id: Number(syllabusId),
          topic_name: selectedItem.topic,
          quality,
        });
        setSrsSubmitted(true);
        setSrsNextReview(srsResult?.next_review || null);
      } catch {
        // SRS auto-submit failed — show manual rating fallback
        setSrsSubmitted(false);
      }

      await loadCourseFlow();
      await loadPerformanceReport();

      setMessage("Assessment submitted! SRS review scheduled automatically based on your score.");
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "Failed to submit assessment");
    } finally {
      setSubmittingAssessment(false);
    }
  };

  const handleSRSRating = async (quality: number) => {
    if (!syllabusId || !selectedItem) return;
    setSrsSubmitting(true);

    try {
      const result = await submitSRSReview({
        syllabus_id: Number(syllabusId),
        topic_name: selectedItem.topic,
        quality,
      });
      setSrsSubmitted(true);
      setSrsNextReview(result?.next_review || null);
    } catch {
      setSrsSubmitted(true);
    } finally {
      setSrsSubmitting(false);
    }
  };

  const handleAskDoubt = async () => {
    if (!syllabusId) return;
    if (!doubtQuestion.trim()) { setDoubtError("Please enter your question."); return; }

    setDoubtLoading(true);
    setDoubtError("");

    try {
      const data = await askDoubt({
        syllabus_id: Number(syllabusId),
        question: doubtQuestion.trim(),
        video_id: selectedItem?.video_id || undefined,
        top_k: 5,
      });
      setDoubtResult(data);
      setDoubtQuestion("");
      await loadDoubtHistory();
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setDoubtError(typeof detail === "string" ? detail : "Failed to get answer");
    } finally {
      setDoubtLoading(false);
    }
  };

  const handleReindexDoubtSources = async () => {
    if (!syllabusId) return;
    setDoubtReindexing(true);
    setDoubtError("");
    try {
      await reindexDoubtSources(Number(syllabusId));
      setDoubtResult(null);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setDoubtError(typeof detail === "string" ? detail : "Failed to reindex doubt sources");
    } finally {
      setDoubtReindexing(false);
    }
  };

  const handleDeleteHistory = async (historyId: number) => {
    try {
      await deleteDoubtHistoryItem(historyId);
      if (expandedHistoryId === historyId) setExpandedHistoryId(null);
      await loadDoubtHistory();
    } catch {
      // silent fail
    }
  };

  const formatSummaryText = (summaryData: any) => {
    if (!summaryData) return "";
    if (typeof summaryData === "string") return summaryData;
    if (typeof summaryData?.summary_text === "string") return summaryData.summary_text;
    if (typeof summaryData?.summary === "string") return summaryData.summary;
    if (typeof summaryData?.text === "string") return summaryData.text;
    return "Summary is not available in text format.";
  };

  const formatHistoryDate = (value: string) => {
    try { return new Date(value).toLocaleString(); } catch { return value; }
  };

  // ── Min date for the modal date picker (tomorrow) ─────────────────────────
  const tomorrowStr = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0];
  })();

  if (fetching) return <div className="p-6">Loading study course...</div>;

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto">

        {/* ══════════════════════════════ COMPRESSION WARNING BANNER ════════ */}
        {compressionWarning && (
          <div className="rounded-xl border border-yellow-300 bg-yellow-50 p-5 mb-6 shadow-sm">
            <div className="flex items-start gap-3 flex-wrap">
              {/* Icon */}
              <span className="text-yellow-500 text-xl mt-0.5">⚠️</span>

              {/* Text */}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-yellow-800">Plan compressed to fit your timeline</p>
                <p className="text-sm text-yellow-700 mt-1">{compressionWarning}</p>
                <p className="text-sm text-yellow-700 mt-1">
                  You can fix this by extending your end date or increasing daily study hours.
                </p>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => openAdjustModal("date")}
                  className="bg-yellow-500 hover:bg-yellow-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                >
                  Extend End Date
                </button>
                <button
                  onClick={() => openAdjustModal("hours")}
                  className="bg-white hover:bg-yellow-100 text-yellow-800 border border-yellow-400 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                >
                  Increase Daily Hours
                </button>
                <button
                  onClick={() => setCompressionWarning(null)}
                  className="text-yellow-600 hover:text-yellow-800 text-sm px-2 py-2"
                  title="Dismiss warning"
                >
                  ✕
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════ ADJUSTMENT MODAL ══════════════════ */}
        {adjustModalType && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">

              {/* Modal header */}
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-bold text-slate-900">
                  {adjustModalType === "date" ? "Extend End Date" : "Increase Daily Study Hours"}
                </h2>
                <button
                  onClick={closeAdjustModal}
                  className="text-slate-400 hover:text-slate-600 text-xl leading-none"
                >
                  ✕
                </button>
              </div>

              {/* Context info */}
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 mb-5 text-sm text-slate-600">
                <p>
                  <span className="font-medium">Current end date:</span>{" "}
                  {endDate || "—"}
                </p>
                <p className="mt-1">
                  <span className="font-medium">Current daily hours:</span>{" "}
                  {hoursPerDay}h
                </p>
              </div>

              {/* Input */}
              {adjustModalType === "date" ? (
                <div className="mb-5">
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    New end date
                  </label>
                  <input
                    type="date"
                    min={tomorrowStr}
                    value={modalEndDate}
                    onChange={(e) => setModalEndDate(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-slate-500 mt-2">
                    Must be after today. The more days you add, the better the coverage.
                  </p>
                </div>
              ) : (
                <div className="mb-5">
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Daily study hours
                  </label>
                  <input
                    type="number"
                    min={0.5}
                    max={16}
                    step={0.5}
                    value={modalHours}
                    onChange={(e) => setModalHours(Number(e.target.value))}
                    className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {/* Quick-select buttons */}
                  <div className="flex gap-2 flex-wrap mt-3">
                    {[1, 2, 3, 4, 6, 8].map((h) => (
                      <button
                        key={h}
                        onClick={() => setModalHours(h)}
                        className={`px-3 py-1 rounded-full border text-sm transition-colors ${
                          modalHours === h
                            ? "bg-blue-600 text-white border-blue-600"
                            : "border-slate-300 text-slate-600 hover:border-blue-400 hover:text-blue-700"
                        }`}
                      >
                        {h}h
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    More hours per day = more videos fit in the same timeline.
                  </p>
                </div>
              )}

              {adjustError && (
                <p className="text-red-500 text-sm mb-4">{adjustError}</p>
              )}

              {/* Footer buttons */}
              <div className="flex gap-3 justify-end">
                <button
                  onClick={closeAdjustModal}
                  disabled={adjustLoading}
                  className="border border-slate-300 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmAdjust}
                  disabled={adjustLoading}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg font-medium disabled:opacity-50 flex items-center gap-2 transition-colors"
                >
                  {adjustLoading && (
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  )}
                  {adjustLoading ? "Regenerating..." : "Confirm & Regenerate"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════ DOUBT SOLVER ══════════════════════ */}
        <div className="bg-white rounded-xl shadow p-6 mb-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-2xl font-bold">AI Doubt Solver</h2>
              <p className="text-slate-600 mt-1">
                Ask doubts from your syllabus and video materials.
              </p>
              {selectedItem?.video_title && (
                <p className="text-sm text-blue-700 mt-2">
                  Current video context: {selectedItem.video_title}
                </p>
              )}
            </div>
            <button
              onClick={handleReindexDoubtSources}
              disabled={doubtReindexing}
              className="border border-slate-300 bg-white px-4 py-2 rounded hover:bg-slate-50 disabled:opacity-50"
            >
              {doubtReindexing ? "Indexing..." : "Refresh Sources"}
            </button>
          </div>

          <div className="mt-4 flex gap-3 flex-col md:flex-row">
            <input
              type="text"
              value={doubtQuestion}
              onChange={(e) => setDoubtQuestion(e.target.value)}
              placeholder="Ask any doubt..."
              className="flex-1 border rounded px-4 py-3"
            />
            <button
              onClick={handleAskDoubt}
              disabled={doubtLoading}
              className="bg-indigo-600 text-white px-5 py-3 rounded disabled:opacity-50"
            >
              {doubtLoading ? "Thinking..." : "Ask"}
            </button>
          </div>

          {doubtError && <p className="text-red-500 mt-3">{doubtError}</p>}

          {doubtResult && (
            <div className="mt-6 space-y-4">
              <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <h3 className="font-semibold text-indigo-900">AI Answer</h3>
                  {doubtResult.mode && (
                    <span className="text-xs px-3 py-1 rounded-full bg-white border border-indigo-200 text-indigo-700">
                      Mode: {doubtResult.mode}
                    </span>
                  )}
                </div>
                <p className="whitespace-pre-wrap text-sm leading-7 text-slate-800 mt-2">
                  {doubtResult.answer}
                </p>
              </div>

              {doubtResult.sources?.length > 0 && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <h3 className="font-semibold text-slate-900 mb-3">Sources Used</h3>
                  <div className="space-y-3">
                    {doubtResult.sources.map((source, index) => (
                      <div key={`${source.source_type}-${source.source_ref}-${index}`} className="rounded border bg-white p-3">
                        <p className="text-sm font-semibold text-slate-900">
                          {source.source_type.toUpperCase()} — {source.source_ref}
                        </p>
                        {source.video_id && <p className="text-xs text-slate-500 mt-1">Video ID: {source.video_id}</p>}
                        <p className="text-xs text-slate-500 mt-1">Relevance Score: {source.score}</p>
                        <p className="text-sm text-slate-700 mt-2 whitespace-pre-wrap">{source.chunk_text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ══════════════════════════════ DOUBT HISTORY ═════════════════════ */}
        <div className="bg-white rounded-xl shadow p-6 mb-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <h3 className="text-xl font-semibold">Previous Doubts</h3>
            {historyLoading && <p className="text-sm text-slate-500">Loading history...</p>}
          </div>

          {doubtHistory.length === 0 ? (
            <p className="text-slate-600 mt-4">No previous doubts yet.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {doubtHistory.map((item) => {
                const isExpanded = expandedHistoryId === item.id;
                return (
                  <div key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-900 break-words">{item.question}</p>
                        <p className="text-xs text-slate-500 mt-1">{formatHistoryDate(item.created_at)}</p>
                        <div className="flex gap-3 flex-wrap mt-1">
                          {item.answer_mode && <p className="text-xs text-indigo-600">Mode: {item.answer_mode}</p>}
                          {item.video_id && <p className="text-xs text-blue-600">Video ID: {item.video_id}</p>}
                        </div>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <button
                          onClick={() => setExpandedHistoryId(isExpanded ? null : item.id)}
                          className="border border-slate-300 px-3 py-1 rounded hover:bg-slate-100"
                        >
                          {isExpanded ? "Hide" : "View"}
                        </button>
                        <button
                          onClick={() => handleDeleteHistory(item.id)}
                          className="border border-red-300 text-red-600 px-3 py-1 rounded hover:bg-red-50"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="mt-4 border-t pt-4">
                        <p className="text-slate-700 whitespace-pre-wrap">{item.answer}</p>
                        {item.sources?.length > 0 && (
                          <div className="mt-4 space-y-3">
                            <h4 className="font-semibold text-slate-900">Sources</h4>
                            {item.sources.map((source, index) => (
                              <div key={`${item.id}-${source.source_type}-${index}`} className="rounded border bg-white p-3">
                                <p className="text-sm font-semibold text-slate-900">
                                  {source.source_type.toUpperCase()} — {source.source_ref}
                                </p>
                                {source.video_id && <p className="text-xs text-slate-500 mt-1">Video ID: {source.video_id}</p>}
                                <p className="text-xs text-slate-500 mt-1">Relevance Score: {source.score}</p>
                                <p className="text-sm text-slate-700 mt-2 whitespace-pre-wrap">{source.chunk_text}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ══════════════════════════════ PLAN CONTROLS ═════════════════════ */}
        <div className="bg-white rounded-xl shadow p-6 mb-6">
          <h1 className="text-2xl font-bold mb-4">Guided Study Course</h1>
          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <label className="block text-sm font-medium mb-2">Course End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full border rounded px-4 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Study Hours Per Day</label>
              <input
                type="number"
                min="1"
                max="16"
                step="0.5"
                value={hoursPerDay}
                onChange={(e) => setHoursPerDay(Number(e.target.value))}
                className="w-full border rounded px-4 py-2"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={() => handleGeneratePlan()}
                disabled={loading}
                className="bg-blue-600 text-white px-5 py-2 rounded w-full disabled:opacity-50"
              >
                {loading ? "Generating..." : "Generate / Regenerate Plan"}
              </button>
            </div>
            <div className="flex items-end">
              <button
                onClick={handleAdaptPlan}
                disabled={adaptLoading || !courseFlow}
                className="bg-amber-500 text-white px-5 py-2 rounded w-full disabled:opacity-50"
              >
                {adaptLoading ? "Adapting..." : "Adapt Study Plan"}
              </button>
            </div>
          </div>
          {error && <p className="text-red-500 mt-4">{error}</p>}
          {message && <p className="text-green-600 mt-4">{message}</p>}
        </div>

        {/* ══════════════════════════════ ADAPT CHANGES ═════════════════════ */}
        {adaptChanges.length > 0 && (
          <div className="bg-white rounded-xl shadow p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Adaptive Changes Made</h2>
            <div className="space-y-3">
              {adaptChanges.map((change, index) => (
                <div key={`${change.topic}-${change.action}-${index}`} className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <p className="font-semibold text-slate-900">{change.topic}</p>
                  <p className="mt-1 text-sm text-slate-700">Mastery: {change.mastery_percentage}% ({change.mastery_level})</p>
                  <p className="mt-1 text-sm text-amber-700">{change.action}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══════════════════════════════ PERFORMANCE ═══════════════════════ */}
        {performanceReport && (
          <div className="bg-white rounded-xl shadow p-6 mb-6">
            <h2 className="text-xl font-semibold mb-3">Performance Recommendation</h2>
            <p className="text-slate-700 mb-4">
              <span className="font-semibold">Overall Score:</span> {performanceReport.overall_score}%
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                <h3 className="font-semibold text-green-800 mb-2">Strong Topics</h3>
                {performanceReport.strong_topics?.length > 0 ? (
                  <ul className="list-disc pl-5 text-green-700">
                    {performanceReport.strong_topics.map((topic, index) => <li key={index}>{topic}</li>)}
                  </ul>
                ) : <p className="text-green-700">No strong topics yet.</p>}
              </div>
              <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                <h3 className="font-semibold text-red-800 mb-2">Weak Topics</h3>
                {performanceReport.weak_topics?.length > 0 ? (
                  <ul className="list-disc pl-5 text-red-700">
                    {performanceReport.weak_topics.map((topic, index) => <li key={index}>{topic}</li>)}
                  </ul>
                ) : <p className="text-red-700">No weak topics yet.</p>}
              </div>
            </div>
            <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
              <h3 className="font-semibold text-blue-800 mb-2">Recommendation</h3>
              <p className="text-blue-700">{performanceReport.recommendation}</p>
            </div>
          </div>
        )}

        {/* ══════════════════════════════ COURSE FLOW ═══════════════════════ */}
        {!courseFlow ? (
          <div className="bg-white rounded-xl shadow p-6">No study plan generated yet.</div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[320px_1fr]">

            {/* Sidebar */}
            <div className="bg-white rounded-xl shadow p-4 h-fit">
              <h2 className="text-xl font-semibold mb-4">Course Videos</h2>
              <div className="space-y-3">
                {courseFlow.items.map((item) => {
                  const isSelected = selectedItemId === item.id;
                  const isSrsReview = item.task?.toLowerCase().includes("srs review");
                  return (
                    <button
                      key={item.id}
                      id={`flow-item-${item.id}`}
                      onClick={() => item.unlocked && setSelectedItemId(item.id)}
                      disabled={!item.unlocked}
                      className={`w-full text-left rounded-lg border p-4 ${
                        isSelected
                          ? "border-blue-600 bg-blue-50"
                          : item.unlocked
                          ? "border-gray-200 bg-white hover:bg-gray-50"
                          : "border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold">Day {item.day}</p>
                        {isSrsReview && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">
                            Review
                          </span>
                        )}
                      </div>
                      <p className="text-sm mt-1">{item.video_title || item.topic}</p>
                      <p className="text-xs mt-2">
                        {item.completed ? "Completed" : item.unlocked ? "Unlocked" : "Locked"}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Main content */}
            <div className="space-y-6">
              {!selectedItem ? (
                <div className="bg-white rounded-xl shadow p-6">No video selected.</div>
              ) : !selectedItem.unlocked ? (
                <div className="bg-white rounded-xl shadow p-6">
                  This video is locked. Complete the previous assessment first.
                </div>
              ) : (
                <>
                  {/* Video player */}
                  <div className="bg-white rounded-xl shadow p-6">
                    <h2 className="text-2xl font-bold mb-2">
                      {selectedItem.video_title || selectedItem.topic}
                    </h2>
                    <p className="text-gray-600 mb-4">{selectedItem.task}</p>
                    {selectedItem.video_id ? (
                      <iframe
                        width="100%"
                        height="450"
                        src={`https://www.youtube.com/embed/${selectedItem.video_id}`}
                        title={selectedItem.video_title || selectedItem.topic}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        className="rounded-lg"
                      />
                    ) : (
                      <p className="text-red-500">Video not found for this plan item.</p>
                    )}
                  </div>

                  {/* Assessment */}
                  <div className="bg-white rounded-xl shadow p-6">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div>
                        <h3 className="text-xl font-semibold">Assessment</h3>
                        <p className="text-gray-600 mt-1">
                          Complete this assessment to unlock the next video.
                        </p>
                      </div>
                      <div className="flex gap-3 flex-wrap">
                        <button
                          onClick={handleGenerateAssessment}
                          disabled={assessmentLoading || submittedAssessment}
                          className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
                        >
                          {assessmentLoading ? "Generating..." : "Generate Assessment"}
                        </button>
                        {summary && (
                          <button
                            onClick={() => setShowSummary((prev) => !prev)}
                            className="border border-slate-300 bg-white px-4 py-2 rounded hover:bg-slate-50"
                          >
                            {showSummary ? "Hide Summary" : "Show Summary"}
                          </button>
                        )}
                        {questions.length > 0 && !submittedAssessment && (
                          <button
                            onClick={() => { setAssessmentStarted(true); setError(""); setMessage(""); }}
                            className="bg-slate-900 text-white px-4 py-2 rounded"
                          >
                            Start Assessment
                          </button>
                        )}
                      </div>
                    </div>

                    {summary && showSummary && (
                      <div className="mt-6 bg-gray-50 border rounded-lg p-4">
                        <h4 className="font-semibold mb-2">Video Summary</h4>
                        <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">
                          {formatSummaryText(summary)}
                        </p>
                      </div>
                    )}

                    {videoResult && (
                      <div className="mt-6 rounded-lg border border-green-200 bg-green-50 p-4">
                        <h4 className="font-semibold text-green-800">Assessment Result</h4>
                        <p className="mt-2 text-sm text-green-700">
                          Score: {videoResult.correct_answers} / {videoResult.total_questions} ({videoResult.score_percentage}%)
                        </p>
                        <p className="mt-1 text-sm text-green-700">
                          Video Completed: {videoResult.video_completed ? "Yes" : "No"}
                        </p>
                        <p className="mt-1 text-sm text-green-700">
                          Course Progress: {videoResult.course_progress_percentage}%
                        </p>
                        <p className="mt-1 text-sm text-green-700">
                          Videos Completed: {videoResult.videos_completed} / {videoResult.total_videos}
                        </p>
                      </div>
                    )}

                    {/* ── SRS: Auto-submitted result ───────────────────── */}
                    {submittedAssessment && srsSubmitted && autoSrsQuality !== null && (
                      <div className="mt-6 rounded-lg border border-purple-200 bg-purple-50 p-5">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div>
                            <h4 className="font-semibold text-purple-900 mb-1">
                              ✓ SRS Review Scheduled Automatically
                            </h4>
                            <p className="text-sm text-purple-700">
                              Based on your score, we assigned quality{" "}
                              <span className="font-semibold">
                                {autoSrsQuality} — {SRS_RATINGS[autoSrsQuality]?.label}
                              </span>
                              {srsNextReview && (
                                <>
                                  {" "}· Next review on{" "}
                                  <span className="font-semibold">{srsNextReview}</span>
                                </>
                              )}
                            </p>
                          </div>
                          {/* Let user override if they feel the auto quality was wrong */}
                          {!srsOverrideMode && (
                            <button
                              onClick={() => setSrsOverrideMode(true)}
                              className="text-xs text-purple-600 underline hover:text-purple-800 whitespace-nowrap"
                            >
                              Override rating
                            </button>
                          )}
                        </div>

                        {/* Score → quality mapping explanation */}
                        <div className="mt-3 grid grid-cols-3 gap-1.5 sm:grid-cols-6 text-xs text-center">
                          {SRS_RATINGS.map((r) => (
                            <div
                              key={r.value}
                              className={`rounded-lg px-2 py-1.5 border ${
                                r.value === autoSrsQuality
                                  ? "bg-purple-600 text-white border-purple-600 font-semibold"
                                  : "bg-white text-slate-500 border-slate-200"
                              }`}
                            >
                              <div>{r.value}</div>
                              <div>{r.label}</div>
                            </div>
                          ))}
                        </div>

                        {/* Manual override buttons */}
                        {srsOverrideMode && (
                          <div className="mt-4 border-t border-purple-200 pt-4">
                            <p className="text-sm text-purple-800 font-medium mb-3">
                              Choose your rating manually:
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {SRS_RATINGS.map((r) => (
                                <button
                                  key={r.value}
                                  onClick={async () => {
                                    setSrsSubmitting(true);
                                    try {
                                      const res = await submitSRSReview({
                                        syllabus_id: Number(syllabusId),
                                        topic_name: selectedItem!.topic,
                                        quality: r.value,
                                      });
                                      setAutoSrsQuality(r.value);
                                      setSrsNextReview(res?.next_review || null);
                                      setSrsOverrideMode(false);
                                    } catch {
                                      // silent
                                    } finally {
                                      setSrsSubmitting(false);
                                    }
                                  }}
                                  disabled={srsSubmitting}
                                  className={`px-4 py-2 rounded border text-sm font-medium disabled:opacity-50 ${r.color} ${
                                    r.value === autoSrsQuality ? "ring-2 ring-purple-500" : ""
                                  }`}
                                >
                                  {r.value} — {r.label}
                                </button>
                              ))}
                            </div>
                            {srsSubmitting && (
                              <p className="text-sm text-purple-600 mt-2">Updating review...</p>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* ── SRS: Auto-submit failed fallback (manual required) ── */}
                    {submittedAssessment && !srsSubmitted && (
                      <div className="mt-6 rounded-lg border border-purple-200 bg-purple-50 p-5">
                        <h4 className="font-semibold text-purple-900 mb-1">
                          Rate this topic for SRS
                        </h4>
                        <p className="text-sm text-purple-700 mb-4">
                          Auto-scheduling failed — please rate manually to schedule your next review.
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {SRS_RATINGS.map((r) => (
                            <button
                              key={r.value}
                              onClick={() => handleSRSRating(r.value)}
                              disabled={srsSubmitting}
                              className={`px-4 py-2 rounded border text-sm font-medium disabled:opacity-50 ${r.color}`}
                            >
                              {r.value} — {r.label}
                            </button>
                          ))}
                        </div>
                        {srsSubmitting && (
                          <p className="text-sm text-purple-600 mt-3">Scheduling review...</p>
                        )}
                      </div>
                    )}

                    <div className="mt-6">
                      {selectedItem.completed || submittedAssessment ? (
                        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-green-700">
                          Assessment completed for this video.
                        </div>
                      ) : questions.length === 0 ? (
                        <p className="text-gray-600">No assessment yet. Click Generate Assessment.</p>
                      ) : !assessmentStarted ? (
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-slate-700">
                          Click <span className="font-semibold">Start Assessment</span> to begin.
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {questions.map((q, index) => {
                            const options = normalizeOptions(q);
                            const assessmentId = String(q?.id ?? q?.assessment_id ?? q?.question_id ?? index);
                            const selectedAnswer = selectedAnswers[assessmentId];
                            return (
                              <div key={assessmentId} className="border rounded-lg p-4">
                                <h4 className="font-semibold mb-3">
                                  {index + 1}. {q?.question || "Question"}
                                </h4>
                                <div className="grid gap-3">
                                  {Object.entries(options)
                                    .filter(([, value]) => value)
                                    .map(([key, value]) => (
                                      <button
                                        key={key}
                                        onClick={() => handleSelectOption(assessmentId, key)}
                                        className={`text-left border rounded p-3 ${
                                          selectedAnswer === key
                                            ? "bg-blue-100 border-blue-500"
                                            : "hover:bg-gray-50"
                                        }`}
                                      >
                                        <span className="font-semibold mr-2">{key}.</span>
                                        <span>{String(value)}</span>
                                      </button>
                                    ))}
                                </div>
                              </div>
                            );
                          })}
                          <div className="pt-2">
                            <button
                              onClick={handleSubmitAssessment}
                              disabled={submittingAssessment}
                              className="bg-green-600 text-white px-5 py-3 rounded disabled:opacity-50"
                            >
                              {submittingAssessment ? "Submitting..." : "Submit Assessment"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}