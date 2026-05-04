import apiClient from "./apiClient";

export interface PlaylistItem {
  playlistId: string;
  title: string;
  channel?: string | null;
  url: string;
  thumbnail?: string | null;
  source?: string;
}

export interface PlaylistSearchResponse {
  mode: string;
  query: string | null;
  results: PlaylistItem[];
}

export interface PlaylistVideosResponse {
  playlistId: string;
  count: number;
  videos: {
    title: string;
    videoId: string;
    position?: number | null;
    url: string;
    thumbnail?: string | null;
    channel?: string | null;
  }[];
}

export interface SavePlaylistPayload {
  syllabus_id: number;
  playlist_id: string;
  playlist_url?: string;
}

export interface SavePlaylistResponse {
  message: string;
  syllabus_id: number;
  playlist_id: string;
}

export interface SavedPlaylist {
  playlist_id: string;
  playlist_url: string;
  created_at: string;
}

export interface SavedPlaylistsResponse {
  syllabus_id: number;
  count: number;
  playlists: SavedPlaylist[];
}

// ---------------------------------------------------------------------------
// Search / discover playlists
// ---------------------------------------------------------------------------

export const searchPlaylists = async (
  query: string
): Promise<PlaylistSearchResponse> => {
  const response = await apiClient.post("/youtube/playlist-options", {
    mode: "search",
    query,
    max_results: 6,
  });
  return response.data;
};

export const submitPlaylistUrl = async (
  playlistUrl: string
): Promise<PlaylistSearchResponse> => {
  const response = await apiClient.post("/youtube/playlist-options", {
    mode: "url",
    playlist_url: playlistUrl,
  });
  return response.data;
};

export const getPlaylistVideos = async (
  playlistId: string
): Promise<PlaylistVideosResponse> => {
  const response = await apiClient.get(
    `/youtube/playlists/${playlistId}/videos`
  );
  return response.data;
};

// ---------------------------------------------------------------------------
// Multi-playlist management
// ---------------------------------------------------------------------------

export const savePlaylist = async (
  payload: SavePlaylistPayload
): Promise<SavePlaylistResponse> => {
  const response = await apiClient.post("/youtube/save-playlist", payload);
  return response.data;
};

export const removePlaylist = async (
  syllabus_id: number,
  playlist_id: string
): Promise<{ message: string; playlist_id: string }> => {
  const response = await apiClient.delete("/youtube/remove-playlist", {
    data: { syllabus_id, playlist_id },
  });
  return response.data;
};

export const getSavedPlaylists = async (
  syllabus_id: number | string
): Promise<SavedPlaylistsResponse> => {
  const response = await apiClient.get(
    `/youtube/saved-playlists/${syllabus_id}`
  );
  return response.data;
};