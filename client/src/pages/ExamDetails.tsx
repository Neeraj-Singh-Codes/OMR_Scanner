import React, { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  Download,
  Camera,
  CheckCircle,
  AlertTriangle,
  ArrowLeft,
  Search,
  ExternalLink,
  Edit,
  Trash2,
} from "lucide-react";
import { ExamService, ScanService } from "../services/api";
import { Exam, ScanResult } from "../types";

export const ExamDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [exam, setExam] = useState<Exam | null>(null);
  const [results, setResults] = useState<ScanResult[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedScanIds, setSelectedScanIds] = useState<string[]>([]);

  useEffect(() => {
    if (id) {
      loadExamAndResults(id);
    }
  }, [id, statusFilter]);

  const loadExamAndResults = async (examId: string) => {
    try {
      setLoading(true);
      const [examData, resultsData] = await Promise.all([
        ExamService.getById(examId),
        ScanService.getExamResults(examId, {
          reviewStatus: statusFilter || undefined,
        }),
      ]);
      setExam(examData);
      setResults(resultsData);
    } catch (err) {
      console.error("Failed to load exam details:", err);
    } finally {
      setLoading(false);
    }
  };

  const filteredResults = results.filter((r) => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    return (
      r.studentName.toLowerCase().includes(term) ||
      r.rollNumber.toLowerCase().includes(term)
    );
  });

  const avgScore =
    results.length > 0
      ? (results.reduce((acc, curr) => acc + curr.score, 0) / results.length).toFixed(1)
      : "0";

  const handleDeleteExam = async () => {
    if (!exam) return;
    if (
      !window.confirm(
        `Are you sure you want to permanently delete "${exam.title}"? This will delete all student scans and cannot be undone.`
      )
    ) {
      return;
    }
    try {
      await ExamService.delete(exam._id);
      navigate("/");
    } catch (err) {
      console.error("Failed to delete exam:", err);
      alert("Failed to delete exam.");
    }
  };

  const toggleSelectAll = () => {
    if (selectedScanIds.length === filteredResults.length && filteredResults.length > 0) {
      setSelectedScanIds([]);
    } else {
      setSelectedScanIds(filteredResults.map((r) => r._id));
    }
  };

  const toggleSelectOne = (scanId: string) => {
    setSelectedScanIds((prev) =>
      prev.includes(scanId) ? prev.filter((i) => i !== scanId) : [...prev, scanId]
    );
  };

  const handleDeleteOneScan = async (scanId: string, name: string, roll: string) => {
    const label = name || roll || "this student";
    if (
      !window.confirm(
        `Are you sure you want to delete the scan record for "${label}"? This action cannot be undone.`
      )
    ) {
      return;
    }
    try {
      await ScanService.delete(scanId);
      setResults((prev) => prev.filter((r) => r._id !== scanId));
      setSelectedScanIds((prev) => prev.filter((i) => i !== scanId));
    } catch (err) {
      console.error("Failed to delete scan:", err);
      alert("Failed to delete student scan.");
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedScanIds.length === 0) return;
    if (
      !window.confirm(
        `Are you sure you want to delete ${selectedScanIds.length} selected student record(s)? This action cannot be undone.`
      )
    ) {
      return;
    }
    try {
      await ScanService.deleteBatch(selectedScanIds);
      setResults((prev) => prev.filter((r) => !selectedScanIds.includes(r._id)));
      setSelectedScanIds([]);
    } catch (err) {
      console.error("Failed to delete selected scans:", err);
      alert("Failed to delete selected student scans.");
    }
  };

  const handleClearAllScans = async () => {
    if (!exam) return;
    if (
      !window.confirm(
        `Are you sure you want to delete ALL (${results.length}) scan records for "${exam.title}"? This cannot be undone.`
      )
    ) {
      return;
    }
    try {
      await ScanService.deleteAllForExam(exam._id);
      setResults([]);
      setSelectedScanIds([]);
    } catch (err) {
      console.error("Failed to clear scans for exam:", err);
      alert("Failed to clear student scans.");
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-16 text-center text-slate-500 dark:text-slate-400 font-medium">
        Loading examination details...
      </div>
    );
  }

  if (!exam) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <h2 className="font-bold text-lg text-slate-800 dark:text-slate-200">Exam not found</h2>
        <Link to="/" className="mt-4 inline-block text-sm text-indigo-600 dark:text-indigo-400 font-semibold">
          Return to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      {/* Back button & Header */}
      <div>
        <Link
          to="/"
          className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Dashboard
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                {exam.title}
              </h1>
              <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-indigo-100 dark:bg-indigo-950/70 text-indigo-800 dark:text-indigo-300 border border-indigo-200/50 dark:border-indigo-800/50">
                {exam.className}
              </span>
            </div>
            <p className="text-slate-500 dark:text-slate-400 text-xs sm:text-sm mt-1">
              Subject: <strong className="text-slate-700 dark:text-slate-300">{exam.subject}</strong> • {exam.totalQuestions} Questions • Date: {new Date(exam.examDate).toLocaleDateString()}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={`/exams/${exam._id}/edit`}
              className="px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 text-xs sm:text-sm font-semibold transition-colors flex items-center gap-1.5 shadow-sm"
              title="Edit examination details and answer key"
            >
              <Edit className="w-4 h-4 text-slate-600 dark:text-slate-400" />
              Edit Exam
            </Link>

            <a
              href={ExamService.getTemplatePdfUrl(exam._id)}
              target="_blank"
              rel="noreferrer"
              className="px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 text-xs sm:text-sm font-semibold transition-colors flex items-center gap-1.5 shadow-sm"
            >
              <Download className="w-4 h-4" />
              Print OMR Sheet
            </a>

            <Link
              to={`/scan?examId=${exam._id}`}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-bold transition-colors flex items-center gap-1.5 shadow-sm shadow-indigo-600/20"
            >
              <Camera className="w-4 h-4" />
              Scan Sheets
            </Link>

            <button
              onClick={handleDeleteExam}
              className="px-3.5 py-2 rounded-xl border border-red-200 dark:border-red-900/40 hover:bg-red-50 dark:hover:bg-red-950/30 text-red-600 dark:text-red-400 bg-white dark:bg-slate-800 text-xs sm:text-sm font-semibold transition-colors flex items-center gap-1.5 shadow-sm"
              title="Permanently delete this exam and all its scan results"
            >
              <Trash2 className="w-4 h-4" />
              Delete Exam
            </button>
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm transition-colors">
          <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold uppercase">Total Scanned</span>
          <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">{results.length}</p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm transition-colors">
          <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold uppercase">Average Score</span>
          <p className="text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-1">{avgScore}</p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm transition-colors">
          <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold uppercase">Max Possible</span>
          <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">
            {exam.totalQuestions * exam.markingScheme.correctMarks}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm transition-colors">
          <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold uppercase">Pending Reviews</span>
          <p className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">{exam.pendingReviews || 0}</p>
        </div>
      </div>

      {/* Answer Key Grid Accordion */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-3 transition-colors">
        <h3 className="font-bold text-sm text-slate-900 dark:text-white">
          Official Answer Key ({exam.totalQuestions} Questions)
        </h3>
        <div className="flex flex-wrap gap-2 pt-1">
          {Array.from({ length: exam.totalQuestions }, (_, i) => i + 1).map((qNum) => {
            const correctOpt =
              exam.answerKey instanceof Map
                ? exam.answerKey.get(String(qNum))
                : (exam.answerKey as any)?.[String(qNum)];
            return (
              <div
                key={qNum}
                className="px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 text-xs"
              >
                <span className="font-bold text-slate-500 dark:text-slate-400">{qNum}:</span>
                <span className="font-black text-indigo-600 dark:text-indigo-400">{correctOpt || "-"}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Student Results Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden transition-colors">
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="font-bold text-base text-slate-900 dark:text-white">
              Student Scan Results ({results.length})
            </h3>

            {results.length > 0 && (
              <Link
                to={`/scans/${(results.find((r) => r.reviewRequired || r.reviewStatus === "PENDING") || results[0])._id}/review`}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm ${
                  results.some((r) => r.reviewRequired || r.reviewStatus === "PENDING")
                    ? "bg-amber-500 hover:bg-amber-600 text-white"
                    : "bg-indigo-600 hover:bg-indigo-700 text-white"
                }`}
                title="Start sequential review across all student sheets without returning back"
              >
                {results.some((r) => r.reviewRequired || r.reviewStatus === "PENDING") ? (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Review Flagged ({results.filter((r) => r.reviewRequired || r.reviewStatus === "PENDING").length})
                  </>
                ) : (
                  <>
                    <ExternalLink className="w-3.5 h-3.5" />
                    Review All
                  </>
                )}
              </Link>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search student or roll..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 w-48"
              />
            </div>

            {/* Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
            >
              <option value="">All Statuses</option>
              <option value="CONFIRMED">Confirmed</option>
              <option value="PENDING">Pending Review</option>
              <option value="RESOLVED">Resolved</option>
            </select>

            {/* Export CSV */}
            {results.length > 0 && (
              <a
                href={ScanService.getResultsExportCsvUrl(exam._id)}
                className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-transparent dark:border-slate-700 text-xs font-semibold transition-colors flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                Export CSV
              </a>
            )}

            {/* Clear All Scans */}
            {results.length > 0 && (
              <button
                onClick={handleClearAllScans}
                className="px-3 py-1.5 rounded-xl bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 border border-red-200/60 dark:border-red-900/60 text-xs font-semibold transition-colors flex items-center gap-1.5"
                title="Delete all scanned sheets for this exam"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear All Scans
              </button>
            )}
          </div>
        </div>

        {/* Selected Batch Action Banner */}
        {selectedScanIds.length > 0 && (
          <div className="bg-indigo-50 dark:bg-indigo-950/50 border-b border-indigo-200/80 dark:border-indigo-800/60 px-5 py-2.5 flex items-center justify-between text-xs transition-colors">
            <span className="text-indigo-900 dark:text-indigo-200 font-bold">
              {selectedScanIds.length} {selectedScanIds.length === 1 ? "student" : "students"} selected
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelectedScanIds([])}
                className="px-3 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold transition-colors"
              >
                Deselect All
              </button>
              <button
                onClick={handleDeleteSelected}
                className="px-3 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold flex items-center gap-1.5 shadow-sm transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete Selected ({selectedScanIds.length})
              </button>
            </div>
          </div>
        )}

        {filteredResults.length === 0 ? (
          <div className="p-12 text-center text-slate-400 dark:text-slate-500 text-sm">
            No scan records match your criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/70 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-4 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={filteredResults.length > 0 && selectedScanIds.length === filteredResults.length}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer accent-indigo-600"
                      title="Select all students"
                    />
                  </th>
                  <th className="py-3 px-4">Roll Number</th>
                  <th className="py-3 px-4">Student Name</th>
                  <th className="py-3 px-4">Score</th>
                  <th className="py-3 px-4">Correct</th>
                  <th className="py-3 px-4">Incorrect</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs font-medium">
                {filteredResults.map((r) => (
                  <tr
                    key={r._id}
                    className={`hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors ${
                      selectedScanIds.includes(r._id) ? "bg-indigo-50/40 dark:bg-indigo-950/20" : ""
                    }`}
                  >
                    <td className="py-3.5 px-4 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={selectedScanIds.includes(r._id)}
                        onChange={() => toggleSelectOne(r._id)}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer accent-indigo-600"
                      />
                    </td>
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-800 dark:text-slate-200">
                      {r.rollNumber || "UNASSIGNED"}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white">{r.studentName}</td>
                    <td className="py-3.5 px-4">
                      <span className="font-black text-slate-900 dark:text-white text-sm">{r.score}</span>
                      <span className="text-slate-400 text-[11px] ml-1">({r.percentage}%)</span>
                    </td>
                    <td className="py-3.5 px-4 text-emerald-600 dark:text-emerald-400 font-bold">{r.correctCount}</td>
                    <td className="py-3.5 px-4 text-red-500 dark:text-red-400 font-bold">{r.incorrectCount}</td>
                    <td className="py-3.5 px-4">
                      {r.scanMetadata?.isFailedScan ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-200/60 dark:border-amber-900/60">
                          <AlertTriangle className="w-2.5 h-2.5" />
                          Manual Entry
                        </span>
                      ) : r.reviewRequired || r.reviewStatus === "PENDING" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-200/60 dark:border-amber-900/60">
                          <AlertTriangle className="w-2.5 h-2.5" />
                          Needs Review
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-900/60">
                          <CheckCircle className="w-2.5 h-2.5" />
                          Confirmed
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Link
                          to={`/scans/${r._id}/review`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-bold text-xs transition-colors border border-indigo-100 dark:border-indigo-900"
                        >
                          Review
                          <ExternalLink className="w-3 h-3" />
                        </Link>
                        <button
                          onClick={() => handleDeleteOneScan(r._id, r.studentName, r.rollNumber)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 font-semibold text-xs transition-colors border border-red-100 dark:border-red-900/50"
                          title="Delete student scan"
                        >
                          <Trash2 className="w-3 h-3" />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
