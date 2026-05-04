import apiClient from "./apiClient";

export const createSyllabus = async (data: {
  title: string;
  raw_text: string;
}) => {
  const response = await apiClient.post("/syllabus/create", data);
  return response.data;
};

export const getMySyllabi = async () => {
  const response = await apiClient.get("/syllabus/mine");
  return response.data;
};

export const getSyllabusById = async (id: number | string) => {
  const response = await apiClient.get(`/syllabus/${id}`);
  return response.data;
};

export const selectPlaylist = async (
  syllabusId: number | string,
  playlistUrl: string
) => {
  const response = await apiClient.post(
    `/syllabus/${syllabusId}/select-playlist`,
    { playlist_url: playlistUrl }
  );
  return response.data;
};

export const getPlaylist = async (id: number | string) => {
  const response = await apiClient.get(`/syllabus/${id}/playlist`);
  return response.data;
};

export const getPlaylistVideos = async (
  id: number | string,
  maxResults = 50
) => {
  const response = await apiClient.get(
    `/syllabus/${id}/playlist/videos?max_results=${maxResults}`
  );
  return response.data;
};

// ---------------------------------------------------------------------------
// PDF parsing
// ---------------------------------------------------------------------------

export interface ParsedPdfResult {
  raw_text: string;
  topics_count: number;
  topics_preview: string[];
  topics: string[];
  raw_text_preview: string;
}

/**
 * Parse a PDF and return extracted text + topics WITHOUT saving to DB.
 * Use this to show the user a preview before creating the syllabus.
 */
export const parsePdf = async (file: File): Promise<ParsedPdfResult> => {
  const formData = new FormData();
  formData.append("file", file);

  const response = await apiClient.post("/syllabus/parse-pdf", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
};

/**
 * Upload a PDF and directly create a syllabus from it (no preview step).
 */
export const createSyllabusFromPdf = async (
  title: string,
  file: File
) => {
  const formData = new FormData();
  formData.append("title", title);
  formData.append("file", file);

  const response = await apiClient.post(
    "/syllabus/create-from-pdf",
    formData,
    { headers: { "Content-Type": "multipart/form-data" } }
  );
  return response.data;
};