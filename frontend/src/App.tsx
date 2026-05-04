import { BrowserRouter, Routes, Route } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import HomePage from "./pages/HomePage";
import DashboardPage from "./pages/DashboardPage";
import CreateSyllabusPage from "./pages/CreateSyllabusPage";
import MySyllabiPage from "./pages/MySyllabiPage";
import SyllabusDetailPage from "./pages/SyllabusDetailPage";
import PlaylistSelectionPage from "./pages/PlaylistSelectionPage";
import PlaylistVideosPage from "./pages/PlaylistVideosPage";
import AssessmentPage from "./pages/AssessmentPage";
import PerformancePage from "./pages/PerformancePage";
import RecommendationPage from "./pages/RecommendationPage";
import ProtectedRoute from "./components/ProtectedRoute";
import StudyPlanPage from "./pages/StudyPlanPage";
import StudyPlanProgressPage from "./pages/StudyPlanProgressPage";
import ResumeCoursePage from "./pages/ResumeCoursePage";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* ── Public ─────────────────────────────────────────────────── */}
        <Route path="/" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* ── Protected ───────────────────────────────────────────────── */}
        <Route
          path="/home"
          element={
            <ProtectedRoute>
              <HomePage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/resume-course/:syllabusId"
          element={
            <ProtectedRoute>
              <ResumeCoursePage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/syllabus/create"
          element={
            <ProtectedRoute>
              <CreateSyllabusPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/my-syllabi"
          element={
            <ProtectedRoute>
              <MySyllabiPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/syllabus/:id"
          element={
            <ProtectedRoute>
              <SyllabusDetailPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/syllabus/:id/playlist"
          element={
            <ProtectedRoute>
              <PlaylistSelectionPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/syllabus/:id/videos"
          element={
            <ProtectedRoute>
              <PlaylistVideosPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/assessment/:syllabusId/:videoId"
          element={
            <ProtectedRoute>
              <AssessmentPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/performance/:syllabusId"
          element={
            <ProtectedRoute>
              <PerformancePage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/recommendation/:syllabusId"
          element={
            <ProtectedRoute>
              <RecommendationPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/study-plan/:syllabusId"
          element={
            <ProtectedRoute>
              <StudyPlanPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/study-plan-progress/:syllabusId"
          element={
            <ProtectedRoute>
              <StudyPlanProgressPage />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;