import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Save, ArrowLeft, Sparkles, AlertCircle, CheckCircle2, Hash, Users } from "lucide-react";
import { ExamService } from "../services/api";
import { OptionLetter } from "../types";

export const EditExam: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [className, setClassName] = useState("");
  const [examDate, setExamDate] = useState("");
  const [totalQuestions, setTotalQuestions] = useState<number>(30);

  const [correctMarks, setCorrectMarks] = useState<number>(1);
  const [incorrectMarks, setIncorrectMarks] = useState<number>(0);
  const [unansweredMarks, setUnansweredMarks] = useState<number>(0);

  const [rosterText, setRosterText] = useState("");
  const [answerKey, setAnswerKey] = useState<Record<string, OptionLetter>>({});

  useEffect(() => {
    if (id) {
      loadExam(id);
    }
  }, [id]);

  const loadExam = async (examId: string) => {
    try {
      setLoading(true);
      const data = await ExamService.getById(examId);
      setTitle(data.title);
      setSubject(data.subject);
      setClassName(data.className);
      setExamDate(data.examDate ? new Date(data.examDate).toISOString().split("T")[0] : "");
      setTotalQuestions(data.totalQuestions || 30);
      setCorrectMarks(data.markingScheme?.correctMarks ?? 1);
      setIncorrectMarks(data.markingScheme?.incorrectMarks ?? 0);
      setUnansweredMarks(data.markingScheme?.unansweredMarks ?? 0);

      if (data.roster && data.roster.length > 0) {
        setRosterText(data.roster.map((r: any) => `${r.rollNumber}, ${r.studentName}`).join("\n"));
      }

      const rawKey = data.answerKey instanceof Map ? Object.fromEntries(data.answerKey) : data.answerKey || {};
      setAnswerKey(rawKey as Record<string, OptionLetter>);
    } catch (err: any) {
      console.error("Failed to load exam:", err);
      setError("Failed to load exam details for editing.");
    } finally {
      setLoading(false);
    }
  };

  const handleTotalQuestionsChange = (newCount: number) => {
    const clamped = Math.max(1, Math.min(30, newCount));
    setTotalQuestions(clamped);

    setAnswerKey((prev) => {
      const updated = { ...prev };
      for (let i = 1; i <= clamped; i++) {
        if (!updated[String(i)]) {
          updated[String(i)] = "A";
        }
      }
      return updated;
    });
  };

  const handleOptionSelect = (qNum: number, opt: OptionLetter) => {
    setAnswerKey((prev) => ({
      ...prev,
      [String(qNum)]: opt,
    }));
  };

  const setRandomAnswers = () => {
    const options: OptionLetter[] = ["A", "B", "C", "D"];
    const generated: Record<string, OptionLetter> = {};
    for (let i = 1; i <= totalQuestions; i++) {
      generated[String(i)] = options[Math.floor(Math.random() * options.length)];
    }
    setAnswerKey(generated);
  };

  const setAllToOption = (opt: OptionLetter) => {
    const generated: Record<string, OptionLetter> = {};
    for (let i = 1; i <= totalQuestions; i++) {
      generated[String(i)] = opt;
    }
    setAnswerKey(generated);
  };

  const parseRoster = (text: string) => {
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(/[,;\t\-]/).map((p) => p.trim());
        if (parts.length >= 2) {
          return { rollNumber: parts[0], studentName: parts.slice(1).join(" ") };
        }
        return null;
      })
      .filter((e): e is { rollNumber: string; studentName: string } => Boolean(e && e.rollNumber && e.studentName));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setError(null);
    setSuccessMsg(null);

    if (!title.trim() || !subject.trim() || !className.trim()) {
      setError("Please fill in all exam details (title, subject, and class).");
      return;
    }

    // Trim answerKey to totalQuestions
    const finalKey: Record<string, OptionLetter> = {};
    for (let i = 1; i <= totalQuestions; i++) {
      if (!answerKey[String(i)]) {
        setError(`Please select an answer for question ${i}.`);
        return;
      }
      finalKey[String(i)] = answerKey[String(i)];
    }

    const roster = parseRoster(rosterText);

    try {
      setSaving(true);
      await ExamService.update(id, {
        title,
        subject,
        className,
        examDate,
        totalQuestions,
        answerKey: finalKey,
        markingScheme: {
          correctMarks,
          incorrectMarks,
          unansweredMarks,
        },
        roster: roster.length > 0 ? roster : [],
      });

      setSuccessMsg("Exam and answer key updated successfully! Associated scans have been recalculated.");
      setTimeout(() => {
        navigate(`/exams/${id}`);
      }, 1200);
    } catch (err: any) {
      console.error("Exam update error:", err);
      setError(err.response?.data?.message || "Failed to update examination.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center text-slate-500 dark:text-slate-400 font-medium">
        Loading examination details...
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Back button */}
      <button
        onClick={() => navigate(-1)}
        className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Exam Overview
      </button>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
          Edit Examination & Answer Key
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Modifying the answer key or marking scheme automatically triggers evaluation recalculation for all existing scanned sheets.
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-sm font-medium flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="mb-6 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 text-sm font-medium flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 1. Exam Information */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4 transition-colors">
          <h2 className="text-base font-bold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-3">
            1. Exam Details
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                Exam Title *
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Mid-Term Science Assessment"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                Subject *
              </label>
              <input
                type="text"
                required
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Physics, Mathematics"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                Class / Section *
              </label>
              <input
                type="text"
                required
                value={className}
                onChange={(e) => setClassName(e.target.value)}
                placeholder="e.g. Grade 10-A, Batch 2"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                Exam Date
              </label>
              <input
                type="date"
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-medium"
              />
            </div>
          </div>
        </div>

        {/* 2. Number of Questions Selection */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4 transition-colors">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 gap-2">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Hash className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                2. Number of Questions
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Configure question count from 1 to 30.
              </p>
            </div>
            <div className="flex items-center gap-1.5 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-900 px-3.5 py-1.5 rounded-xl font-bold text-sm self-start sm:self-auto">
              <span>{totalQuestions} Questions</span>
            </div>
          </div>

          <div className="space-y-4">
            {/* Quick Presets */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 mr-1">Presets:</span>
              {[10, 15, 20, 25, 30].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handleTotalQuestionsChange(preset)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    totalQuestions === preset
                      ? "bg-indigo-600 text-white shadow-md scale-105"
                      : "bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
                  }`}
                >
                  {preset} Qs
                </button>
              ))}
            </div>

            {/* Slider & Stepper */}
            <div className="flex items-center gap-4 bg-slate-50/70 dark:bg-slate-800/40 p-3.5 rounded-xl border border-slate-200 dark:border-slate-750">
              <input
                type="range"
                min={1}
                max={30}
                value={totalQuestions}
                onChange={(e) => handleTotalQuestionsChange(Number(e.target.value))}
                className="w-full accent-indigo-600 cursor-pointer"
              />
              <div className="flex items-center gap-2 shrink-0">
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={totalQuestions}
                  onChange={(e) => {
                    const val = Math.max(1, Math.min(30, Number(e.target.value) || 1));
                    handleTotalQuestionsChange(val);
                  }}
                  className="w-16 px-2.5 py-1 text-center font-bold text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">/ 30</span>
              </div>
            </div>
          </div>
        </div>

        {/* 3. Marking Scheme */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4 transition-colors">
          <h2 className="text-base font-bold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-3">
            3. Marking Scheme
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                Marks for Correct
              </label>
              <input
                type="number"
                step="0.5"
                min="0.5"
                value={correctMarks}
                onChange={(e) => setCorrectMarks(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                Penalty for Incorrect
              </label>
              <input
                type="number"
                step="0.25"
                min="0"
                value={incorrectMarks}
                onChange={(e) => setIncorrectMarks(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-medium"
              />
              <span className="text-[11px] text-slate-500 dark:text-slate-400">e.g. 0.25 for negative marking</span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                Unanswered Marks
              </label>
              <input
                type="number"
                step="0.5"
                value={unansweredMarks}
                onChange={(e) => setUnansweredMarks(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-medium"
              />
            </div>
          </div>
        </div>

        {/* 4. Student Roster (Optional) */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4 transition-colors">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                4. Student Roster (Optional)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Paste student roll numbers and names for automatic cross-validation of handwritten names.
              </p>
            </div>
          </div>

          <div>
            <textarea
              rows={4}
              value={rosterText}
              onChange={(e) => setRosterText(e.target.value)}
              placeholder={`e.g. one per line:\n2026101, Pika Singh\n2026102, Virendra Singh\n2026103, Azad Jaiswar\n2026104, Jeet D. Rawat`}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs font-mono"
            />
            <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 block">
              Format: <code>RollNumber, Student Name</code> (comma or tab separated).
            </span>
          </div>
        </div>

        {/* 5. Answer Key Editor */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4 transition-colors">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 gap-2">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                5. Official Answer Key ({totalQuestions} Questions)
              </h2>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Select the correct option for each question (1 to {totalQuestions}).
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mr-1">Set all:</span>
              {(["A", "B", "C", "D"] as OptionLetter[]).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setAllToOption(opt)}
                  className="px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs transition-colors"
                >
                  {opt}
                </button>
              ))}
              <button
                type="button"
                onClick={setRandomAnswers}
                className="ml-1 px-3 py-1 rounded-md bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 text-xs font-semibold hover:bg-indigo-100 dark:hover:bg-indigo-900 transition-colors flex items-center gap-1"
              >
                <Sparkles className="w-3 h-3" />
                Randomize
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2 pt-2">
            {Array.from({ length: totalQuestions }, (_, i) => i + 1).map((qNum) => {
              const selectedOpt = answerKey[String(qNum)];
              return (
                <div
                  key={qNum}
                  className="flex items-center justify-between py-2 px-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                >
                  <span className="font-bold text-sm text-slate-700 dark:text-slate-300 w-10">
                    {String(qNum).padStart(2, "0")}.
                  </span>

                  <div className="flex items-center gap-2">
                    {(["A", "B", "C", "D"] as OptionLetter[]).map((opt) => {
                      const isSelected = selectedOpt === opt;
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => handleOptionSelect(qNum, opt)}
                          className={`w-9 h-9 rounded-full font-bold text-xs flex items-center justify-center transition-all ${
                            isSelected
                              ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30 scale-105"
                              : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
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

        {/* Submit action */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="px-5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm transition-all shadow-md shadow-indigo-600/25 flex items-center gap-2 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? "Updating Exam..." : "Update Examination & Recalculate"}
          </button>
        </div>
      </form>
    </div>
  );
};
