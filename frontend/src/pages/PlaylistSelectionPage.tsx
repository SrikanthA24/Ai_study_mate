import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getSyllabusById } from "../api/syllabusApi";
import {
  searchPlaylists,
  submitPlaylistUrl,
  savePlaylist,
  removePlaylist,
  getSavedPlaylists,
} from "../api/youtubeApi";
import type { PlaylistItem, SavedPlaylist } from "../api/youtubeApi";

export default function PlaylistSelectionPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [syllabus, setSyllabus] = useState<any>(null);
  const [query, setQuery] = useState("");
  const [playlists, setPlaylists] = useState<PlaylistItem[]>([]);
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [savedPlaylists, setSavedPlaylists] = useState<SavedPlaylist[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // ---------------------------------------------------------------------------
  // Load syllabus + already saved playlists
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const loadData = async () => {
      if (!id) return;
      try {
        const [syllabusData, playlistData] = await Promise.all([
          getSyllabusById(id),
          getSavedPlaylists(Number(id)),
        ]);
        setSyllabus(syllabusData);
        setQuery(syllabusData?.syllabus?.title || syllabusData?.title || "");
        setSavedPlaylists(playlistData?.playlists || []);
      } catch (err: any) {
        setError(
          typeof err?.response?.data?.detail === "string"
            ? err.response.data.detail
            : "Failed to load syllabus"
        );
      }
    };
    loadData();
  }, [id]);

  // ---------------------------------------------------------------------------
  // Search
  // ---------------------------------------------------------------------------

  const handleSearch = async () => {
    if (!query.trim()) {
      setError("Please enter a search query");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const data = await searchPlaylists(query.trim());
      setPlaylists(data?.results || []);
    } catch (err: any) {
      setError(
        typeof err?.response?.data?.detail === "string"
          ? err.response.data.detail
          : "Failed to search playlists"
      );
      setPlaylists([]);
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Add playlist (from search result)
  // ---------------------------------------------------------------------------

  const handleAdd = async (playlist: PlaylistItem) => {
    if (!id) return;
    setError("");
    setMessage("");
    setSaving(true);

    try {
      await savePlaylist({
        syllabus_id: Number(id),
        playlist_id: playlist.playlistId,
        playlist_url: playlist.url,
      });
      // Refresh saved list
      const data = await getSavedPlaylists(Number(id));
      setSavedPlaylists(data?.playlists || []);
      setMessage(`"${playlist.title}" added successfully.`);
    } catch (err: any) {
      setError(
        typeof err?.response?.data?.detail === "string"
          ? err.response.data.detail
          : "Failed to add playlist"
      );
    } finally {
      setSaving(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Add playlist via manual URL
  // ---------------------------------------------------------------------------

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playlistUrl.trim()) {
      setError("Please paste a playlist URL");
      return;
    }
    setError("");
    setMessage("");
    setSaving(true);

    try {
      const data = await submitPlaylistUrl(playlistUrl.trim());
      const selected = data?.results?.[0];

      if (!selected?.url) {
        setError("No valid playlist URL returned");
        return;
      }

      await savePlaylist({
        syllabus_id: Number(id),
        playlist_id: selected.playlistId,
        playlist_url: selected.url,
      });

      const refreshed = await getSavedPlaylists(Number(id));
      setSavedPlaylists(refreshed?.playlists || []);
      setPlaylistUrl("");
      setMessage("Playlist added successfully.");
    } catch (err: any) {
      setError(
        typeof err?.response?.data?.detail === "string"
          ? err.response.data.detail
          : "Failed to add playlist URL"
      );
    } finally {
      setSaving(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Remove playlist
  // ---------------------------------------------------------------------------

  const handleRemove = async (playlist_id: string) => {
    if (!id) return;
    setError("");
    setMessage("");
    setRemoving(playlist_id);

    try {
      await removePlaylist(Number(id), playlist_id);
      setSavedPlaylists((prev) => prev.filter((p) => p.playlist_id !== playlist_id));
      setMessage("Playlist removed.");
    } catch (err: any) {
      setError(
        typeof err?.response?.data?.detail === "string"
          ? err.response.data.detail
          : "Failed to remove playlist"
      );
    } finally {
      setRemoving(null);
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="bg-white rounded-xl shadow p-6 mb-6">
          <h1 className="text-2xl font-bold mb-1">Select Playlists</h1>
          <p className="text-gray-600">
            {syllabus?.syllabus?.title || syllabus?.title || "Loading syllabus..."}
          </p>
          <p className="text-slate-500 text-sm mt-1">
            You can add multiple playlists. All videos will be merged into the study plan.
          </p>
        </div>

        {/* Already saved playlists */}
        {savedPlaylists.length > 0 && (
          <div className="bg-white rounded-xl shadow p-6 mb-6">
            <h2 className="text-lg font-semibold mb-3">
              Saved Playlists ({savedPlaylists.length})
            </h2>
            <div className="space-y-2">
              {savedPlaylists.map((p) => (
                <div
                  key={p.playlist_id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-green-800 truncate">
                      {p.playlist_url}
                    </p>
                    <p className="text-xs text-green-600 mt-0.5">
                      ID: {p.playlist_id}
                    </p>
                  </div>
                  <button
                    onClick={() => handleRemove(p.playlist_id)}
                    disabled={removing === p.playlist_id}
                    className="text-red-500 text-sm hover:underline flex-shrink-0 disabled:opacity-50"
                  >
                    {removing === p.playlist_id ? "Removing..." : "Remove"}
                  </button>
                </div>
              ))}
            </div>

            {savedPlaylists.length > 0 && (
              <button
                onClick={() => navigate(`/syllabus/${id}/study-plan`)}
                className="mt-4 bg-blue-600 text-white px-5 py-2 rounded hover:bg-blue-700"
              >
                Continue to Study Plan →
              </button>
            )}
          </div>
        )}

        {/* Search */}
        <div className="bg-white rounded-xl shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-3">Search & Add Playlists</h2>
          <div className="flex gap-3">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="Search playlists by topic"
              className="flex-1 border p-3 rounded"
            />
            <button
              onClick={handleSearch}
              disabled={loading}
              className="bg-blue-600 text-white px-5 py-3 rounded disabled:bg-slate-300"
            >
              {loading ? "Searching..." : "Search"}
            </button>
          </div>
        </div>

        {/* Manual URL */}
        <div className="bg-white rounded-xl shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-3">Or paste a playlist URL</h2>
          <form onSubmit={handleManualSubmit} className="flex gap-3">
            <input
              type="text"
              value={playlistUrl}
              onChange={(e) => setPlaylistUrl(e.target.value)}
              placeholder="https://www.youtube.com/playlist?list=..."
              className="flex-1 border p-3 rounded"
            />
            <button
              type="submit"
              disabled={saving}
              className="bg-green-600 text-white px-5 py-3 rounded disabled:bg-slate-300"
            >
              {saving ? "Adding..." : "Add Playlist"}
            </button>
          </form>
        </div>

        {error && <p className="text-red-500 mb-4">{error}</p>}
        {message && <p className="text-green-600 mb-4">{message}</p>}

        {/* Search results */}
        <div className="grid gap-4">
          {playlists.map((playlist, index) => {
            const isAlreadySaved = savedPlaylists.some(
              (p) => p.playlist_id === playlist.playlistId
            );

            return (
              <div
                key={playlist.playlistId || index}
                className="bg-white rounded-xl shadow p-5"
              >
                <div className="flex flex-col gap-3 md:flex-row">
                  {playlist?.thumbnail && (
                    <img
                      src={playlist.thumbnail}
                      alt={playlist.title}
                      className="w-full max-w-[160px] rounded object-cover"
                    />
                  )}
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold">
                      {playlist.title || `Playlist ${index + 1}`}
                    </h3>
                    {playlist.channel && (
                      <p className="text-gray-600 text-sm mt-1">{playlist.channel}</p>
                    )}
                    <button
                      onClick={() =>
                        isAlreadySaved
                          ? handleRemove(playlist.playlistId)
                          : handleAdd(playlist)
                      }
                      disabled={saving || removing === playlist.playlistId}
                      className={`mt-3 px-4 py-2 rounded text-sm font-medium disabled:opacity-50 ${
                        isAlreadySaved
                          ? "bg-red-100 text-red-700 hover:bg-red-200"
                          : "bg-blue-600 text-white hover:bg-blue-700"
                      }`}
                    >
                      {removing === playlist.playlistId
                        ? "Removing..."
                        : isAlreadySaved
                        ? "Remove"
                        : saving
                        ? "Adding..."
                        : "Add Playlist"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}