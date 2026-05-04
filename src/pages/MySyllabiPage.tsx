import { useEffect, useState } from "react";
import { getMySyllabi } from "../api/syllabusApi";
import { Link } from "react-router-dom";

export default function MySyllabiPage() {
  const [syllabi, setSyllabi] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchSyllabi = async () => {
      try {
        const data = await getMySyllabi();
        setSyllabi(Array.isArray(data) ? data : data?.items || []);
      } catch (err: any) {
        setError(
          typeof err?.response?.data?.detail === "string"
            ? err.response.data.detail
            : "Failed to load syllabi"
        );
      } finally {
        setLoading(false);
      }
    };

    fetchSyllabi();
  }, []);

  if (loading) {
    return <div className="p-6">Loading syllabi...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">My Syllabi</h1>

        {error && <p className="text-red-500 mb-4">{error}</p>}

        {syllabi.length === 0 ? (
          <div className="bg-white p-6 rounded-xl shadow">
            No syllabi found.
          </div>
        ) : (
          <div className="grid gap-4">
            {syllabi.map((item) => (
              <Link
                key={item.id}
                to={`/syllabus/${item.id}`}
                className="bg-white p-4 rounded-xl shadow hover:shadow-lg"
              >
                <h2 className="text-xl font-semibold">
                  {item.title || "Untitled Syllabus"}
                </h2>
                <p className="text-gray-600">
                  ID: {item.id}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}