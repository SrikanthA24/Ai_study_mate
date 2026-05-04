import { useNavigate } from "react-router-dom";
import { getToken, removeToken } from "../utils/storage";
import { useState, useEffect } from "react";
import { getMySyllabi } from "../api/syllabusApi";
import { getDueSRSCards } from "../api/srsApi";

export default function Navbar() {
  const navigate = useNavigate();
  const token = getToken();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // SRS due count badge
  const [dueSRSCount, setDueSRSCount] = useState(0);

  // Load due SRS count for the first syllabus on mount
  useEffect(() => {
    if (!token) return;
    const loadDue = async () => {
      try {
        const syllabi = await getMySyllabi();
        const list = Array.isArray(syllabi) ? syllabi : syllabi?.syllabi || [];
        if (list.length === 0) return;
        const due = await getDueSRSCards(list[0].id);
        setDueSRSCount(Array.isArray(due) ? due.length : 0);
      } catch {
        setDueSRSCount(0);
      }
    };
    loadDue();
  }, [token]);

  const handleLogout = () => {
    removeToken();
    setIsDropdownOpen(false);
    navigate("/");
  };

  const handleNavigation = (path: string) => {
    navigate(path);
    setIsDropdownOpen(false);
  };

  return (
    <nav className="bg-blue-600 text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">

          {/* ── Logo ─────────────────────────────────────────────────── */}
          <div className="flex items-center">
            <h1
              className="text-2xl font-bold cursor-pointer"
              onClick={() => handleNavigation("/home")}
            >
              AI Study Mate
            </h1>
          </div>

          {/* ── Nav links (desktop) ───────────────────────────────────── */}
          {token && (
            <div className="hidden md:flex items-center space-x-1">

              <button
                onClick={() => handleNavigation("/home")}
                className="hover:bg-blue-700 px-3 py-2 rounded"
              >
                Home
              </button>

              <button
                onClick={() => handleNavigation("/dashboard")}
                className="hover:bg-blue-700 px-3 py-2 rounded"
              >
                Dashboard
              </button>

              <button
                onClick={() => handleNavigation("/my-syllabi")}
                className="hover:bg-blue-700 px-3 py-2 rounded"
              >
                My Syllabi
              </button>

              <button
                onClick={() => handleNavigation("/recommendation")}
                className="hover:bg-blue-700 px-3 py-2 rounded"
              >
                Recommendations
              </button>

              {/* ── SRS Reviews button with badge ─────────────────────── */}
              <button
                onClick={() => handleNavigation("/home?tab=srs")}
                className="relative hover:bg-blue-700 px-3 py-2 rounded flex items-center gap-1"
              >
                <span>SRS Reviews</span>
                {dueSRSCount > 0 && (
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white text-xs font-bold">
                    {dueSRSCount > 9 ? "9+" : dueSRSCount}
                  </span>
                )}
              </button>

            </div>
          )}

          {/* ── Right side ────────────────────────────────────────────── */}
          <div className="flex items-center">
            {token ? (
              <div className="relative">
                <button
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className="bg-blue-700 hover:bg-blue-800 px-4 py-2 rounded-lg flex items-center space-x-2"
                >
                  <span>Profile</span>
                  <span className={`transform transition-transform ${isDropdownOpen ? "rotate-180" : ""}`}>
                    ▼
                  </span>
                </button>

                {isDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-white text-gray-800 rounded-lg shadow-lg z-50">
                    <button
                      onClick={() => handleNavigation("/home")}
                      className="w-full text-left px-4 py-2 hover:bg-gray-100 rounded-t-lg"
                    >
                      🏠 Home
                    </button>
                    <button
                      onClick={() => handleNavigation("/home?tab=srs")}
                      className="w-full text-left px-4 py-2 hover:bg-gray-100 flex items-center justify-between"
                    >
                      <span>🧠 SRS Reviews</span>
                      {dueSRSCount > 0 && (
                        <span className="rounded-full bg-red-500 text-white text-xs px-2 py-0.5 font-bold">
                          {dueSRSCount}
                        </span>
                      )}
                    </button>
                    <button
                      onClick={() => handleNavigation("/performance/1")}
                      className="w-full text-left px-4 py-2 hover:bg-gray-100"
                    >
                      📊 Performance
                    </button>
                    <button
                      onClick={handleLogout}
                      className="w-full text-left px-4 py-2 hover:bg-gray-100 rounded-b-lg text-red-600"
                    >
                      Logout
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-x-3">
                <button
                  onClick={() => handleNavigation("/")}
                  className="hover:bg-blue-700 px-4 py-2 rounded"
                >
                  Login
                </button>
                <button
                  onClick={() => handleNavigation("/register")}
                  className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded"
                >
                  Register
                </button>
              </div>
            )}
          </div>

        </div>
      </div>
    </nav>
  );
}