import apiClient from "./apiClient";

export const getTopicRecommendation = async (
  syllabusId: number | string,
  topicName: string
) => {
  const response = await apiClient.get(
    `/recommendation/topic/${syllabusId}/${encodeURIComponent(topicName)}`
  );
  return response.data;
};

export const getWeakTopicRecommendations = async (
  syllabusId: number | string
) => {
  const response = await apiClient.get(
    `/recommendation/weak-topics/${syllabusId}`
  );
  return response.data;
};