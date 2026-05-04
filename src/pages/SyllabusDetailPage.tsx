import { useEffect, useMemo, useState } from "react";
import { getSyllabusById } from "../api/syllabusApi";
import { useParams, Link } from "react-router-dom";

type Topic = {
  id?: number;
  name?: string;
  order?: number;
};

type Syllabus = {
  id?: number;
  title?: string;
  raw_text?: string;
  topics?: Topic[];
};

export default function SyllabusDetailPage() {
  const { id } = useParams();
  const [syllabus, setSyllabus] = useState<Syllabus | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSyllabus = async () => {
      try {
        setLoading(true);
        setError("");

        const data = await getSyllabusById(id!);
        setSyllabus(data);
      } catch (err: any) {
        console.error("SYLLABUS DETAIL ERROR:", err?.response?.data || err);
        setError(
          typeof err?.response?.data?.detail === "string"
            ? err.response.data.detail
            : "Failed to load syllabus"
        );
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchSyllabus();
    }
  }, [id]);

  const sortedTopics = useMemo(() => {
    if (!syllabus?.topics) return [];
    return [...syllabus.topics].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }, [syllabus]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-8 md:px-8">
        <div className="mx-auto max-w-5xl rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
          <p className="text-slate-600">Loading syllabus...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-8 md:px-8">
        <div className="mx-auto max-w-5xl rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
          <p className="text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  if (!syllabus) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-8 md:px-8">
        <div className="mx-auto max-w-5xl rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
          <p className="text-slate-600">Syllabus not found.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8 md:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="rounded-[28px] bg-white p-8 shadow-sm ring-1 ring-slate-200">
          <p className="mb-2 text-sm font-semibold tracking-wide text-blue-600">
            SYLLABUS DETAILS
          </p>

          <h1 className="text-3xl font-bold text-slate-900">
            {syllabus.title || "Untitled Syllabus"}
          </h1>

          <p className="mt-3 max-w-3xl text-slate-600">
            View the topic breakdown, original syllabus content, and continue to
            playlists, performance, and study planning.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to={`/syllabus/${id}/playlists`}
              className="rounded-xl bg-blue-600 px-5 py-3 font-medium text-white transition hover:bg-blue-700"
            >
              Search Playlists
            </Link>

            <Link
              to={`/performance/${id}`}
              className="rounded-xl bg-green-600 px-5 py-3 font-medium text-white transition hover:bg-green-700"
            >
              View Performance
            </Link>

            <Link
              to={`/study-plan/${id}`}
              className="rounded-xl bg-purple-600 px-5 py-3 font-medium text-white transition hover:bg-purple-700"
            >
              View Study Plan
            </Link>

            <Link
              to={`/study-plan-progress/${id}`}
              className="rounded-xl bg-indigo-600 px-5 py-3 font-medium text-white transition hover:bg-indigo-700"
            >
              Study Plan Progress
            </Link>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[24px] bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-semibold text-slate-900">
                  Topic Breakdown
                </h2>
                <p className="mt-1 text-slate-600">
                  {sortedTopics.length > 0
                    ? `${sortedTopics.length} topics found`
                    : "No parsed topics available"}
                </p>
              </div>
            </div>

            {sortedTopics.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5">
                <p className="text-slate-600">
                  No topic list is available for this syllabus yet.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {sortedTopics.map((topic, index) => (
                  <div
                    key={topic.id || index}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-5"
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 font-semibold text-blue-700">
                        {index + 1}
                      </div>

                      <div className="min-w-0">
                        <h3 className="text-lg font-semibold text-slate-900">
                          {topic.name || `Topic ${index + 1}`}
                        </h3>

                        {topic.order !== undefined && (
                          <p className="mt-1 text-sm text-slate-500">
                            Order: {topic.order}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="rounded-[24px] bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <h2 className="text-2xl font-semibold text-slate-900">
                Summary
              </h2>
              <div className="mt-4 grid gap-4">
                <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                  <p className="text-sm text-slate-500">Syllabus Title</p>
                  <p className="mt-2 font-semibold text-slate-900">
                    {syllabus.title || "Untitled Syllabus"}
                  </p>
                </div>

                <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                  <p className="text-sm text-slate-500">Topics Count</p>
                  <p className="mt-2 font-semibold text-slate-900">
                    {sortedTopics.length}
                  </p>
                </div>

                <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                  <p className="text-sm text-slate-500">Next Step</p>
                  <p className="mt-2 text-slate-700">
                    Search playlists, generate a study plan, and begin topic-wise
                    learning.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-[24px] bg-gradient-to-br from-blue-600 to-indigo-600 p-6 text-white shadow-sm">
              <p className="text-sm font-medium text-blue-100">Recommended Flow</p>
              <h3 className="mt-2 text-2xl font-bold">
                Build your learning path
              </h3>
              <p className="mt-3 text-blue-100">
                Start with playlists, then generate a study plan, and track your
                progress topic by topic.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-[24px] bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-2xl font-semibold text-slate-900">
            Original Syllabus Text
          </h2>
          <p className="mt-1 text-slate-600">
            This is the raw syllabus content saved in the system.
          </p>

          <div className="mt-5 rounded-2xl bg-slate-50 p-5 ring-1 ring-slate-200">
            <pre className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-700">
              {syllabus.raw_text || "No raw syllabus text available."}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}