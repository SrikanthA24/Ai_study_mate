import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createSyllabus, parsePdf } from "../api/syllabusApi";
import { searchPlaylists, submitPlaylistUrl, savePlaylist } from "../api/youtubeApi";
import type { PlaylistItem, SavedPlaylist } from "../api/youtubeApi";

type InputTab = "manual" | "pdf";

export default function CreateSyllabusPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- input tab ---
  const [inputTab, setInputTab] = useState<InputTab>("manual");

  // --- manual form ---
  const [form, setForm] = useState({ title: "", raw_text: "" });

  // --- pdf state ---
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfParsing, setPdfParsing] = useState(false);
  const [pdfParsed, setPdfParsed] = useState(false);
  const [pdfTitle, setPdfTitle] = useState("");

  // --- playlist mode ---
  const [playlistMode, setPlaylistMode] = useState<"search" | "url">("search");
  const [playlistQuery, setPlaylistQuery] = useState("");
  const [playlistResults, setPlaylistResults] = useState<PlaylistItem[]>([]);
  const [playlistUrlInput, setPlaylistUrlInput] = useState("");
  const [searchingPlaylists, setSearchingPlaylists] = useState(false);

  // --- selected playlists (multiple) ---
  const [selectedPlaylists, setSelectedPlaylists] = useState<SavedPlaylist[]>([]);

  // --- status ---
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const getTitle = () =>
    inputTab === "pdf" ? pdfTitle.trim() : form.title.trim();

  const getRawText = () =>
    inputTab === "pdf" ? form.raw_text : form.raw_text;

  // ---------------------------------------------------------------------------
  // PDF
  // ---------------------------------------------------------------------------

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError("Only PDF files are supported.");
      return;
    }

    setPdfFile(file);
    setPdfParsed(false);
    setError("");

    // Auto-fill title from filename (remove .pdf extension)
    if (!pdfTitle) {
      setPdfTitle(file.name.replace(/\.pdf$/i, "").replace(/[-_]/g, " "));
    }

    // Auto-parse immediately
    setPdfParsing(true);
    try {
      const result = await parsePdf(file);
      setForm((prev) => ({ ...prev, raw_text: result.raw_text }));
      setPdfParsed(true);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setError(
        typeof detail === "string" ? detail : "Failed to parse PDF. Try a text-based PDF."
      );
      setPdfFile(null);
    } finally {
      setPdfParsing(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Playlist search / URL
  // ---------------------------------------------------------------------------

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
      const detail = err?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "Failed to search playlists.");
      setPlaylistResults([]);
    } finally {
      setSearchingPlaylists(false);
    }
  };

  const handleUsePlaylistUrl = async () => {
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
      addPlaylistToSelected({
        playlist_id: first.playlistId,
        playlist_url: first.url,
        created_at: new Date().toISOString(),
      });
      setPlaylistUrlInput("");
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "Failed to use playlist URL.");
    } finally {
      setSearchingPlaylists(false);
    }
  };

  const addPlaylistToSelected = (playlist: SavedPlaylist) => {
    setSelectedPlaylists((prev) => {
      const alreadyAdded = prev.some((p) => p.playlist_id === playlist.playlist_id);
      if (alreadyAdded) return prev;
      return [...prev, playlist];
    });
  };

  const removePlaylistFromSelected = (playlist_id: string) => {
    setSelectedPlaylists((prev) => prev.filter((p) => p.playlist_id !== playlist_id));
  };

  const handleSelectFromSearch = (playlist: PlaylistItem) => {
    addPlaylistToSelected({
      playlist_id: playlist.playlistId,
      playlist_url: playlist.url,
      created_at: new Date().toISOString(),
    });
  };

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const title = getTitle();
    const rawText = getRawText();

    if (!title) {
      setError("Please enter a syllabus title.");
      return;
    }
    if (!rawText.trim()) {
      setError(
        inputTab === "pdf"
          ? "Please upload a PDF first."
          : "Please paste syllabus text."
      );
      return;
    }
    if (selectedPlaylists.length === 0) {
      setError("Please select at least one playlist before creating the syllabus.");
      return;
    }

    setLoading(true);

    try {
      // 1. Create syllabus from text
      const data = await createSyllabus({ title, raw_text: rawText });
      const syllabusId = data?.id || data?.syllabus_id;

      if (!syllabusId) {
        throw new Error("Syllabus created but syllabus ID was not returned.");
      }

      // 2. Save all selected playlists
      for (const playlist of selectedPlaylists) {
        await savePlaylist({
          syllabus_id: syllabusId,
          playlist_id: playlist.playlist_id,
          playlist_url: playlist.playlist_url,
        });
      }

      navigate(`/syllabus/${syllabusId}`);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setError(
        typeof detail === "string"
          ? detail
          : err?.message || "Failed to create syllabus."
      );
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-4xl mx-auto bg-white p-6 rounded-xl shadow">
        <h1 className="text-2xl font-bold mb-2">Create Syllabus</h1>
        <p className="text-slate-600 mb-6">
          Add your syllabus and select one or more playlists before creating the course.
        </p>

        <form onSubmit={handleSubmit}>
          {/* ----------------------------------------------------------------
              Input tab toggle
          ---------------------------------------------------------------- */}
          <div className="flex gap-2 mb-5">
            <button
              type="button"
              onClick={() => { setInputTab("manual"); setError(""); }}
              className={`px-5 py-2 rounded font-medium ${
                inputTab === "manual"
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              Manual Text
            </button>
            <button
              type="button"
              onClick={() => { setInputTab("pdf"); setError(""); }}
              className={`px-5 py-2 rounded font-medium ${
                inputTab === "pdf"
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              Upload PDF
            </button>
          </div>

          {/* ----------------------------------------------------------------
              Manual input
          ---------------------------------------------------------------- */}
          {inputTab === "manual" && (
            <>
              <input
                name="title"
                type="text"
                placeholder="Enter syllabus title"
                className="w-full border p-3 rounded mb-4"
                value={form.title}
                onChange={handleChange}
              />
              <textarea
                name="raw_text"
                placeholder="Paste full syllabus text here"
                rows={12}
                className="w-full border p-3 rounded mb-6"
                value={form.raw_text}
                onChange={handleChange}
              />
            </>
          )}

          {/* ----------------------------------------------------------------
              PDF upload
          ---------------------------------------------------------------- */}
          {inputTab === "pdf" && (
            <div className="mb-6">
              <input
                name="pdf_title"
                type="text"
                placeholder="Enter syllabus title"
                className="w-full border p-3 rounded mb-4"
                value={pdfTitle}
                onChange={(e) => setPdfTitle(e.target.value)}
              />

              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
              >
                {pdfParsing ? (
                  <p className="text-blue-600 font-medium">Parsing PDF...</p>
                ) : pdfParsed && pdfFile ? (
                  <div>
                    <p className="text-green-600 font-medium">
                      ✓ {pdfFile.name} parsed successfully
                    </p>
                    <p className="text-slate-500 text-sm mt-1">
                      Click to replace with a different PDF
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="text-slate-600 font-medium">
                      Click to upload a PDF syllabus
                    </p>
                    <p className="text-slate-400 text-sm mt-1">
                      Text-based PDFs only · Max 20MB
                    </p>
                  </div>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={handleFileChange}
              />

              {pdfParsed && form.raw_text && (
                <div className="mt-4">
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Extracted text (review and edit if needed)
                  </label>
                  <textarea
                    name="raw_text"
                    rows={10}
                    className="w-full border p-3 rounded text-sm"
                    value={form.raw_text}
                    onChange={handleChange}
                  />
                </div>
              )}
            </div>
          )}

          {/* ----------------------------------------------------------------
              Playlist selection
          ---------------------------------------------------------------- */}
          <div className="rounded-xl border p-5 mb-6">
            <h2 className="text-xl font-semibold mb-1">Select Playlists</h2>
            <p className="text-slate-500 text-sm mb-4">
              You can add multiple playlists. Videos from all playlists will be merged into the study plan.
            </p>

            {/* Selected playlists list */}
            {selectedPlaylists.length > 0 && (
              <div className="mb-4 space-y-2">
                <p className="text-sm font-medium text-slate-700">
                  Added playlists ({selectedPlaylists.length}):
                </p>
                {selectedPlaylists.map((p) => (
                  <div
                    key={p.playlist_id}
                    className="flex items-center justify-between gap-3 rounded-lg bg-green-50 border border-green-200 px-4 py-2"
                  >
                    <p className="text-sm text-green-800 truncate">
                      {p.playlist_url}
                    </p>
                    <button
                      type="button"
                      onClick={() => removePlaylistFromSelected(p.playlist_id)}
                      className="text-red-500 text-sm hover:underline flex-shrink-0"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Mode toggle */}
            <div className="flex flex-wrap gap-4 mb-4">
              <label className="flex items-center gap-2 text-slate-700">
                <input
                  type="radio"
                  checked={playlistMode === "search"}
                  onChange={() => setPlaylistMode("search")}
                />
                Search playlist
              </label>
              <label className="flex items-center gap-2 text-slate-700">
                <input
                  type="radio"
                  checked={playlistMode === "url"}
                  onChange={() => setPlaylistMode("url")}
                />
                Paste playlist URL
              </label>
            </div>

            {/* Search mode */}
            {playlistMode === "search" && (
              <div>
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={playlistQuery}
                    onChange={(e) => setPlaylistQuery(e.target.value)}
                    placeholder="Search YouTube playlists"
                    className="flex-1 border p-3 rounded"
                  />
                  <button
                    type="button"
                    onClick={handleSearchPlaylists}
                    disabled={searchingPlaylists}
                    className="bg-blue-600 text-white px-5 py-3 rounded disabled:bg-slate-300"
                  >
                    {searchingPlaylists ? "Searching..." : "Search"}
                  </button>
                </div>

                {playlistResults.length > 0 && (
                  <div className="mt-4 max-h-80 space-y-3 overflow-y-auto">
                    {playlistResults.map((playlist, index) => {
                      const isAdded = selectedPlaylists.some(
                        (p) => p.playlist_id === playlist.playlistId
                      );
                      return (
                        <div
                          key={playlist.playlistId || index}
                          className={`rounded-xl border p-4 ${
                            isAdded
                              ? "border-green-400 bg-green-50"
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
                              <h3 className="font-semibold text-slate-900">
                                {playlist.title}
                              </h3>
                              {playlist.channel && (
                                <p className="mt-1 text-sm text-slate-600">
                                  {playlist.channel}
                                </p>
                              )}
                              <button
                                type="button"
                                onClick={() =>
                                  isAdded
                                    ? removePlaylistFromSelected(playlist.playlistId)
                                    : handleSelectFromSearch(playlist)
                                }
                                className={`mt-3 rounded px-4 py-2 font-medium text-sm ${
                                  isAdded
                                    ? "bg-red-100 text-red-700 hover:bg-red-200"
                                    : "bg-slate-200 text-slate-800 hover:bg-slate-300"
                                }`}
                              >
                                {isAdded ? "Remove" : "Add Playlist"}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* URL mode */}
            {playlistMode === "url" && (
              <div>
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={playlistUrlInput}
                    onChange={(e) => setPlaylistUrlInput(e.target.value)}
                    placeholder="https://www.youtube.com/playlist?list=..."
                    className="flex-1 border p-3 rounded"
                  />
                  <button
                    type="button"
                    onClick={handleUsePlaylistUrl}
                    disabled={searchingPlaylists}
                    className="bg-green-600 text-white px-5 py-3 rounded disabled:bg-slate-300"
                  >
                    {searchingPlaylists ? "Adding..." : "Add Playlist"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {error && (
            <p className="text-red-500 mb-3 break-words">{error}</p>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={loading || pdfParsing}
              className="bg-blue-600 text-white px-6 py-3 rounded disabled:bg-slate-300"
            >
              {loading ? "Creating..." : "Create Syllabus"}
            </button>
            <button
              type="button"
              onClick={() => navigate("/dashboard")}
              className="bg-slate-200 text-slate-800 px-6 py-3 rounded hover:bg-slate-300"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}