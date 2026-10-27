import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { PlusCircle, Camera, FileText, Download, CheckCircle, AlertTriangle, ArrowRight, BookOpen, Edit, Sparkles } from "lucide-react";
import { ExamService } from "../services/api";
import { Exam } from "../types";

export const Dashboard: React.FC = () => {
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadExams();
  }, []);

  const loadExams = async () => {
    try {
      setLoading(true);
      const data = await ExamService.getAll();
      setExams(data);
    } catch (err) {
      console.error("Failed to load exams:", err);
    } finally {
      setLoading(false);
    }
  };

  const totalScans = exams.reduce((acc, curr) => acc + (curr.totalScans || 0), 0);
  const totalPendingReviews = exams.reduce((acc, curr) => acc + (curr.pendingReviews || 0), 0);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      {/* Welcome Hero Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900 mb-2">
            <Sparkles className="w-3.5 h-3.5" />
            Computer Vision Automatic Evaluation
          </div>
          <h1 className="text-2xl sm:text-4xl font-black text-slate-900 dark:text-white tracking-tight">
            Examination Dashboard
          </h1>
          <p className="text-slate-600 dark:text-slate-400 mt-1.5 text-sm sm:text-base max-w-2xl leading-relaxed">
            Create standardized A4 assessments, print precision OMR sheets, capture with your mobile phone camera, and auto-grade answer bubbles instantly.
          </p>
        </div>

        <Link
          to="/create-exam"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-md shadow-indigo-600/20 hover:scale-105 active:scale-95 transition-all self-start sm:self-auto"
        >
          <PlusCircle className="w-4 h-4" />
          Create Exam
        </Link>
      </div>

      {/* Metric Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm transition-all hover:border-indigo-200 dark:hover:border-indigo-900/60 flex items-center justify-between">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400">Total Exams</span>
            <p className="text-3xl font-black text-slate-900 dark:text-white mt-1">{exams.length}</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
            <BookOpen className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm transition-all hover:border-emerald-200 dark:hover:border-emerald-900/60 flex items-center justify-between">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400">Evaluated Scans</span>
            <p className="text-3xl font-black text-slate-900 dark:text-white mt-1">{totalScans}</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <CheckCircle className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm transition-all hover:border-amber-200 dark:hover:border-amber-900/60 flex items-center justify-between">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400">Pending Reviews</span>
            <p className="text-3xl font-black text-amber-600 dark:text-amber-400 mt-1">{totalPendingReviews}</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Feature Action Banners */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link
          to="/create-exam"
          className="group relative overflow-hidden p-6 bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-800 text-white rounded-2xl shadow-lg shadow-indigo-600/20 hover:shadow-indigo-600/30 transition-all flex items-center justify-between"
        >
          <div className="space-y-1.5 z-10">
            <h3 className="font-extrabold text-lg flex items-center gap-2 tracking-tight">
              <PlusCircle className="w-5 h-5 text-indigo-200" />
              Create Assessment
            </h3>
            <p className="text-indigo-100 text-xs sm:text-sm max-w-md">
              Define question count, enter answer keys, and generate precision printable A4 OMR sheets.
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center group-hover:translate-x-1 transition-transform z-10 shrink-0">
            <ArrowRight className="w-5 h-5 text-white" />
          </div>
          <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-white/5 rounded-full pointer-events-none" />
        </Link>

        <Link
          to="/scan"
          className="group relative overflow-hidden p-6 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 text-white rounded-2xl shadow-lg border border-slate-800 hover:border-slate-700 transition-all flex items-center justify-between"
        >
          <div className="space-y-1.5 z-10">
            <h3 className="font-extrabold text-lg flex items-center gap-2 tracking-tight">
              <Camera className="w-5 h-5 text-emerald-400" />
              Scan Answer Sheet
            </h3>
            <p className="text-slate-300 dark:text-slate-400 text-xs sm:text-sm max-w-md">
              Use live camera viewfinder or upload photo for instant OpenCV bubble grading and verification.
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center group-hover:translate-x-1 transition-transform z-10 shrink-0">
            <ArrowRight className="w-5 h-5 text-white" />
          </div>
          <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-emerald-500/5 rounded-full pointer-events-none" />
        </Link>
      </div>

      {/* Recent Examinations Card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden transition-colors">
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="font-bold text-slate-900 dark:text-white text-base">Examinations List</h2>
            <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
              {exams.length}
            </span>
          </div>

          <Link
            to="/create-exam"
            className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-bold text-xs sm:text-sm flex items-center gap-1"
          >
            <PlusCircle className="w-4 h-4" />
            New Exam
          </Link>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-400 dark:text-slate-400 font-medium text-sm">
            Loading examination records...
          </div>
        ) : exams.length === 0 ? (
          <div className="p-12 text-center">
            <FileText className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
            <h3 className="font-bold text-slate-800 dark:text-slate-200 text-base">No exams created yet</h3>
            <p className="text-slate-500 dark:text-slate-400 text-xs sm:text-sm mt-1 max-w-sm mx-auto">
              Create your first examination to configure answer keys and print standardized OMR answer sheets.
            </p>
            <Link
              to="/create-exam"
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs sm:text-sm font-bold transition-all shadow-md shadow-indigo-600/20"
            >
              <PlusCircle className="w-4 h-4" />
              Create First Exam
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800/80 overflow-x-auto">
            {exams.map((exam) => (
              <div
                key={exam._id}
                className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 dark:text-white text-base">{exam.title}</span>
                    <span className="text-[11px] px-2.5 py-0.5 rounded-full font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                      {exam.className}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400 font-medium">
                    <span>Subject: <strong className="text-slate-700 dark:text-slate-300">{exam.subject}</strong></span>
                    <span>•</span>
                    <span>Questions: <strong className="text-slate-700 dark:text-slate-300">{exam.totalQuestions}</strong></span>
                    <span>•</span>
                    <span>Date: {new Date(exam.examDate).toLocaleDateString()}</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                  <Link
                    to={`/exams/${exam._id}/edit`}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors border border-transparent dark:border-slate-700/60"
                    title="Edit Exam"
                  >
                    <Edit className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                    Edit
                  </Link>

                  <a
                    href={ExamService.getTemplatePdfUrl(exam._id)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors border border-transparent dark:border-slate-700/60"
                    title="Download printable A4 PDF"
                  >
                    <Download className="w-3.5 h-3.5" />
                    OMR PDF
                  </a>

                  <Link
                    to={`/scan?examId=${exam._id}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 rounded-lg transition-colors border border-emerald-100 dark:border-emerald-900"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    Scan
                  </Link>

                  <Link
                    to={`/exams/${exam._id}`}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 rounded-lg transition-colors border border-indigo-100 dark:border-indigo-900"
                  >
                    View
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
