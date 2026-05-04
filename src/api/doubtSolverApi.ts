import apiClient from "./apiClient";

export async function askDoubt(payload: {
  syllabus_id: number;
  question: string;
  video_id?: string;
  top_k?: number;
}) {
  const res = await apiClient.post("/doubt-solver/ask", payload);
  return res.data;
}

export async function reindexDoubtSources(syllabusId: number) {
  const res = await apiClient.post(`/doubt-solver/reindex/${syllabusId}`, {});
  return res.data;
}

export async function getDoubtHistory(syllabusId: number) {
  const res = await apiClient.get(`/doubt-solver/history/${syllabusId}`);
  return res.data;
}

export async function deleteDoubtHistoryItem(historyId: number) {
  const res = await apiClient.delete(`/doubt-solver/history/${historyId}`);
  return res.data;
}