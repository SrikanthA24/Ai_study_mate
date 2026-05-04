import api from "./axios";

export type GenerateStudyPlanPayload = {
  end_date: string;
  hours_per_day: number;
  force_regenerate?: boolean;
};

export type AdaptedPlanChange = {
  topic: string;
  mastery_percentage: number;
  mastery_level: string;
  action: string;
};

export type AdaptStudyPlanResponse = {
  message: string;
  added_items: number;
  changes: AdaptedPlanChange[];
  study_plan_id: number;
  syllabus_id: number;
  title: string;
  summary: string;
  end_date: string;
  hours_per_day: number;
  playlist_id?: string | null;
  playlist_url?: string | null;
  plan: Array<{
    id: number;
    day: number;
    date: string;
    topic: string;
    task: string;
    priority: string;
    estimated_hours: number;
    is_completed: boolean;
    video_id?: string | null;
    video_title?: string | null;
    video_url?: string | null;
  }>;
};

export async function generateStudyPlan(
  syllabusId: number | string,
  payload: GenerateStudyPlanPayload
) {
  const response = await api.post(`/study-plan/generate/${syllabusId}`, payload);
  return response.data;
}

export async function getStudyPlan(syllabusId: number | string) {
  const response = await api.get(`/study-plan/${syllabusId}`);
  return response.data;
}

export async function getCourseFlow(syllabusId: number | string) {
  const response = await api.get(`/study-plan/course-flow/${syllabusId}`);
  return response.data;
}

export async function adaptStudyPlan(
  syllabusId: number | string
): Promise<AdaptStudyPlanResponse> {
  const response = await api.post(`/study-plan/adapt/${syllabusId}`);
  return response.data;
}