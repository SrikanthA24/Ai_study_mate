import { useState } from "react";
import { loginUser } from "../api/authApi";
import { setToken } from "../utils/storage";
import { useNavigate, Link } from "react-router-dom";

export default function LoginPage() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    email: "",
    password: "",
  });

  const [error, setError] = useState("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      const data = await loginUser(form);
      const token = data.access_token || data.token;

      if (token) {
        setToken(token);
        navigate("/home"); // ← changed from /dashboard
      } else {
        setError("Token not received from backend");
      }
    } catch (err: any) {
      console.error("LOGIN ERROR:", err?.response?.data || err);
      setError(
        typeof err?.response?.data?.detail === "string"
          ? err.response.data.detail
          : JSON.stringify(err?.response?.data || "Login failed")
      );
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <form
        onSubmit={handleSubmit}
        className="bg-white p-8 rounded-xl shadow-md w-full max-w-md"
      >
        <h1 className="text-2xl font-bold mb-6 text-center">
          AI Study Mate Login
        </h1>

        <input
          name="email"
          type="email"
          placeholder="Email"
          className="w-full border p-3 rounded mb-4"
          onChange={handleChange}
        />

        <input
          name="password"
          type="password"
          placeholder="Password"
          className="w-full border p-3 rounded mb-4"
          onChange={handleChange}
        />

        {error && <p className="text-red-500 mb-3 break-words">{error}</p>}

        <button
          type="submit"
          className="w-full bg-blue-600 text-white p-3 rounded hover:bg-blue-700 cursor-pointer"
        >
          Login
        </button>

        <p className="mt-4 text-center">
          Don't have an account?{" "}
          <Link to="/register" className="text-blue-600">
            Register
          </Link>
        </p>
      </form>
    </div>
  );
}