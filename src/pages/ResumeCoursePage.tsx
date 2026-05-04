import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getStudyPlan } from "../api/studyPlanApi";

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
};

type StudyPlanResponse = {
  study_plan_id?: number;
  syllabus_id?: number;
  title?: string;
  summary?: string;
  end_date?: string;
  hours_per_day?: number;
  plan?: StudyPlanItem[];
};

export default function ResumeCoursePage() {
  const { syllabusId } = useParams();
  const navigate = useNavigate();

  const [studyPlan, setStudyPlan] = useState<StudyPlanResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadStudyPlan = async () => {
      if (!syllabusId) {
        setError("Invalid course.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError("");

        const data = await getStudyPlan(syllabusId);
        setStudyPlan(data);
      } catch (err: any) {
        console.error("Failed to load study plan:", err);

        if (err?.response?.status === 404) {
          setError("No study plan found for this course.");
        } else if (err?.response?.data?.detail) {
          setError(err.response.data.detail);
        } else {
          setError("Failed to load course details.");
        }
      } finally {
        setLoading(false);
      }
    };

    loadStudyPlan();
  }, [syllabusId]);

  const planItems = studyPlan?.plan || [];

  const completedItems = useMemo(
    () => planItems.filter((item) => item.is_completed),
    [planItems]
  );

  const pendingItems = useMemo(
    () => planItems.filter((item) => !item.is_completed),
    [planItems]
  );

  const completionPercentage = useMemo(() => {
    if (planItems.length === 0) return 0;
    return Math.round((completedItems.length / planItems.length) * 100);
  }, [planItems, completedItems]);

  const nextPendingItem = pendingItems[0];

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-8 md:px-8">
        <div className="mb-8 flex flex-col gap-4 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="mb-2 text-sm font-semibold tracking-wide text-blue-600">
              AI STUDY MATE
            </p>
            <h1 className="text-3xl font-bold text-slate-900">
              Resume Ongoing Course
            </h1>
            <p className="mt-2 text-slate-600">
              Continue your course from where you stopped.
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => navigate("/dashboard")}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 font-medium text-slate-700 hover:bg-slate-50"
            >
              Back to Dashboard
            </button>

            {syllabusId && (
              <Link
                to={`/study-plan/${syllabusId}`}
                className="rounded-xl bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
              >
                Open Full Study Plan
              </Link>
            )}
          </div>
        </div>

        {loading && (
          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <p className="text-slate-600">Loading course details...</p>
          </div>
        )}

        {!loading && error && (
          <div className="rounded-2xl bg-red-50 p-6 text-red-700 ring-1 ring-red-200">
            {error}
          </div>
        )}

        {!loading && !error && studyPlan && (
          <div className="space-y-6">
            <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <h2 className="text-2xl font-semibold text-slate-900">
                {studyPlan.title || "Ongoing Course"}
              </h2>

              {studyPlan.summary && (
                <p className="mt-2 text-slate-600">{studyPlan.summary}</p>
              )}

              <div className="mt-6 grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                  <p className="text-sm text-slate-500">Completion</p>
                  <p className="mt-2 text-2xl font-bold text-slate-900">
                    {completionPercentage}%
                  </p>
                </div>

                <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                  <p className="text-sm text-slate-500">Completed Tasks</p>
                  <p className="mt-2 text-2xl font-bold text-slate-900">
                    {completedItems.length}
                  </p>
                </div>

                <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                  <p className="text-sm text-slate-500">Pending Tasks</p>
                  <p className="mt-2 text-2xl font-bold text-slate-900">
                    {pendingItems.length}
                  </p>
                </div>
              </div>

              <div className="mt-6">
                <div className="mb-2 flex items-center justify-between text-sm text-slate-500">
                  <span>Overall Progress</span>
                  <span>{completionPercentage}%</span>
                </div>
                <div className="h-3 w-full rounded-full bg-slate-200">
                  <div
                    className="h-3 rounded-full bg-blue-600"
                    style={{ width: `${completionPercentage}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
                <h2 className="text-xl font-semibold text-slate-900">
                  Completed Until Now
                </h2>

                {completedItems.length === 0 ? (
                  <p className="mt-4 text-slate-600">
                    No tasks completed yet.
                  </p>
                ) : (
                  <div className="mt-4 space-y-3">
                    {completedItems.slice(0, 5).map((item, index) => (
                      <div
                        key={item.id || index}
                        className="rounded-2xl bg-green-50 p-4 ring-1 ring-green-200"
                      >
                        <p className="font-medium text-slate-900">
                          {item.topic || item.topic_name || "Untitled Topic"}
                        </p>
                        {item.task && (
                          <p className="mt-1 text-sm text-slate-600">
                            {item.task}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
                <h2 className="text-xl font-semibold text-slate-900">
                  Continue With Next Topic
                </h2>

                {!nextPendingItem ? (
                  <p className="mt-4 text-slate-600">
                    All tasks are completed for this course.
                  </p>
                ) : (
                  <div className="mt-4 rounded-2xl bg-blue-50 p-5 ring-1 ring-blue-200">
                    <p className="text-sm text-blue-700">Next Task</p>
                    <h3 className="mt-2 text-lg font-semibold text-slate-900">
                      {nextPendingItem.topic ||
                        nextPendingItem.topic_name ||
                        "Untitled Topic"}
                    </h3>

                    {nextPendingItem.task && (
                      <p className="mt-2 text-slate-600">
                        {nextPendingItem.task}
                      </p>
                    )}

                    <div className="mt-4 flex flex-wrap gap-3">
                      {nextPendingItem.date && (
                        <span className="rounded-full bg-white px-3 py-1 text-sm font-medium text-slate-700 ring-1 ring-slate-200">
                          {nextPendingItem.date}
                        </span>
                      )}

                      {nextPendingItem.estimated_hours !== undefined && (
                        <span className="rounded-full bg-white px-3 py-1 text-sm font-medium text-slate-700 ring-1 ring-slate-200">
                          {nextPendingItem.estimated_hours} hrs
                        </span>
                      )}
                    </div>

                    <div className="mt-5">
                      <Link
                        to={`/study-plan/${syllabusId}`}
                        className="inline-block rounded-xl bg-slate-900 px-5 py-3 font-medium text-white hover:bg-slate-800"
                      >
                        Continue Course
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <h2 className="text-xl font-semibold text-slate-900">
                Weak Areas and Suggestions
              </h2>
              <p className="mt-3 text-slate-600">
                Weak areas and smart suggestions can be connected next using your
                performance and recommendation modules.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}