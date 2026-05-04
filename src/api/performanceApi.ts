import apiClient from "./apiClient";

export const submitPerformance = async (data: {
  syllabus_id: number;
  video_id: string;
  assessment_id: number;
  selected_option: string;
  topic_name: string;
}) => {
  const response = await apiClient.post("/performance/submit", data);
  return response.data;
};

export const getWeakTopics = async (syllabusId: number | string) => {
  const response = await apiClient.get(
    `/performance/weak-topics/${syllabusId}`
  );
  return response.data;
};

export const getPerformanceReport = async (syllabusId: number | string) => {
  const response = await apiClient.get(
    `/performance/report/${syllabusId}`
  );
  return response.data;
};

export const getTopicPerformance = async (
  syllabusId: number | string,
  topicName: string
) => {
  const response = await apiClient.get(
    `/performance/topic/${syllabusId}/${encodeURIComponent(topicName)}`
  );
  return response.data;
};

export const getVideoResult = async (
  syllabusId: number | string,
  videoId: string
) => {
  const response = await apiClient.get(
    `/progress/video-result/${syllabusId}/${videoId}`
  );
  return response.data;
};