import { useState } from "react";
import { registerUser } from "../api/authApi";
import { useNavigate, Link } from "react-router-dom";

export default function RegisterPage() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    email: "",
    password: "",
  });

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [debug, setDebug] = useState("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setDebug("");

    try {
      const data = await registerUser(form);
      console.log("REGISTER RESPONSE:", data);
      setDebug(JSON.stringify(data, null, 2));
      setMessage("Registration successful. Please login.");
      setTimeout(() => navigate("/"), 1200);
    } catch (err: any) {
      console.error("REGISTER ERROR:", err?.response?.data || err);
      setError(
        typeof err?.response?.data?.detail === "string"
          ? err.response.data.detail
          : JSON.stringify(err?.response?.data || "Registration failed")
      );
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <form
        onSubmit={handleSubmit}
        className="bg-white p-8 rounded-xl shadow-md w-full max-w-md"
      >
        <h1 className="text-2xl font-bold mb-6 text-center">Register</h1>

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
        {message && <p className="text-green-600 mb-3">{message}</p>}

        <button type="submit" className="w-full bg-green-600 text-white p-3 rounded hover:bg-green-700 cursor-pointer">
          Register
        </button>

        <p className="mt-4 text-center">
          Already have an account?{" "}
          <Link to="/" className="text-blue-600">
            Login
          </Link>
        </p>

        {debug && (
          <pre className="mt-4 text-xs bg-gray-100 p-3 rounded overflow-auto">
            {debug}
          </pre>
        )}
      </form>
    </div>
  );
}