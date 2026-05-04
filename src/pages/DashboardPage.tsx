import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { removeToken } from "../utils/storage";
import { getStudyPlan, generateStudyPlan } from "../api/studyPlanApi";
import { getMySyllabi } from "../api/syllabusApi";
import { getDueSRSCards } from "../api/srsApi";
import RegeneratePlanModal from "../components/RegeneratePlanModal";

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

type SRSCard = {
  id: number;
  topic_name: string;
  srs_next_review: string;
  srs_interval: number;
  srs_ef: number;
  total_reviews: number;
};

export default function DashboardPage() {
  const navigate = useNavigate();

  const [syllabi, setSyllabi] = useState<Syllabus[]>([]);
  const [selectedSyllabusId, setSelectedSyllabusId] = useState<number | "">("");
  const [studyPlan, setStudyPlan] = useState<StudyPlanResponse | null>(null);
  const [loadingSyllabi, setLoadingSyllabi] = useState(true);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [planModalMode, setPlanModalMode] = useState<"generate" | "regenerate">("generate");
  const [error, setError] = useState("");

  // SRS due reviews
  const [dueCards, setDueCards] = useState<SRSCard[]>([]);
  const [loadingDue, setLoadingDue] = useState(false);

  const handleLogout = () => {
    removeToken();
    navigate("/");
  };

  useEffect(() => {
    const loadSyllabi = async () => {
      try {
        setLoadingSyllabi(true);
        setError("");
        const data = await getMySyllabi();
        const syllabusList = Array.isArray(data) ? data : data?.syllabi || [];
        setSyllabi(syllabusList);
        if (syllabusList.length > 0) setSelectedSyllabusId(syllabusList[0].id);
      } catch (err) {
        console.error("Failed to load syllabi:", err);
        setError("Failed to load courses.");
      } finally {
        setLoadingSyllabi(false);
      }
    };
    loadSyllabi();
  }, []);

  useEffect(() => {
    const loadStudyPlan = async () => {
      if (!selectedSyllabusId) return;
      try {
        setLoadingPlan(true);
        setError("");
        const data = await getStudyPlan(selectedSyllabusId);
        setStudyPlan(data);
      } catch (err: any) {
        if (err?.response?.status === 404) { setStudyPlan(null); return; }
        console.error("Failed to load study plan:", err);
        setError("Failed to load ongoing course details.");
        setStudyPlan(null);
      } finally {
        setLoadingPlan(false);
      }
    };
    loadStudyPlan();
  }, [selectedSyllabusId]);

  // Load SRS due cards whenever syllabus changes
  useEffect(() => {
    const loadDueCards = async () => {
      if (!selectedSyllabusId) return;
      setLoadingDue(true);
      try {
        const data = await getDueSRSCards(Number(selectedSyllabusId));
        setDueCards(Array.isArray(data) ? data : []);
      } catch {
        setDueCards([]);
      } finally {
        setLoadingDue(false);
      }
    };
    loadDueCards();
  }, [selectedSyllabusId]);

  const openGenerateModal = () => { setPlanModalMode("generate"); setShowPlanModal(true); };
  const openRegenerateModal = () => { setPlanModalMode("regenerate"); setShowPlanModal(true); };

  const handleSubmitPlan = async (data: { end_date: string; hours_per_day: number }) => {
    if (!selectedSyllabusId) return;
    try {
      setGeneratingPlan(true);
      setError("");
      const response = await generateStudyPlan(selectedSyllabusId, {
        end_date: data.end_date,
        hours_per_day: data.hours_per_day,
        force_regenerate: planModalMode === "regenerate",
      });
      setStudyPlan(response);
      setShowPlanModal(false);
    } catch (err: any) {
      console.error("Failed to submit study plan:", err);
      const detail = err?.response?.data?.detail;
      const rawData = err?.response?.data;
      const fallback =
        typeof rawData === "string"
          ? rawData
          : err?.response?.data?.message || err?.message ||
            `Failed to ${planModalMode === "generate" ? "generate" : "regenerate"} study plan.`;

      if (typeof detail === "string") setError(detail);
      else if (Array.isArray(detail)) setError(detail.map((d: any) => d.msg || JSON.stringify(d)).join(", "));
      else setError(fallback);
      throw err;
    } finally {
      setGeneratingPlan(false);
    }
  };

  const planItems = studyPlan?.plan || [];

  const completedCount = useMemo(() => planItems.filter((item) => item.is_completed).length, [planItems]);
  const remainingCount = useMemo(() => Math.max(planItems.length - completedCount, 0), [planItems.length, completedCount]);
  const completionPercentage = useMemo(() => {
    if (planItems.length === 0) return 0;
    return Math.round((completedCount / planItems.length) * 100);
  }, [planItems.length, completedCount]);
  const nextPendingTask = useMemo(() => planItems.find((item) => !item.is_completed) || null, [planItems]);

  const selectedSyllabus = syllabi.find((s) => s.id === selectedSyllabusId);
  const selectedSyllabusTitle = selectedSyllabus?.subject_name || selectedSyllabus?.title || "No ongoing course";
  const planStatus = studyPlan ? "Active" : "Not generated yet";
  const playlistStatus = studyPlan?.playlist_url ? "Selected" : "Not selected";

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">

        {/* Header */}
        <div className="mb-8 flex flex-col gap-4 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="mb-2 text-sm font-semibold tracking-wide text-blue-600">AI STUDY MATE</p>
            <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
            <p className="mt-2 text-slate-600">Track your course, continue today's work, and manage your study plan.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link to="/my-syllabi" className="rounded-xl border border-slate-300 bg-white px-4 py-2 font-medium text-slate-700 hover:bg-slate-50">
              My Syllabi
            </Link>
            <button onClick={handleLogout} className="rounded-xl border border-slate-300 bg-white px-4 py-2 font-medium text-slate-700 hover:bg-slate-50">
              Logout
            </button>
          </div>
        </div>

        {error && <div className="mb-6 rounded-xl bg-red-50 px-4 py-3 text-red-700">{error}</div>}

        {/* ---------------------------------------------------------------- SRS Due Reviews */}
        {!loadingDue && dueCards.length > 0 && (
          <div className="mb-6 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-purple-200">
            <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">
                  Reviews Due Today
                  <span className="ml-2 rounded-full bg-purple-100 px-3 py-0.5 text-sm font-medium text-purple-700">
                    {dueCards.length}
                  </span>
                </h2>
                <p className="text-slate-500 text-sm mt-1">
                  These topics are scheduled for spaced repetition review today.
                </p>
              </div>
              <Link
                to={`/study-plan/${selectedSyllabusId}`}
                className="rounded-xl bg-purple-600 px-5 py-2 font-medium text-white hover:bg-purple-700"
              >
                Start Reviews
              </Link>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {dueCards.slice(0, 6).map((card) => (
                <div
                  key={card.id}
                  className="rounded-2xl border border-purple-100 bg-purple-50 px-4 py-3"
                >
                  <p className="font-medium text-slate-900 truncate">{card.topic_name}</p>
                  <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                    <span>Reviews: {card.total_reviews}</span>
                    <span>EF: {card.srs_ef?.toFixed(2)}</span>
                  </div>
                  <p className="mt-1 text-xs text-purple-600">
                    Due: {card.srs_next_review}
                  </p>
                </div>
              ))}
            </div>
            {dueCards.length > 6 && (
              <p className="mt-3 text-sm text-slate-500">
                +{dueCards.length - 6} more topics due. Open the study plan to review all.
              </p>
            )}
          </div>
        )}

        {/* ---------------------------------------------------------------- Course Overview */}
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-xl font-semibold text-slate-900">New Course Registration</h2>
            <p className="mt-2 text-slate-600">Create a new syllabus and start a new learning journey.</p>
            <div className="mt-6">
              <Link to="/syllabus/create" className="inline-block rounded-xl bg-blue-600 px-5 py-3 font-medium text-white transition hover:bg-blue-700">
                Register New Course
              </Link>
            </div>
          </div>

          <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 lg:col-span-2">
            <h2 className="text-xl font-semibold text-slate-900">Course Overview</h2>

            {loadingSyllabi ? (
              <p className="mt-4 text-slate-600">Loading courses...</p>
            ) : syllabi.length === 0 ? (
              <div className="mt-4 rounded-2xl bg-slate-50 p-5 ring-1 ring-slate-200">
                <p className="text-slate-700">You have not registered any course yet.</p>
                <Link to="/syllabus/create" className="mt-4 inline-block rounded-xl bg-blue-600 px-5 py-3 font-medium text-white hover:bg-blue-700">
                  Register New Course
                </Link>
              </div>
            ) : (
              <>
                <div className="mt-4">
                  <label className="mb-2 block text-sm font-medium text-slate-700">Select course</label>
                  <select
                    value={selectedSyllabusId}
                    onChange={(e) => setSelectedSyllabusId(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none focus:border-blue-500"
                  >
                    {syllabi.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.subject_name || s.title || `Course ${s.id}`}
                      </option>
                    ))}
                  </select>
                </div>

                {loadingPlan ? (
                  <p className="mt-6 text-slate-600">Loading course details...</p>
                ) : (
                  <div className="mt-6 grid gap-4 md:grid-cols-2">
                    <div className="rounded-2xl bg-slate-50 p-5 ring-1 ring-slate-200">
                      <p className="text-sm text-slate-500">Current Course</p>
                      <h3 className="mt-2 text-xl font-semibold text-slate-900">{selectedSyllabusTitle}</h3>
                      <div className="mt-4 space-y-3">
                        <div className="flex items-center justify-between rounded-xl bg-white px-4 py-3 ring-1 ring-slate-200">
                          <span className="text-slate-600">Plan Status</span>
                          <span className={`rounded-full px-3 py-1 text-sm font-medium ${studyPlan ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                            {planStatus}
                          </span>
                        </div>
                        <div className="flex items-center justify-between rounded-xl bg-white px-4 py-3 ring-1 ring-slate-200">
                          <span className="text-slate-600">Playlist</span>
                          <span className={`rounded-full px-3 py-1 text-sm font-medium ${studyPlan?.playlist_url ? "bg-blue-100 text-blue-700" : "bg-slate-200 text-slate-700"}`}>
                            {playlistStatus}
                          </span>
                        </div>
                        <div className="flex items-center justify-between rounded-xl bg-white px-4 py-3 ring-1 ring-slate-200">
                          <span className="text-slate-600">Completion</span>
                          <span className="rounded-full bg-indigo-100 px-3 py-1 text-sm font-medium text-indigo-700">
                            {completionPercentage}%
                          </span>
                        </div>
                        <div className="flex items-center justify-between rounded-xl bg-white px-4 py-3 ring-1 ring-slate-200">
                          <span className="text-slate-600">End Date</span>
                          <span className="font-medium text-slate-800">{studyPlan?.end_date || "Not set"}</span>
                        </div>
                        {dueCards.length > 0 && (
                          <div className="flex items-center justify-between rounded-xl bg-purple-50 px-4 py-3 ring-1 ring-purple-200">
                            <span className="text-purple-700">Reviews Due</span>
                            <span className="rounded-full bg-purple-100 px-3 py-1 text-sm font-medium text-purple-700">
                              {dueCards.length} topics
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="rounded-2xl bg-slate-50 p-5 ring-1 ring-slate-200">
                      <p className="text-sm text-slate-500">Today / Next Task</p>

                      {studyPlan && nextPendingTask ? (
                        <>
                          <h3 className="mt-2 text-lg font-semibold text-slate-900">
                            {nextPendingTask.topic || nextPendingTask.topic_name || "Next Topic"}
                          </h3>
                          <div className="mt-4 space-y-3 text-sm text-slate-700">
                            <p><span className="font-medium">Task:</span> {nextPendingTask.task || "Study topic"}</p>
                            <p><span className="font-medium">Estimated Hours:</span> {nextPendingTask.estimated_hours ?? studyPlan.hours_per_day ?? 2}</p>
                            <p><span className="font-medium">Date:</span> {nextPendingTask.date || "Planned"}</p>
                            <p><span className="font-medium">Priority:</span> {nextPendingTask.priority || "Normal"}</p>
                          </div>
                          <div className="mt-5 flex flex-wrap gap-3">
                            <Link to={`/study-plan/${selectedSyllabusId}`} className="rounded-xl bg-blue-600 px-5 py-3 font-medium text-white hover:bg-blue-700">
                              Continue Today's Task
                            </Link>
                            <Link to={`/study-plan/${selectedSyllabusId}`} className="rounded-xl bg-slate-900 px-5 py-3 font-medium text-white hover:bg-slate-800">
                              Open Full Plan
                            </Link>
                          </div>
                        </>
                      ) : studyPlan ? (
                        <>
                          <h3 className="mt-2 text-lg font-semibold text-slate-900">All tasks completed</h3>
                          <p className="mt-3 text-slate-600">Great job. You have completed all current study plan tasks.</p>
                          <div className="mt-5">
                            <button onClick={openRegenerateModal} className="rounded-xl bg-amber-500 px-5 py-3 font-medium text-white hover:bg-amber-600">
                              Regenerate Plan
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <h3 className="mt-2 text-lg font-semibold text-slate-900">No study plan yet</h3>
                          <p className="mt-3 text-slate-600">Choose playlist, end date, and daily study hours to generate your study plan.</p>
                          <div className="mt-5">
                            <button
                              onClick={openGenerateModal}
                              disabled={!selectedSyllabusId || generatingPlan}
                              className="rounded-xl bg-indigo-600 px-5 py-3 font-medium text-white hover:bg-indigo-700 disabled:bg-slate-300"
                            >
                              {generatingPlan ? "Generating..." : "Generate Study Plan"}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* ---------------------------------------------------------------- Bottom Cards */}
        <div className="mt-6 grid gap-6 md:grid-cols-3">
          <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-xl font-semibold text-slate-900">Completion Analytics</h2>
            {loadingSyllabi || loadingPlan ? (
              <p className="mt-4 text-slate-600">Loading completion details...</p>
            ) : syllabi.length === 0 ? (
              <p className="mt-4 text-slate-600">No course available yet.</p>
            ) : (
              <>
                <p className="mt-4 text-4xl font-bold text-blue-600">{completionPercentage}%</p>
                <p className="mt-2 text-slate-600">Based on completed study plan items in your selected course.</p>
                <div className="mt-5 h-3 w-full rounded-full bg-slate-200">
                  <div className="h-3 rounded-full bg-blue-600 transition-all" style={{ width: `${completionPercentage}%` }} />
                </div>
              </>
            )}
          </div>

          <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-xl font-semibold text-slate-900">Task Summary</h2>
            {loadingSyllabi || loadingPlan ? (
              <p className="mt-4 text-slate-600">Loading tasks...</p>
            ) : (
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200">
                  <span className="text-slate-600">Total Tasks</span>
                  <span className="font-semibold text-slate-900">{planItems.length}</span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200">
                  <span className="text-slate-600">Completed</span>
                  <span className="font-semibold text-green-700">{completedCount}</span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200">
                  <span className="text-slate-600">Remaining</span>
                  <span className="font-semibold text-amber-700">{remainingCount}</span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-purple-50 px-4 py-3 ring-1 ring-purple-200">
                  <span className="text-purple-700">SRS Reviews Due</span>
                  <span className="font-semibold text-purple-700">{dueCards.length}</span>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-xl font-semibold text-slate-900">Quick Actions</h2>
            {loadingSyllabi || loadingPlan ? (
              <p className="mt-4 text-slate-600">Loading actions...</p>
            ) : syllabi.length === 0 ? (
              <Link to="/syllabus/create" className="mt-4 inline-block rounded-xl bg-blue-600 px-5 py-3 font-medium text-white hover:bg-blue-700">
                Register New Course
              </Link>
            ) : !studyPlan ? (
              <button
                onClick={openGenerateModal}
                disabled={!selectedSyllabusId || generatingPlan}
                className="mt-4 rounded-xl bg-indigo-600 px-5 py-3 font-medium text-white hover:bg-indigo-700 disabled:bg-slate-300"
              >
                {generatingPlan ? "Generating..." : "Generate Study Plan"}
              </button>
            ) : (
              <div className="mt-4 flex flex-col gap-3">
                <Link to={`/study-plan/${selectedSyllabusId}`} className="rounded-xl bg-blue-600 px-5 py-3 text-center font-medium text-white hover:bg-blue-700">
                  Continue Today's Task
                </Link>
                <Link to={`/study-plan/${selectedSyllabusId}`} className="rounded-xl bg-slate-900 px-5 py-3 text-center font-medium text-white hover:bg-slate-800">
                  Open Full Plan
                </Link>
                {dueCards.length > 0 && (
                  <Link to={`/study-plan/${selectedSyllabusId}`} className="rounded-xl bg-purple-600 px-5 py-3 text-center font-medium text-white hover:bg-purple-700">
                    Review {dueCards.length} Due Topic{dueCards.length !== 1 ? "s" : ""}
                  </Link>
                )}
                <button onClick={openRegenerateModal} className="rounded-xl bg-amber-500 px-5 py-3 font-medium text-white hover:bg-amber-600">
                  Regenerate Plan
                </button>
              </div>
            )}
          </div>
        </div>
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