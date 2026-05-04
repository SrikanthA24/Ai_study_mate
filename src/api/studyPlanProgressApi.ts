import apiClient from "./apiClient";

export const saveStudyPlan = async (data: {
  syllabus_id: number;
  study_plan: any[];
}) => {
  const response = await apiClient.post("/study-plan-progress/save", data);
  return response.data;
};

export const getSavedStudyPlan = async (syllabusId: number | string) => {
  const response = await apiClient.get(`/study-plan-progress/${syllabusId}`);
  return response.data;
};

export const completePlanTask = async (planId: number | string) => {
  const response = await apiClient.post(
    `/study-plan-progress/complete/${planId}`
  );
  return response.data;
};

export const getStudyPlanProgressStats = async (
  syllabusId: number | string
) => {
  const response = await apiClient.get(
    `/study-plan-progress/progress/${syllabusId}`
  );
  return response.data;
};