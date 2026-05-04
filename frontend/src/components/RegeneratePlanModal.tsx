import { useEffect, useState } from "react";
import { selectPlaylist } from "../api/syllabusApi";
import { searchPlaylists, submitPlaylistUrl } from "../api/youtubeApi";
import type { PlaylistItem } from "../api/youtubeApi";
import { getDefaultEndDate } from "../utils/date";

type Props = {
  open: boolean;
  syllabusId: number | "";
  generatingPlan: boolean;
  onClose: () => void;
  onConfirm: (data: { end_date: string; hours_per_day: number }) => Promise<void>;
};

export default function RegeneratePlanModal({
  open,
  syllabusId,
  generatingPlan,
  onClose,
  onConfirm,
}: Props) {
  const [playlistChoice, setPlaylistChoice] = useState<"same" | "different">("same");
  const [differentPlaylistMode, setDifferentPlaylistMode] = useState<"search" | "url">("search");
  const [playlistQuery, setPlaylistQuery] = useState("");
  const [playlistResults, setPlaylistResults] = useState<PlaylistItem[]>([]);
  const [playlistUrlInput, setPlaylistUrlInput] = useState("");
  const [newPlaylistUrl, setNewPlaylistUrl] = useState("");
  const [endDate, setEndDate] = useState(getDefaultEndDate());
  const [hoursPerDay, setHoursPerDay] = useState(2);
  const [searchingPlaylists, setSearchingPlaylists] = useState(false);
  const [savingPlaylist, setSavingPlaylist] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;

    setPlaylistChoice("same");
    setDifferentPlaylistMode("search");
    setPlaylistQuery("");
    setPlaylistResults([]);
    setPlaylistUrlInput("");
    setNewPlaylistUrl("");
    setEndDate(getDefaultEndDate());
    setHoursPerDay(2);
    setError("");
  }, [open]);

  if (!open) return null;

  const handleSearchPlaylists = async () => {
    if (!playlistQuery.trim()) {
      setError("Please enter a playlist search query.");
      return;
    }

    try {
      setSearchingPlaylists(true);
      setError("");
      const data = await searchPlaylists(playlistQuery.trim());
      setPlaylistResults(data?.results || []);
    } catch (err: any) {
      console.error("Failed to search playlists:", err);
      setError(
        typeof err?.response?.data?.detail === "string"
          ? err.response.data.detail
          : "Failed to search playlists."
      );
      setPlaylistResults([]);
    } finally {
      setSearchingPlaylists(false);
    }
  };

  const handleValidatePlaylistUrl = async () => {
    if (!playlistUrlInput.trim()) {
      setError("Please paste a playlist URL.");
      return;
    }

    try {
      setSearchingPlaylists(true);
      setError("");
      const data = await submitPlaylistUrl(playlistUrlInput.trim());
      const first = data?.results?.[0];

      if (!first?.url) {
        setError("No valid playlist found from the given URL.");
        return;
      }

      setNewPlaylistUrl(first.url);
    } catch (err: any) {
      console.error("Failed to validate playlist URL:", err);
      setError(
        typeof err?.response?.data?.detail === "string"
          ? err.response.data.detail
          : "Failed to use playlist URL."
      );
    } finally {
      setSearchingPlaylists(false);
    }
  };

  const handleConfirm = async () => {
    if (!syllabusId) return;

    if (!endDate) {
      setError("Please select an end date.");
      return;
    }

    if (!hoursPerDay || hoursPerDay <= 0 || hoursPerDay > 16) {
      setError("Hours per day must be between 1 and 16.");
      return;
    }

    try {
      setSavingPlaylist(true);
      setError("");

      if (playlistChoice === "different") {
        if (!newPlaylistUrl) {
          setError("Please choose a new playlist first.");
          return;
        }

        await selectPlaylist(syllabusId, newPlaylistUrl);
      }

      await onConfirm({
        end_date: endDate,
        hours_per_day: hoursPerDay,
      });
    } catch (err: any) {
      console.error("Failed to confirm regenerate:", err);
      setError(
        typeof err?.response?.data?.detail === "string"
          ? err.response.data.detail
          : "Failed to regenerate study plan."
      );
    } finally {
      setSavingPlaylist(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-3xl rounded-3xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Regenerate Study Plan</h2>
            <p className="mt-2 text-slate-600">
              This will create a fresh study plan for the selected course.
            </p>
            <p className="mt-1 text-sm text-amber-700">
              Make sure your backend logic preserves completed progress if needed.
            </p>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-slate-500 hover:bg-slate-100"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-red-700">
            {error}
          </div>
        )}

        <div className="mt-6">
          <p className="mb-3 text-sm font-medium text-slate-700">Playlist choice</p>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-slate-700">
              <input
                type="radio"
                checked={playlistChoice === "same"}
                onChange={() => setPlaylistChoice("same")}
              />
              Same playlist
            </label>

            <label className="flex items-center gap-2 text-slate-700">
              <input
                type="radio"
                checked={playlistChoice === "different"}
                onChange={() => setPlaylistChoice("different")}
              />
              Different playlist
            </label>
          </div>
        </div>

        {playlistChoice === "different" && (
          <div className="mt-6 rounded-2xl border border-slate-200 p-4">
            <p className="mb-3 text-sm font-medium text-slate-700">Choose new playlist using</p>

            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-slate-700">
                <input
                  type="radio"
                  checked={differentPlaylistMode === "search"}
                  onChange={() => {
                    setDifferentPlaylistMode("search");
                    setNewPlaylistUrl("");
                  }}
                />
                Search
              </label>

              <label className="flex items-center gap-2 text-slate-700">
                <input
                  type="radio"
                  checked={differentPlaylistMode === "url"}
                  onChange={() => {
                    setDifferentPlaylistMode("url");
                    setNewPlaylistUrl("");
                  }}
                />
                Paste URL
              </label>
            </div>

            {differentPlaylistMode === "search" && (
              <div className="mt-4">
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={playlistQuery}
                    onChange={(e) => setPlaylistQuery(e.target.value)}
                    placeholder="Search playlists"
                    className="flex-1 rounded-xl border border-slate-300 px-4 py-3"
                  />
                  <button
                    onClick={handleSearchPlaylists}
                    disabled={searchingPlaylists}
                    className="rounded-xl bg-blue-600 px-5 py-3 font-medium text-white hover:bg-blue-700 disabled:bg-slate-300"
                  >
                    {searchingPlaylists ? "Searching..." : "Search"}
                  </button>
                </div>

                {playlistResults.length > 0 && (
                  <div className="mt-4 max-h-72 space-y-3 overflow-y-auto">
                    {playlistResults.map((playlist, index) => (
                      <div
                        key={playlist.playlistId || index}
                        className={`rounded-2xl border p-4 ${
                          newPlaylistUrl === playlist.url
                            ? "border-blue-600 bg-blue-50"
                            : "border-slate-200"
                        }`}
                      >
                        <div className="flex flex-col gap-3 md:flex-row">
                          {playlist.thumbnail && (
                            <img
                              src={playlist.thumbnail}
                              alt={playlist.title}
                              className="h-24 w-40 rounded-lg object-cover"
                            />
                          )}

                          <div className="flex-1">
                            <h3 className="font-semibold text-slate-900">{playlist.title}</h3>
                            {playlist.channel && (
                              <p className="mt-1 text-sm text-slate-600">{playlist.channel}</p>
                            )}

                            <button
                              onClick={() => setNewPlaylistUrl(playlist.url)}
                              className={`mt-3 rounded-xl px-4 py-2 font-medium ${
                                newPlaylistUrl === playlist.url
                                  ? "bg-blue-600 text-white"
                                  : "bg-slate-200 text-slate-800 hover:bg-slate-300"
                              }`}
                            >
                              {newPlaylistUrl === playlist.url ? "Selected" : "Select This Playlist"}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {differentPlaylistMode === "url" && (
              <div className="mt-4">
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={playlistUrlInput}
                    onChange={(e) => setPlaylistUrlInput(e.target.value)}
                    placeholder="https://www.youtube.com/playlist?list=..."
                    className="flex-1 rounded-xl border border-slate-300 px-4 py-3"
                  />
                  <button
                    onClick={handleValidatePlaylistUrl}
                    disabled={searchingPlaylists}
                    className="rounded-xl bg-green-600 px-5 py-3 font-medium text-white hover:bg-green-700 disabled:bg-slate-300"
                  >
                    {searchingPlaylists ? "Checking..." : "Use URL"}
                  </button>
                </div>

                {newPlaylistUrl && (
                  <p className="mt-3 rounded-xl bg-green-50 px-4 py-3 text-green-700">
                    New playlist selected successfully.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        <div className="mt-6 rounded-2xl border border-slate-200 p-4">
          <p className="mb-4 text-sm font-medium text-slate-700">Study timing</p>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">End date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-3"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Hours per day
              </label>
              <input
                type="number"
                min="1"
                max="16"
                step="0.5"
                value={hoursPerDay}
                onChange={(e) => setHoursPerDay(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-300 px-4 py-3"
              />
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            onClick={handleConfirm}
            disabled={generatingPlan || savingPlaylist}
            className="rounded-xl bg-amber-500 px-5 py-3 font-medium text-white hover:bg-amber-600 disabled:bg-slate-300"
          >
            {generatingPlan || savingPlaylist ? "Processing..." : "Confirm Regenerate"}
          </button>

          <button
            onClick={onClose}
            className="rounded-xl bg-slate-200 px-5 py-3 font-medium text-slate-800 hover:bg-slate-300"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}