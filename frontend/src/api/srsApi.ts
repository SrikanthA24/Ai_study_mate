import apiClient from "./apiClient";

export interface SRSReviewPayload {
  syllabus_id: number;
  topic_name: string;
  quality: number; // 0-5
}

export interface SRSReviewResult {
  topic_name: string;
  next_review: string;
  interval_days: number;
  ef: number;
  total_reviews: number;
}

export interface SRSCard {
  id: number;
  topic_name: string;
  srs_next_review: string;
  srs_interval: number;
  srs_ef: number;
  srs_n: number;
  total_reviews: number;
  total_correct: number;
}

export const submitSRSReview = async (
  payload: SRSReviewPayload
): Promise<SRSReviewResult> => {
  const response = await apiClient.post("/srs/review", payload);
  return response.data;
};

export const getDueSRSCards = async (
  syllabus_id: number
): Promise<SRSCard[]> => {
  const response = await apiClient.get(`/srs/due?syllabus_id=${syllabus_id}`);
  return response.data;
};

export const getAllSRSCards = async (
  syllabus_id: number
): Promise<SRSCard[]> => {
  const response = await apiClient.get(`/srs/cards?syllabus_id=${syllabus_id}`);
  return response.data;
};