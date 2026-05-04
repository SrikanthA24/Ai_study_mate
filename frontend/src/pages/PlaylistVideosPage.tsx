import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { getSavedPlaylists } from "../api/youtubeApi";
import { getPlaylistVideos } from "../api/youtubeApi";

export default function PlaylistVideosPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [videos, setVideos] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      if (!id) return;

      try {
        // Get all saved playlists for this syllabus
        const playlistData = await getSavedPlaylists(Number(id));
        const playlists = playlistData?.playlists || [];

        if (playlists.length === 0) {
          setError("No playlists found for this syllabus.");
          return;
        }

        // Fetch videos from all playlists and merge
        const allVideos: any[] = [];
        const seenIds = new Set<string>();

        for (const playlist of playlists) {
          try {
            const data = await getPlaylistVideos(playlist.playlist_id);
            const vids = data?.videos || [];
            for (const v of vids) {
              const vid = v.videoId || v.video_id || "";
              if (vid && !seenIds.has(vid)) {
                allVideos.push(v);
                seenIds.add(vid);
              }
            }
          } catch {
            // skip failed playlists silently
          }
        }

        setVideos(allVideos);
      } catch (err: any) {
        console.error("PLAYLIST VIDEOS ERROR:", err?.response?.data || err);
        setError(
          typeof err?.response?.data?.detail === "string"
            ? err.response.data.detail
            : "Failed to load playlist videos"
        );
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [id]);

  if (loading) {
    return <div className="p-6">Loading playlist videos...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-xl shadow p-6 mb-6">
          <h1 className="text-2xl font-bold mb-2">Playlist Videos</h1>
          <p className="text-gray-600">
            {videos.length} video{videos.length !== 1 ? "s" : ""} loaded
          </p>
        </div>

        {error && <p className="text-red-500 mb-4">{error}</p>}

        {videos.length === 0 && !error ? (
          <div className="bg-white rounded-xl shadow p-6">
            No videos found.
          </div>
        ) : (
          <div className="grid gap-4">
            {videos.map((video, index) => {
              const videoId =
                video?.videoId ||
                video?.video_id ||
                video?.id ||
                "";

              const title =
                video?.title || video?.video_title || `Video ${index + 1}`;

              const embedUrl = videoId
                ? `https://www.youtube.com/embed/${videoId}`
                : "";

              return (
                <div key={videoId || index} className="bg-white rounded-xl shadow p-5">
                  <h3 className="text-lg font-semibold mb-4">{title}</h3>

                  {videoId ? (
                    <div className="mb-4">
                      <iframe
                        width="100%"
                        height="380"
                        src={embedUrl}
                        title={title}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        className="rounded-lg"
                      />
                    </div>
                  ) : (
                    <p className="text-red-500 mb-4">Video ID not found.</p>
                  )}

                  <div className="flex gap-3 flex-wrap">
                    <button
                      onClick={() =>
                        navigate(`/assessment/${id}/${videoId}`, {
                          state: { videoTitle: title },
                        })
                      }
                      className="bg-blue-600 text-white px-4 py-2 rounded"
                      disabled={!videoId}
                    >
                      Generate Assessment
                    </button>

                    <a
                      href={
                        video?.url ||
                        `https://www.youtube.com/watch?v=${videoId}`
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="bg-gray-700 text-white px-4 py-2 rounded"
                    >
                      Open on YouTube
                    </a>

                    <Link
                      to={`/performance/${id}`}
                      className="bg-green-600 text-white px-4 py-2 rounded"
                    >
                      View Performance
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}