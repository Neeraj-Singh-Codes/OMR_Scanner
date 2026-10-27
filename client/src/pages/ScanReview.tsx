import React, { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { CheckCircle2, AlertTriangle, AlertCircle, ArrowLeft, Save, UserCheck, Eye } from "lucide-react";
import { ScanService } from "../services/api";
import { ScanResult, OptionLetter } from "../types";

export const ScanReview: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [scan, setScan] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [studentName, setStudentName] = useState("");
  const [rollNumber, setRollNumber] = useState("");
  const [corrections, setCorrections] = useState<Record<string, OptionLetter | null>>({});

  useEffect(() => {
    if (id) {
      loadScanData(id);
    }
  }, [id]);

  const loadScanData = async (scanId: string) => {
    try {
      setLoading(true);
      const data = await ScanService.getById(scanId);
      setScan(data);
      setStudentName(data.studentName || "");
      setRollNumber(data.rollNumber || "");
      setCorrections(data.correctedAnswers || {});
    } catch (err: any) {
      console.error("Failed to load scan:", err);
      setError("Failed to load scan review data.");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectOption = (qNum: number, opt: OptionLetter) => {
    const qKey = String(qNum);
    setCorrections((prev) => {
      // Toggle if already selected
      const current = prev[qKey] !== undefined ? prev[qKey] : scan?.detectedAnswers[qKey];
      return {
        ...prev,
        [qKey]: current === opt ? null : opt,
      };
    });
  };

  const handleSaveCorrections = async () => {
    if (!id) return;
    try {
      setSaving(true);
      setError(null);
      const updated = await ScanService.review(id, {
        studentName,
        rollNumber,
        correctedAnswers: corrections,
      });
      setScan(updated);
    } catch (err: any) {
      console.error("Save review error:", err);
      setError(err.response?.data?.message || "Failed to update review.");
    } finally {
      setSaving(false);
    }
  };

  const handleFinalize = async () => {
    if (!id) return;
    try {
      setSaving(true);
      setError(null);
      // Save corrections first if modified
      await ScanService.review(id, {
        studentName,
        rollNumber,
        correctedAnswers: corrections,
      });
      const finalized = await ScanService.finalize(id);
      setScan(finalized);
      navigate(`/exams/${typeof finalized.examId === "string" ? finalized.examId : finalized.examId._id}`);
    } catch (err: any) {
      console.error("Finalize error:", err);
      setError(err.response?.data?.message || "Failed to finalize scan.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center text-slate-500 dark:text-slate-400 font-medium">
        Loading scan review details...
      </div>
    );
  }

  if (!scan) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <h2 className="font-bold text-lg text-slate-800 dark:text-slate-200">Scan not found</h2>
        <Link to="/" className="mt-4 inline-block text-sm text-indigo-600 dark:text-indigo-400 font-semibold">
          Return to Dashboard
        </Link>
      </div>
    );
  }

  const exam = scan.examId as any;
  const totalQuestions = exam?.totalQuestions || 30;
  const ambiguousQuestions = scan.scanMetadata?.ambiguousQuestions || [];
  const multipleMarkedQuestions = scan.scanMetadata?.multipleMarkedQuestions || [];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <button
            onClick={() => navigate(-1)}
            className="mb-1 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Review & Verify Answer Sheet
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Exam: <strong className="text-slate-700 dark:text-slate-300">{exam?.title || "Assessment"}</strong> ({exam?.subject})
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSaveCorrections}
            disabled={saving}
            className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs sm:text-sm transition-colors flex items-center gap-1.5"
          >
            <Save className="w-4 h-4" />
            Save Draft
          </button>

          <button
            onClick={handleFinalize}
            disabled={saving}
            className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm transition-colors shadow-sm flex items-center gap-1.5"
          >
            <CheckCircle2 className="w-4 h-4" />
            Confirm & Finalize
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-sm font-medium">
          {error}
        </div>
      )}

      {/* Review Alert Banner */}
      {(scan.reviewRequired || scan.scanMetadata?.rollNumberFlagged) && (
        <div className="mb-6 p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-900/60 text-amber-900 dark:text-amber-200 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs sm:text-sm">
            <span className="font-bold">Manual Teacher Verification Needed:</span>
            {scan.scanMetadata?.rollNumberFlagged && (
              <p className="mt-1 text-amber-800 dark:text-amber-300 font-medium">
                • <strong>Student Identification:</strong> {scan.scanMetadata.rollNumberReason || "Candidate roll number requires human checking."}
              </p>
            )}
            {ambiguousQuestions.length > 0 && (
              <p className="mt-1 text-amber-800 dark:text-amber-300">
                • <strong>Answer Bubbles:</strong> {ambiguousQuestions.length} question(s) (Q
                {ambiguousQuestions.join(", Q")}) had lightly shaded, erased, or multiple marked bubbles. Please review the highlighted questions below.
              </p>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Student Identity & Image Preview */}
        <div className="lg:col-span-5 space-y-6">
          {/* Identity Box */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4 transition-colors">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-2.5">
              <UserCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              Candidate Identification
            </h3>

            {scan.scanMetadata?.headerImageBase64 && (
              <div className="space-y-1">
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  Detected Sheet Header (Handwritten Details):
                </span>
                <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-white">
                  <img
                    src={`data:image/jpeg;base64,${scan.scanMetadata.headerImageBase64}`}
                    alt="Handwritten Header"
                    className="w-full h-auto object-contain"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                Student Name
              </label>
              <input
                type="text"
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                placeholder="Enter student name"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {scan.scanMetadata?.rollNumberFlagged && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-amber-800 dark:text-amber-300">
                  <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span>Roll Number Flagged for Verification</span>
                </div>
                <p className="text-[11px] text-amber-800/90 dark:text-amber-300/90 leading-relaxed">
                  {scan.scanMetadata.rollNumberReason || "Ambiguous handwritten digits detected."}
                  {scan.scanMetadata.rollNumberConfidence !== undefined && scan.scanMetadata.rollNumberConfidence !== null && (
                    <span className="font-semibold ml-1">
                      (OCR Confidence: {scan.scanMetadata.rollNumberConfidence}%)
                    </span>
                  )}
                </p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                  Inspect the handwritten image above and confirm or correct the roll number below.
                </p>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                Roll Number {scan.scanMetadata?.rollNumberFlagged && <span className="text-amber-600 font-bold ml-1">(Action Required)</span>}
              </label>
              <input
                type="text"
                value={rollNumber}
                onChange={(e) => setRollNumber(e.target.value)}
                placeholder="e.g. 2026101"
                className={`w-full px-3.5 py-2.5 rounded-xl border ${
                  scan.scanMetadata?.rollNumberFlagged
                    ? "border-amber-400 dark:border-amber-600 ring-2 ring-amber-400/20"
                    : "border-slate-300 dark:border-slate-700"
                } bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500`}
              />
            </div>
          </div>

          {/* Current Score Summary */}
          <div className="bg-gradient-to-br from-indigo-900 via-slate-900 to-slate-950 text-white p-5 rounded-2xl shadow-sm space-y-3 border border-indigo-950/60">
            <span className="text-xs uppercase font-semibold tracking-wider text-indigo-300">
              Evaluated Performance
            </span>
            <div className="flex items-baseline justify-between">
              <div>
                <span className="text-4xl font-black text-white">{scan.score}</span>
                <span className="text-indigo-200 text-sm ml-1 font-semibold">/ {scan.maximumMarks} Marks</span>
              </div>
              <span className="text-2xl font-black text-emerald-400">{scan.percentage}%</span>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/10 text-center text-xs">
              <div className="bg-white/10 p-2 rounded-lg">
                <span className="text-slate-300 block">Correct</span>
                <strong className="text-white text-sm">{scan.correctCount}</strong>
              </div>
              <div className="bg-white/10 p-2 rounded-lg">
                <span className="text-slate-300 block">Incorrect</span>
                <strong className="text-white text-sm">{scan.incorrectCount}</strong>
              </div>
              <div className="bg-white/10 p-2 rounded-lg">
                <span className="text-slate-300 block">Unanswered</span>
                <strong className="text-white text-sm">{scan.unansweredCount}</strong>
              </div>
            </div>
          </div>

          {/* Scanned Sheet Preview */}
          {scan.scanMetadata?.annotatedImageBase64 && (
            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-2 transition-colors">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                Annotated Sheet Preview (Computer Vision Feedback)
              </span>
              <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 max-h-80 bg-slate-950 flex items-center justify-center">
                <img
                  src={`data:image/jpeg;base64,${scan.scanMetadata.annotatedImageBase64}`}
                  alt="Annotated Scan"
                  className="w-full h-auto object-contain max-h-80"
                />
              </div>
              <div className="flex items-center justify-center gap-4 text-[11px] text-slate-500 dark:text-slate-400 pt-1">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> Confident</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" /> Ambiguous</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" /> Multiple</span>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Interactive 30-Question Answer Review */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4 transition-colors">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                Responses & Answer Corrections
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Tap any option to override or correct a student response.
              </p>
            </div>
          </div>

          <div className="space-y-2 max-h-[700px] overflow-y-auto pr-1 custom-scrollbar">
            {Array.from({ length: totalQuestions }, (_, i) => i + 1).map((qNum) => {
              const qKey = String(qNum);
              const detected = scan.detectedAnswers[qKey];
              const hasCorrection = Object.prototype.hasOwnProperty.call(corrections, qKey);
              const finalOption = hasCorrection ? corrections[qKey] : detected;

              const isAmbiguous = ambiguousQuestions.includes(qNum);
              const isMultiple = multipleMarkedQuestions.includes(qNum);
              const isNeedsReview = (isAmbiguous || isMultiple) && !hasCorrection;

              return (
                <div
                  key={qNum}
                  className={`p-3 rounded-xl border transition-colors flex items-center justify-between gap-3 ${
                    isNeedsReview
                      ? "bg-amber-50/70 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700/80"
                      : hasCorrection
                      ? "bg-indigo-50/50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800"
                      : "bg-slate-50/50 dark:bg-slate-800/40 border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/70"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-slate-700 dark:text-slate-300 w-8">
                      Q{String(qNum).padStart(2, "0")}
                    </span>

                    {/* Status Badge */}
                    {isNeedsReview ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-200 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200 border border-amber-300/50 dark:border-amber-800/50 flex items-center gap-1">
                        <AlertTriangle className="w-2.5 h-2.5" />
                        {isMultiple ? "Multiple" : "Ambiguous"}
                      </span>
                    ) : hasCorrection ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-200 dark:bg-indigo-900/60 text-indigo-900 dark:text-indigo-200 border border-indigo-300/50 dark:border-indigo-800/50">
                        Corrected
                      </span>
                    ) : finalOption ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200/50 dark:border-emerald-800/50">
                        Detected
                      </span>
                    ) : (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                        Blank
                      </span>
                    )}
                  </div>

                  {/* Option Choice Buttons */}
                  <div className="flex items-center gap-1.5">
                    {(["A", "B", "C", "D"] as OptionLetter[]).map((opt) => {
                      const isSelected = finalOption === opt;
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => handleSelectOption(qNum, opt)}
                          className={`w-8 h-8 rounded-full font-bold text-xs flex items-center justify-center transition-all ${
                            isSelected
                              ? "bg-indigo-600 text-white shadow-sm scale-105"
                              : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
                          }`}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
