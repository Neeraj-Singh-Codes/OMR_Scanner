import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "./context/ThemeContext";
import { Navbar } from "./components/Navbar";
import { Dashboard } from "./pages/Dashboard";
import { CreateExam } from "./pages/CreateExam";
import { EditExam } from "./pages/EditExam";
import { ScanOMR } from "./pages/ScanOMR";
import { ScanReview } from "./pages/ScanReview";
import { ExamDetails } from "./pages/ExamDetails";

export const App: React.FC = () => {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <div className="min-h-screen flex flex-col bg-transparent text-slate-900 dark:text-slate-100 transition-colors duration-200">
          <Navbar />
          <main className="flex-1">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/create-exam" element={<CreateExam />} />
              <Route path="/exams/:id/edit" element={<EditExam />} />
              <Route path="/scan" element={<ScanOMR />} />
              <Route path="/scans/:id/review" element={<ScanReview />} />
              <Route path="/exams/:id" element={<ExamDetails />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </ThemeProvider>
  );
};

export default App;
