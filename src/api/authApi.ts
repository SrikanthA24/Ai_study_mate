import apiClient from "./apiClient";

export const registerUser = async (data: {
  email: string;
  password: string;
}) => {
  const response = await apiClient.post("/auth/register", data);
  return response.data;
};

export const loginUser = async (data: any) => {
  const response = await apiClient.post("/auth/login", data);
  return response.data;
};

export const getCurrentUser = async () => {
  const response = await apiClient.get("/auth/me");
  return response.data;
};