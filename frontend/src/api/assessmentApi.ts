import apiClient from "./apiClient";

export const generateAssessment = async (data: {
  syllabus_id: number;
  video_id: string;
  video_title: string;
}) => {
  const response = await apiClient.post("/assessment/generate-from-video", data);
  return response.data;
};

export const getAssessmentSummary = async (
  syllabusId: number | string,
  videoId: string
) => {
  const response = await apiClient.get(
    `/assessment/summary/${syllabusId}/${videoId}`
  );
  return response.data;
};

export const getAssessment = async (
  syllabusId: number | string,
  videoId: string
) => {
  const response = await apiClient.get(
    `/assessment/${syllabusId}/${videoId}`
  );
  return response.data;
};