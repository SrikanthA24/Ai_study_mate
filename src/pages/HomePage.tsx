import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { getMySyllabi } from "../api/syllabusApi";
import { getStudyPlan, generateStudyPlan } from "../api/studyPlanApi";
import { getDueSRSCards, getAllSRSCards } from "../api/srsApi";
import type { SRSCard } from "../api/srsApi";
import RegeneratePlanModal from "../components/RegeneratePlanModal";
import { removeToken } from "../utils/storage";

type Tab = "overview" | "srs" | "actions";

type Syllabus = {
  id: number;
  subject_name?: string;
  title?: string;
};

type StudyPlanItem = {
  id?: number;
  day?: number;
  day_number?: number;
  date?: string;
  topic?: string;
  topic_name?: string;
  task?: string;
  priority?: string;
  estimated_hours?: number;
  is_completed?: boolean;
  video_id?: string | null;
  video_title?: string | null;
  video_url?: string | null;
};

type StudyPlanResponse = {
  study_plan_id?: number;
  syllabus_id?: number;
  title?: string;
  summary?: string;
  end_date?: string;
  hours_per_day?: number;
  playlist_id?: string | null;
  playlist_url?: string | null;
  plan?: StudyPlanItem[];
};

export default function HomePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // ── Tab — auto-open SRS tab if ?tab=srs is in the URL ────────────────────
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam === "srs") return "srs";
    if (tabParam === "actions") return "actions";
    return "overview";
  });

  // ── Syllabi ───────────────────────────────────────────────────────────────
  const [syllabi, setSyllabi] = useState<Syllabus[]>([]);
  const [selectedSyllabusId, setSelectedSyllabusId] = useState<number | "">("");
  const [loadingSyllabi, setLoadingSyllabi] = useState(true);

  // ── Study plan ────────────────────────────────────────────────────────────
  const [studyPlan, setStudyPlan] = useState<StudyPlanResponse | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [planModalMode, setPlanModalMode] = useState<"generate" | "regenerate">("generate");

  // ── SRS ───────────────────────────────────────────────────────────────────
  const [dueCards, setDueCards] = useState<SRSCard[]>([]);
  const [allCards, setAllCards] = useState<SRSCard[]>([]);
  const [loadingSRS, setLoadingSRS] = useState(false);
  const [srsFilter, setSrsFilter] = useState<"due" | "all">("due");

  // ── General ───────────────────────────────────────────────────────────────
  const [error, setError] = useState("");

  const handleLogout = () => {
    removeToken();
    navigate("/");
  };

  // ── Load syllabi on mount ─────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        setLoadingSyllabi(true);
        const data = await getMySyllabi();
        const list: Syllabus[] = Array.isArray(data) ? data : data?.syllabi || [];
        setSyllabi(list);
        if (list.length > 0) setSelectedSyllabusId(list[0].id);
      } catch {
        setError("Failed to load courses.");
      } finally {
        setLoadingSyllabi(false);
      }
    };
    load();
  }, []);

  // ── Load study plan when syllabus changes ─────────────────────────────────
  useEffect(() => {
    if (!selectedSyllabusId) return;
    const load = async () => {
      setLoadingPlan(true);
      try {
        const data = await getStudyPlan(selectedSyllabusId);
        setStudyPlan(data);
      } catch (err: any) {
        if (err?.response?.status === 404) setStudyPlan(null);
        else setError("Failed to load study plan.");
      } finally {
        setLoadingPlan(false);
      }
    };
    load();
  }, [selectedSyllabusId]);

  // ── Load SRS cards when syllabus changes ──────────────────────────────────
  useEffect(() => {
    if (!selectedSyllabusId) return;
    const load = async () => {
      setLoadingSRS(true);
      try {
        const [due, all] = await Promise.all([
          getDueSRSCards(Number(selectedSyllabusId)),
          getAllSRSCards(Number(selectedSyllabusId)),
        ]);
        setDueCards(Array.isArray(due) ? due : []);
        setAllCards(Array.isArray(all) ? all : []);
      } catch {
        setDueCards([]);
        setAllCards([]);
      } finally {
        setLoadingSRS(false);
      }
    };
    load();
  }, [selectedSyllabusId]);

  // ── Plan modal ────────────────────────────────────────────────────────────
  const openGenerateModal = () => { setPlanModalMode("generate"); setShowPlanModal(true); };
  const openRegenerateModal = () => { setPlanModalMode("regenerate"); setShowPlanModal(true); };

  const handleSubmitPlan = async (data: { end_date: string; hours_per_day: number }) => {
    if (!selectedSyllabusId) return;
    setGeneratingPlan(true);
    setError("");
    try {
      const response = await generateStudyPlan(selectedSyllabusId, {
        end_date: data.end_date,
        hours_per_day: data.hours_per_day,
        force_regenerate: planModalMode === "regenerate",
      });
      setStudyPlan(response);
      setShowPlanModal(false);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "Failed to generate study plan.");
      throw err;
    } finally {
      setGeneratingPlan(false);
    }
  };

  // ── Derived plan stats ────────────────────────────────────────────────────
  const planItems = studyPlan?.plan || [];
  const completedCount = useMemo(() => planItems.filter((i) => i.is_completed).length, [planItems]);
  const remainingCount = useMemo(() => Math.max(planItems.length - completedCount, 0), [planItems, completedCount]);
  const completionPct = useMemo(() =>
    planItems.length === 0 ? 0 : Math.round((completedCount / planItems.length) * 100),
    [planItems, completedCount]
  );
  const nextPendingTask = useMemo(() => planItems.find((i) => !i.is_completed) || null, [planItems]);

  const selectedSyllabus = syllabi.find((s) => s.id === selectedSyllabusId);
  const syllabusTitle = selectedSyllabus?.subject_name || selectedSyllabus?.title || "—";

  // ── SRS display list ──────────────────────────────────────────────────────
  const displayedCards = srsFilter === "due" ? dueCards : allCards;

  // ── Navigate to study plan, optionally jumping to first SRS review item ──
  const goToSRSReview = () => {
    if (!selectedSyllabusId) return;
    navigate(`/study-plan/${selectedSyllabusId}?scrollTo=srs`);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="mb-8 flex flex-col gap-4 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="mb-2 text-sm font-semibold tracking-wide text-blue-600">AI STUDY MATE</p>
            <h1 className="text-3xl font-bold text-slate-900">Home</h1>
            <p className="mt-2 text-slate-600">
              Track your course, review due topics, and manage your study plan.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/dashboard"
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 font-medium text-slate-700 hover:bg-slate-50"
            >
              Dashboard
            </Link>
            <Link
              to="/my-syllabi"
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 font-medium text-slate-700 hover:bg-slate-50"
            >
              My Syllabi
            </Link>
            <button
              onClick={handleLogout}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 font-medium text-slate-700 hover:bg-slate-50"
            >
              Logout
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-xl bg-red-50 px-4 py-3 text-red-700">{error}</div>
        )}

        {/* ── Course selector ─────────────────────────────────────────────── */}
        {!loadingSyllabi && syllabi.length > 0 && (
          <div className="mb-6 bg-white rounded-2xl p-4 shadow-sm ring-1 ring-slate-200 flex flex-col sm:flex-row sm:items-center gap-3">
            <label className="text-sm font-medium text-slate-700 whitespace-nowrap">
              Active Course:
            </label>
            <select
              value={selectedSyllabusId}
              onChange={(e) => setSelectedSyllabusId(Number(e.target.value))}
              className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2 text-slate-900 outline-none focus:border-blue-500"
            >
              {syllabi.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.subject_name || s.title || `Course ${s.id}`}
                </option>
              ))}
            </select>
            {dueCards.length > 0 && (
              <span className="rounded-full bg-purple-100 px-3 py-1 text-sm font-medium text-purple-700 whitespace-nowrap">
                {dueCards.length} review{dueCards.length !== 1 ? "s" : ""} due
              </span>
            )}
          </div>
        )}

        {/* ── Tab bar ─────────────────────────────────────────────────────── */}
        <div className="mb-6 flex gap-1 rounded-2xl bg-white p-1.5 shadow-sm ring-1 ring-slate-200 w-fit">
          {(
            [
              { key: "overview", label: "📚 Course Overview" },
              {
                key: "srs",
                label: `🧠 SRS Reviews${dueCards.length > 0 ? ` (${dueCards.length})` : ""}`,
              },
              { key: "actions", label: "⚡ Quick Actions" },
            ] as { key: Tab; label: string }[]
          ).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-xl px-5 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? "bg-blue-600 text-white shadow"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ════════════════════════════════════════════════════════════════════
            TAB: COURSE OVERVIEW
        ════════════════════════════════════════════════════════════════════ */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            {loadingSyllabi ? (
              <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200 text-slate-600">
                Loading courses...
              </div>
            ) : syllabi.length === 0 ? (
              <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
                <p className="text-slate-700 mb-4">You haven't registered any course yet.</p>
                <Link
                  to="/syllabus/create"
                  className="inline-block rounded-xl bg-blue-600 px-5 py-3 font-medium text-white hover:bg-blue-700"
                >
                  Register New Course
                </Link>
              </div>
            ) : (
              <>
                {/* Stats row */}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    { label: "Total Tasks", value: planItems.length, color: "text-slate-900" },
                    { label: "Completed", value: completedCount, color: "text-green-700" },
                    { label: "Remaining", value: remainingCount, color: "text-amber-700" },
                    { label: "SRS Due", value: dueCards.length, color: "text-purple-700" },
                  ].map((stat) => (
                    <div
                      key={stat.label}
                      className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 flex flex-col gap-1"
                    >
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                        {stat.label}
                      </p>
                      <p className={`text-3xl font-bold ${stat.color}`}>{stat.value}</p>
                    </div>
                  ))}
                </div>

                {/* Progress bar */}
                <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-lg font-semibold text-slate-900">
                      {syllabusTitle}
                    </h2>
                    <span className="text-2xl font-bold text-blue-600">{completionPct}%</span>
                  </div>
                  <div className="h-3 w-full rounded-full bg-slate-200">
                    <div
                      className="h-3 rounded-full bg-blue-600 transition-all"
                      style={{ width: `${completionPct}%` }}
                    />
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
                    <div className="rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
                      <span className="text-slate-500">Status</span>
                      <p className={`font-medium mt-0.5 ${studyPlan ? "text-green-700" : "text-amber-700"}`}>
                        {studyPlan ? "Active" : "Not generated"}
                      </p>
                    </div>
                    <div className="rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
                      <span className="text-slate-500">End Date</span>
                      <p className="font-medium mt-0.5 text-slate-800">
                        {studyPlan?.end_date || "Not set"}
                      </p>
                    </div>
                    <div className="rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
                      <span className="text-slate-500">Hours/Day</span>
                      <p className="font-medium mt-0.5 text-slate-800">
                        {studyPlan?.hours_per_day ?? "—"}
                      </p>
                    </div>
                    <div className="rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
                      <span className="text-slate-500">Playlist</span>
                      <p className={`font-medium mt-0.5 ${studyPlan?.playlist_url ? "text-blue-700" : "text-slate-500"}`}>
                        {studyPlan?.playlist_url ? "Selected" : "None"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Next task */}
                <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
                  <h2 className="text-lg font-semibold text-slate-900 mb-4">
                    Today's / Next Task
                  </h2>
                  {loadingPlan ? (
                    <p className="text-slate-600">Loading...</p>
                  ) : !studyPlan ? (
                    <div>
                      <p className="text-slate-600 mb-4">No study plan yet.</p>
                      <button
                        onClick={openGenerateModal}
                        disabled={!selectedSyllabusId || generatingPlan}
                        className="rounded-xl bg-indigo-600 px-5 py-3 font-medium text-white hover:bg-indigo-700 disabled:bg-slate-300"
                      >
                        {generatingPlan ? "Generating..." : "Generate Study Plan"}
                      </button>
                    </div>
                  ) : nextPendingTask ? (
                    <div>
                      <p className="text-xl font-semibold text-slate-900 mb-3">
                        {nextPendingTask.topic || nextPendingTask.topic_name || "Next Topic"}
                      </p>
                      <div className="space-y-2 text-sm text-slate-700 mb-5">
                        <p><span className="font-medium">Task:</span> {nextPendingTask.task || "Study topic"}</p>
                        <p><span className="font-medium">Date:</span> {nextPendingTask.date || "Planned"}</p>
                        <p><span className="font-medium">Priority:</span> {nextPendingTask.priority || "Normal"}</p>
                        <p><span className="font-medium">Est. Hours:</span> {nextPendingTask.estimated_hours ?? studyPlan.hours_per_day ?? 2}</p>
                      </div>
                      <div className="flex flex-wrap gap-3">
                        <Link
                          to={`/study-plan/${selectedSyllabusId}`}
                          className="rounded-xl bg-blue-600 px-5 py-3 font-medium text-white hover:bg-blue-700"
                        >
                          Continue Today's Task
                        </Link>
                        {dueCards.length > 0 && (
                          <button
                            onClick={goToSRSReview}
                            className="rounded-xl bg-purple-600 px-5 py-3 font-medium text-white hover:bg-purple-700"
                          >
                            Start {dueCards.length} Review{dueCards.length !== 1 ? "s" : ""}
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p className="text-slate-700 mb-4">All tasks completed! 🎉</p>
                      <button
                        onClick={openRegenerateModal}
                        className="rounded-xl bg-amber-500 px-5 py-3 font-medium text-white hover:bg-amber-600"
                      >
                        Regenerate Plan
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            TAB: SRS REVIEWS
        ════════════════════════════════════════════════════════════════════ */}
        {activeTab === "srs" && (
          <div className="space-y-6">

            {/* SRS header card */}
            <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-purple-200">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">
                    Spaced Repetition Reviews
                  </h2>
                  <p className="text-slate-500 mt-1 text-sm">
                    Topics are scheduled using the SM-2 algorithm. Review them at the
                    right time to maximise long-term retention.
                  </p>
                </div>

                {/* Start reviews CTA */}
                {dueCards.length > 0 && (
                  <button
                    onClick={goToSRSReview}
                    className="self-start rounded-xl bg-purple-600 px-6 py-3 font-semibold text-white hover:bg-purple-700 shadow-md whitespace-nowrap"
                  >
                    ▶ Start {dueCards.length} Due Review{dueCards.length !== 1 ? "s" : ""}
                  </button>
                )}
              </div>

              {/* Summary stats */}
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl bg-purple-50 p-4 ring-1 ring-purple-100">
                  <p className="text-xs text-purple-500 font-medium uppercase tracking-wide">Due Today</p>
                  <p className="text-3xl font-bold text-purple-700 mt-1">{dueCards.length}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Total Cards</p>
                  <p className="text-3xl font-bold text-slate-800 mt-1">{allCards.length}</p>
                </div>
                <div className="rounded-2xl bg-green-50 p-4 ring-1 ring-green-100">
                  <p className="text-xs text-green-600 font-medium uppercase tracking-wide">Up to Date</p>
                  <p className="text-3xl font-bold text-green-700 mt-1">
                    {allCards.length - dueCards.length}
                  </p>
                </div>
              </div>
            </div>

            {/* No plan / no cards state */}
            {!selectedSyllabusId ? (
              <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200 text-slate-600">
                Select a course above to see your SRS cards.
              </div>
            ) : loadingSRS ? (
              <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200 text-slate-600">
                Loading SRS cards...
              </div>
            ) : allCards.length === 0 ? (
              <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
                <p className="text-slate-700 font-medium mb-2">No SRS cards yet for this course.</p>
                <p className="text-slate-500 text-sm">
                  Complete video assessments and rate your confidence — cards are created
                  automatically after each rating.
                </p>
                <Link
                  to={`/study-plan/${selectedSyllabusId}`}
                  className="mt-5 inline-block rounded-xl bg-blue-600 px-5 py-3 font-medium text-white hover:bg-blue-700"
                >
                  Go to Study Plan
                </Link>
              </div>
            ) : (
              <>
                {/* Filter toggle */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setSrsFilter("due")}
                    className={`rounded-xl px-4 py-2 text-sm font-medium border transition-colors ${
                      srsFilter === "due"
                        ? "bg-purple-600 text-white border-purple-600"
                        : "bg-white text-slate-600 border-slate-300 hover:border-purple-400"
                    }`}
                  >
                    Due Today ({dueCards.length})
                  </button>
                  <button
                    onClick={() => setSrsFilter("all")}
                    className={`rounded-xl px-4 py-2 text-sm font-medium border transition-colors ${
                      srsFilter === "all"
                        ? "bg-slate-800 text-white border-slate-800"
                        : "bg-white text-slate-600 border-slate-300 hover:border-slate-600"
                    }`}
                  >
                    All Cards ({allCards.length})
                  </button>
                </div>

                {/* Due today — prominent CTA banner */}
                {srsFilter === "due" && dueCards.length > 0 && (
                  <div className="rounded-2xl bg-purple-600 p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shadow-md">
                    <div>
                      <p className="text-white font-semibold text-lg">
                        {dueCards.length} topic{dueCards.length !== 1 ? "s" : ""} ready for review
                      </p>
                      <p className="text-purple-200 text-sm mt-0.5">
                        Review now to keep your spaced repetition schedule on track.
                      </p>
                    </div>
                    <button
                      onClick={goToSRSReview}
                      className="self-start sm:self-auto rounded-xl bg-white text-purple-700 font-semibold px-6 py-3 hover:bg-purple-50 transition-colors shadow whitespace-nowrap"
                    >
                      Start Reviews →
                    </button>
                  </div>
                )}

                {srsFilter === "due" && dueCards.length === 0 && (
                  <div className="rounded-2xl bg-green-50 p-5 ring-1 ring-green-200 text-green-700 font-medium">
                    ✓ No reviews due today — you're all caught up!
                  </div>
                )}

                {/* Cards grid */}
                {displayedCards.length > 0 && (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {displayedCards.map((card) => {
                      const isDue = dueCards.some((d) => d.id === card.id);
                      const accuracy =
                        card.total_reviews > 0
                          ? Math.round((card.total_correct / card.total_reviews) * 100)
                          : 0;

                      return (
                        <div
                          key={card.id}
                          className={`rounded-2xl border p-5 flex flex-col gap-3 ${
                            isDue
                              ? "border-purple-300 bg-purple-50"
                              : "border-slate-200 bg-white"
                          }`}
                        >
                          {/* Topic name + due badge */}
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-semibold text-slate-900 leading-snug">
                              {card.topic_name}
                            </p>
                            {isDue && (
                              <span className="flex-shrink-0 rounded-full bg-purple-600 px-2 py-0.5 text-xs font-medium text-white">
                                Due
                              </span>
                            )}
                          </div>

                          {/* Stats */}
                          <div className="grid grid-cols-2 gap-2 text-xs text-slate-500">
                            <div className="rounded-lg bg-white border border-slate-100 px-2 py-1.5">
                              <span className="block font-medium text-slate-700">Next Review</span>
                              <span>{card.srs_next_review}</span>
                            </div>
                            <div className="rounded-lg bg-white border border-slate-100 px-2 py-1.5">
                              <span className="block font-medium text-slate-700">Interval</span>
                              <span>{card.srs_interval} day{card.srs_interval !== 1 ? "s" : ""}</span>
                            </div>
                            <div className="rounded-lg bg-white border border-slate-100 px-2 py-1.5">
                              <span className="block font-medium text-slate-700">Reviews</span>
                              <span>{card.total_reviews}</span>
                            </div>
                            <div className="rounded-lg bg-white border border-slate-100 px-2 py-1.5">
                              <span className="block font-medium text-slate-700">Accuracy</span>
                              <span className={accuracy >= 70 ? "text-green-600" : "text-red-500"}>
                                {accuracy}%
                              </span>
                            </div>
                          </div>

                          {/* EF bar */}
                          <div>
                            <div className="flex items-center justify-between text-xs mb-1">
                              <span className="text-slate-500">Ease Factor</span>
                              <span className="font-medium text-slate-700">{card.srs_ef?.toFixed(2)}</span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-slate-200">
                              <div
                                className="h-1.5 rounded-full bg-purple-500"
                                style={{
                                  width: `${Math.min(100, ((card.srs_ef - 1.3) / (3.5 - 1.3)) * 100)}%`,
                                }}
                              />
                            </div>
                          </div>

                          {/* Review button for due cards */}
                          {isDue && (
                            <button
                              onClick={goToSRSReview}
                              className="mt-1 w-full rounded-xl bg-purple-600 py-2 text-sm font-medium text-white hover:bg-purple-700 transition-colors"
                            >
                              Review Now
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            TAB: QUICK ACTIONS
        ════════════════════════════════════════════════════════════════════ */}
        {activeTab === "actions" && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">

            <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <p className="text-2xl mb-3">📖</p>
              <h3 className="font-semibold text-slate-900 mb-1">Continue Studying</h3>
              <p className="text-sm text-slate-500 mb-4">Pick up where you left off in today's plan.</p>
              <Link
                to={selectedSyllabusId ? `/study-plan/${selectedSyllabusId}` : "/my-syllabi"}
                className="block w-full rounded-xl bg-blue-600 py-3 text-center font-medium text-white hover:bg-blue-700"
              >
                Open Study Plan
              </Link>
            </div>

            <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-purple-200">
              <p className="text-2xl mb-3">🧠</p>
              <h3 className="font-semibold text-slate-900 mb-1">SRS Reviews</h3>
              <p className="text-sm text-slate-500 mb-4">
                {dueCards.length > 0
                  ? `${dueCards.length} topic${dueCards.length !== 1 ? "s" : ""} due for review today.`
                  : "All caught up — no reviews due today."}
              </p>
              <button
                onClick={() => setActiveTab("srs")}
                className={`block w-full rounded-xl py-3 text-center font-medium text-white transition-colors ${
                  dueCards.length > 0
                    ? "bg-purple-600 hover:bg-purple-700"
                    : "bg-slate-400 cursor-default"
                }`}
              >
                {dueCards.length > 0 ? "View Reviews" : "No Reviews Due"}
              </button>
            </div>

            <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <p className="text-2xl mb-3">➕</p>
              <h3 className="font-semibold text-slate-900 mb-1">New Course</h3>
              <p className="text-sm text-slate-500 mb-4">Register a new syllabus and playlist.</p>
              <Link
                to="/syllabus/create"
                className="block w-full rounded-xl bg-green-600 py-3 text-center font-medium text-white hover:bg-green-700"
              >
                Register Course
              </Link>
            </div>

            <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <p className="text-2xl mb-3">🔄</p>
              <h3 className="font-semibold text-slate-900 mb-1">Regenerate Plan</h3>
              <p className="text-sm text-slate-500 mb-4">Rebuild the study plan with updated settings.</p>
              <button
                onClick={openRegenerateModal}
                disabled={!studyPlan}
                className="block w-full rounded-xl bg-amber-500 py-3 text-center font-medium text-white hover:bg-amber-600 disabled:bg-slate-300 disabled:cursor-not-allowed"
              >
                Regenerate
              </button>
            </div>

            <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <p className="text-2xl mb-3">📊</p>
              <h3 className="font-semibold text-slate-900 mb-1">Performance</h3>
              <p className="text-sm text-slate-500 mb-4">View your performance report and weak topics.</p>
              <Link
                to={selectedSyllabusId ? `/study-plan/${selectedSyllabusId}` : "/my-syllabi"}
                className="block w-full rounded-xl bg-indigo-600 py-3 text-center font-medium text-white hover:bg-indigo-700"
              >
                View Performance
              </Link>
            </div>

            <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <p className="text-2xl mb-3">📂</p>
              <h3 className="font-semibold text-slate-900 mb-1">My Syllabi</h3>
              <p className="text-sm text-slate-500 mb-4">Browse and manage all your courses.</p>
              <Link
                to="/my-syllabi"
                className="block w-full rounded-xl bg-slate-800 py-3 text-center font-medium text-white hover:bg-slate-900"
              >
                Browse Syllabi
              </Link>
            </div>

          </div>
        )}

      </div>

      <RegeneratePlanModal
        open={showPlanModal}
        syllabusId={selectedSyllabusId}
        generatingPlan={generatingPlan}
        mode={planModalMode}
        hasExistingPlaylist={!!studyPlan?.playlist_url}
        onClose={() => setShowPlanModal(false)}
        onConfirm={handleSubmitPlan}
      />
    </div>
  );
}