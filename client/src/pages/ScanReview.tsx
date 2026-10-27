import React, { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { CheckCircle2, AlertTriangle, AlertCircle, ArrowLeft, Save, UserCheck, Eye, Sparkles } from "lucide-react";
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
  const hasNameFlag = Boolean(scan.scanMetadata?.nameFlagged);
  const hasRollFlag = Boolean(scan.scanMetadata?.rollNumberFlagged);
  const hasReviewRequired = scan.reviewRequired || hasNameFlag || hasRollFlag;

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
      {hasReviewRequired && (
        <div className="mb-6 p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-900/60 text-amber-900 dark:text-amber-200 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs sm:text-sm space-y-1">
            <span className="font-bold">Manual Teacher Verification Needed:</span>
            {hasNameFlag && (
              <p className="text-amber-800 dark:text-amber-300 font-medium">
                • <strong>Student Name:</strong> {scan.scanMetadata?.nameReason || "Handwritten student name requires human verification."}
              </p>
            )}
            {hasRollFlag && (
              <p className="text-amber-800 dark:text-amber-300 font-medium">
                • <strong>Roll Number:</strong> {scan.scanMetadata?.rollNumberReason || "Candidate roll number requires human checking."}
              </p>
            )}
            {ambiguousQuestions.length > 0 && (
              <p className="text-amber-800 dark:text-amber-300">
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

            {/* Focused Handwritten Name Crop */}
            {scan.scanMetadata?.nameImageBase64 && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                    Focused Handwritten Name Crop:
                  </span>
                  {scan.scanMetadata?.recognitionEngine && (
                    <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">
                      {scan.scanMetadata.recognitionEngine}
                    </span>
                  )}
                </div>
                <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-2">
                  <img
                    src={`data:image/jpeg;base64,${scan.scanMetadata.nameImageBase64}`}
                    alt="Handwritten Name Crop"
                    className="w-full h-auto object-contain max-h-24 mx-auto rounded"
                  />
                </div>
              </div>
            )}

            {/* Focused Handwritten Roll Number Crop */}
            {scan.scanMetadata?.rollImageBase64 && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                    Focused Handwritten Roll Number Crop:
                  </span>
                  {scan.scanMetadata?.rawRollText && (
                    <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">
                      Raw OCR: {scan.scanMetadata.rawRollText}
                    </span>
                  )}
                </div>
                <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-2">
                  <img
                    src={`data:image/jpeg;base64,${scan.scanMetadata.rollImageBase64}`}
                    alt="Handwritten Roll Number Crop"
                    className="w-full h-auto object-contain max-h-20 mx-auto rounded"
                  />
                </div>
              </div>
            )}

            {/* Strike-Through / Crossed-Out Warning */}
            {(scan.scanMetadata?.nameCrossedOutDetected || scan.scanMetadata?.rollCrossedOutDetected) && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-900 dark:text-rose-200 text-xs space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-rose-800 dark:text-rose-300">
                  <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                  <span>Crossed-Out / Strike-Through Writing Detected</span>
                </div>
                <p className="text-[11px] text-rose-800/90 dark:text-rose-300/90 leading-relaxed">
                  Struck-through or discarded writing was detected in {scan.scanMetadata?.nameCrossedOutDetected && scan.scanMetadata?.rollCrossedOutDetected ? "both Student Name and Roll Number fields" : scan.scanMetadata?.nameCrossedOutDetected ? "the Student Name field" : "the Roll Number field"}. The uncrossed final entry was preferred, but please verify the student's intended values below.
                </p>
              </div>
            )}

            {/* Full Detected Sheet Header */}
            {scan.scanMetadata?.headerImageBase64 && (
              <div className="space-y-1">
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  Full Detected Sheet Header:
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

            {/* Name Verification Alert */}
            {hasNameFlag && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-amber-800 dark:text-amber-300">
                  <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span>Student Name Flagged for Verification</span>
                </div>
                <p className="text-[11px] text-amber-800/90 dark:text-amber-300/90 leading-relaxed">
                  {scan.scanMetadata?.nameReason || "Handwritten student name requires human verification."}
                  {scan.scanMetadata?.nameConfidence !== undefined && scan.scanMetadata?.nameConfidence !== null && (
                    <span className="font-semibold ml-1">
                      (OCR Confidence: {scan.scanMetadata.nameConfidence}%)
                    </span>
                  )}
                </p>
                {scan.scanMetadata?.rawOcrText && (
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">
                    Raw OCR Output: <span className="font-mono font-medium">{scan.scanMetadata.rawOcrText}</span>
                  </p>
                )}
              </div>
            )}

            {/* Roster Match Badge */}
            {scan.scanMetadata?.rosterMatch?.matched && (
              <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300 text-xs flex items-center justify-between">
                <span className="font-medium flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  Matched with Roster: <strong className="font-semibold">{scan.scanMetadata.rosterMatch.rosterName}</strong>
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300">
                  {scan.scanMetadata.rosterMatch.similarity}% confidence
                </span>
              </div>
            )}

            {/* Student Name Input */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                Student Name {hasNameFlag && <span className="text-amber-600 font-bold ml-1">(Action Required)</span>}
              </label>
              <input
                type="text"
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                placeholder="Enter student name"
                className={`w-full px-3.5 py-2.5 rounded-xl border ${
                  hasNameFlag
                    ? "border-amber-400 dark:border-amber-600 ring-2 ring-amber-400/20"
                    : "border-slate-300 dark:border-slate-700"
                } bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500`}
              />
            </div>

            {/* Roll Number Verification Alert */}
            {hasRollFlag && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-amber-800 dark:text-amber-300">
                  <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span>Roll Number Flagged for Verification</span>
                </div>
                <p className="text-[11px] text-amber-800/90 dark:text-amber-300/90 leading-relaxed">
                  {scan.scanMetadata?.rollNumberReason || "Ambiguous handwritten digits detected."}
                  {scan.scanMetadata?.rollNumberConfidence !== undefined && scan.scanMetadata?.rollNumberConfidence !== null && (
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

            {/* Roll Number Input */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                Roll Number {hasRollFlag && <span className="text-amber-600 font-bold ml-1">(Action Required)</span>}
              </label>
              <input
                type="text"
                value={rollNumber}
                onChange={(e) => setRollNumber(e.target.value)}
                placeholder="e.g. 2026101"
                className={`w-full px-3.5 py-2.5 rounded-xl border ${
                  hasRollFlag
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
              <div className="bg-white/5 py-1.5 rounded-lg">
                <span className="text-emerald-400 font-bold block text-sm">{scan.correctCount}</span>
                <span className="text-slate-400 text-[10px]">Correct</span>
              </div>
              <div className="bg-white/5 py-1.5 rounded-lg">
                <span className="text-red-400 font-bold block text-sm">{scan.incorrectCount}</span>
                <span className="text-slate-400 text-[10px]">Incorrect</span>
              </div>
              <div className="bg-white/5 py-1.5 rounded-lg">
                <span className="text-slate-300 font-bold block text-sm">{scan.unansweredCount}</span>
                <span className="text-slate-400 text-[10px]">Blank</span>
              </div>
            </div>
          </div>

          {/* Annotated OMR Sheet Preview Modal / Thumbnail */}
          {scan.scanMetadata?.annotatedImageBase64 && (
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-3">
              <h4 className="font-bold text-xs uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Eye className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                Computer Vision Overlay
              </h4>
              <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-950">
                <img
                  src={`data:image/jpeg;base64,${scan.scanMetadata.annotatedImageBase64}`}
                  alt="OMR Overlay"
                  className="w-full h-auto object-contain cursor-zoom-in"
                  onClick={() => {
                    const win = window.open("");
                    win?.document.write(
                      `<body style="margin:0;background:#111;display:flex;align-items:center;justify-center:center"><img src="data:image/jpeg;base64,${scan.scanMetadata?.annotatedImageBase64}" style="max-width:100%;height:auto;margin:auto" /></body>`
                    );
                  }}
                />
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 text-center">
                Click preview to inspect full-resolution bubble detector diagnostic.
              </p>
            </div>
          )}
        </div>

        {/* Right Column: Question Grid & Answer Corrections */}
        <div className="lg:col-span-7">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm transition-colors space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
              <div>
                <h3 className="font-extrabold text-base text-slate-900 dark:text-white">
                  Answer Bubble Review & Corrections
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Click any option to override or correct a detected student answer.
                </p>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                {totalQuestions} Questions
              </span>
            </div>

            {/* Questions Table */}
            <div className="space-y-2">
              {Array.from({ length: totalQuestions }, (_, idx) => {
                const qNum = idx + 1;
                const qKey = String(qNum);
                const isAmbiguous = ambiguousQuestions.includes(qNum);
                const isMultiple = multipleMarkedQuestions.includes(qNum);
                const detectedOpt = scan.detectedAnswers[qKey];
                const correctedOpt = corrections[qKey] !== undefined ? corrections[qKey] : undefined;
                const currentOpt = correctedOpt !== undefined ? correctedOpt : detectedOpt;
                const isCorrected = correctedOpt !== undefined && correctedOpt !== detectedOpt;

                const officialAnswer = exam?.answerKey ? exam.answerKey[qKey] : undefined;
                const isCorrect = currentOpt && officialAnswer && currentOpt === officialAnswer;
                const isIncorrect = currentOpt && officialAnswer && currentOpt !== officialAnswer;

                return (
                  <div
                    key={qNum}
                    className={`p-3 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      isAmbiguous || isMultiple
                        ? "bg-amber-50/50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800/80"
                        : "bg-slate-50/50 dark:bg-slate-800/30 border-slate-200/70 dark:border-slate-800 hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-black text-xs flex items-center justify-center">
                        Q{qNum}
                      </span>

                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                            Key: <strong className="text-indigo-600 dark:text-indigo-400 font-bold">{officialAnswer || "—"}</strong>
                          </span>
                          {currentOpt ? (
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                isCorrect
                                  ? "bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300"
                                  : "bg-red-100 dark:bg-red-950/80 text-red-700 dark:text-red-300"
                              }`}
                            >
                              {isCorrect ? "Correct" : "Incorrect"}
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400">
                              Unanswered
                            </span>
                          )}

                          {isCorrected && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300">
                              Modified
                            </span>
                          )}
                        </div>

                        {isAmbiguous && (
                          <span className="text-[10px] text-amber-700 dark:text-amber-400 font-medium">
                            {isMultiple ? "Multiple marked circles" : "Ambiguous fill level"}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Option Selector Buttons */}
                    <div className="flex items-center gap-1.5 self-end sm:self-center">
                      {(["A", "B", "C", "D"] as OptionLetter[]).map((opt) => {
                        const isSelected = currentOpt === opt;
                        const isOriginalDetected = detectedOpt === opt;

                        let btnStyle = "bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-indigo-400";
                        if (isSelected) {
                          btnStyle = isCorrect
                            ? "bg-emerald-600 border-emerald-600 text-white shadow-sm ring-2 ring-emerald-500/30"
                            : "bg-indigo-600 border-indigo-600 text-white shadow-sm ring-2 ring-indigo-500/30";
                        } else if (isOriginalDetected) {
                          btnStyle = "bg-slate-100 dark:bg-slate-700/50 border-slate-400 text-slate-500 line-through";
                        }

                        return (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => handleSelectOption(qNum, opt)}
                            className={`w-9 h-9 rounded-lg border font-bold text-xs transition-all flex items-center justify-center ${btnStyle}`}
                            title={`Select option ${opt}`}
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
    </div>
  );
};
