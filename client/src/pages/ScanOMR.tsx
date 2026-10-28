import React, { useState, useEffect } from "react";



import { useNavigate, useSearchParams, Link } from "react-router-dom";



import {



  Camera,



  Upload,



  AlertCircle,



  RefreshCw,



  ArrowRight,



  X,



  Layers,



  FileCheck,



  AlertTriangle,



  CheckCircle2,



  ChevronDown,



  Sparkles,



  ExternalLink,



} from "lucide-react";



import { CameraCapture } from "../components/CameraCapture";



import { ExamService, ScanService } from "../services/api";



import { Exam, BatchItemResult } from "../types";







export const ScanOMR: React.FC = () => {



  const navigate = useNavigate();



  const [searchParams] = useSearchParams();



  const preselectedExamId = searchParams.get("examId") || "";







  const [exams, setExams] = useState<Exam[]>([]);



  const [selectedExamId, setSelectedExamId] = useState<string>(preselectedExamId);







  // Tab mode: "single" or "batch"



  const [scanMode, setScanMode] = useState<"single" | "batch">("single");







  // Single scan states



  const [selectedFile, setSelectedFile] = useState<File | Blob | null>(null);



  const [previewUrl, setPreviewUrl] = useState<string | null>(null);



  const [studentName, setStudentName] = useState<string>("");



  const [rollNumber, setRollNumber] = useState<string>("");



  const [showManualOverride, setShowManualOverride] = useState<boolean>(false);







  // Batch scan states



  const [batchFiles, setBatchFiles] = useState<File[]>([]);



  const [batchResults, setBatchResults] = useState<BatchItemResult[] | null>(null);



  const [batchSummary, setBatchSummary] = useState<{



    totalFiles: number;



    successfulCount: number;



    failedCount: number;



    reviewRequiredCount: number;



  } | null>(null);







  const [isCameraOpen, setIsCameraOpen] = useState(false);



  const [uploadProgress, setUploadProgress] = useState<number | null>(null);



  const [processing, setProcessing] = useState(false);



  const [error, setError] = useState<string | null>(null);







  useEffect(() => {



    ExamService.getAll().then((data) => {



      setExams(data);



      if (!selectedExamId && data.length > 0) {



        setSelectedExamId(data[0]._id);



      }



    });



  }, [selectedExamId]);







  // Single file selection



  const handleSingleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {



    const file = e.target.files?.[0];



    if (file) {



      setSelectedFile(file);



      setPreviewUrl(URL.createObjectURL(file));



      setError(null);



    }



  };







  const handleCameraCapture = (blob: Blob) => {



    setSelectedFile(blob);



    setPreviewUrl(URL.createObjectURL(blob));



    setIsCameraOpen(false);



    setError(null);



  };







  const clearSingleSelection = () => {



    setSelectedFile(null);



    if (previewUrl) {



      URL.revokeObjectURL(previewUrl);



    }



    setPreviewUrl(null);



    setError(null);



  };







  // Batch files selection (up to 100 images)



  const handleBatchFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {



    if (e.target.files && e.target.files.length > 0) {



      const filesArray = Array.from(e.target.files);



      if (filesArray.length > 100) {



        setError(`You selected ${filesArray.length} files. Batch uploads are capped at 100 files at a time.`);



        setBatchFiles(filesArray.slice(0, 100));



      } else {



        setError(null);



        setBatchFiles(filesArray);



      }



      setBatchResults(null);



      setBatchSummary(null);



    }



  };







  const clearBatchFiles = () => {



    setBatchFiles([]);



    setBatchResults(null);



    setBatchSummary(null);



    setError(null);



  };







  // Submit Single Scan



  const handleSingleSubmit = async (e: React.FormEvent) => {



    e.preventDefault();



    if (!selectedExamId) {



      setError("Please select an examination first.");



      return;



    }



    if (!selectedFile) {



      setError("Please capture or upload an answer sheet image.");



      return;



    }







    try {



      setProcessing(true);



      setError(null);



      setUploadProgress(15);







      const formData = new FormData();



      formData.append("examId", selectedExamId);







      // Only append if user explicitly typed a manual override



      if (studentName.trim()) {



        formData.append("studentName", studentName.trim());



      }



      if (rollNumber.trim()) {



        formData.append("rollNumber", rollNumber.trim());



      }







      const fileToUpload =



        selectedFile instanceof File



          ? selectedFile



          : new File([selectedFile], "omr_camera_capture.jpg", { type: "image/jpeg" });







      formData.append("image", fileToUpload);







      const response = await ScanService.uploadScan(formData, (percent) => {



        setUploadProgress(percent);



      });







      if (response.success && response.data) {



        navigate(`/scans/${response.data._id}/review`);



      }



    } catch (err: any) {



      console.error("Scan processing error:", err);



      const resData = err.response?.data;



      if (resData?.error_code === "MARKER_NOT_FOUND") {



        setError("Could not detect sheet content or question grid. Please ensure questions and student details are clearly visible, flat, and well-lit.");



      } else if (resData?.error_code === "IMAGE_BLURRY") {



        setError("The captured image is too blurry to detect bubbles accurately. Please steady your camera and retake.");



      } else if (resData?.message) {



        setError(resData.message);



      } else {



        setError("Failed to process scan. Please verify server connectivity.");



      }



    } finally {



      setProcessing(false);



      setUploadProgress(null);



    }



  };







  // Submit Batch Scans (50 - 100 files)



  const handleBatchSubmit = async (e: React.FormEvent) => {



    e.preventDefault();



    if (!selectedExamId) {



      setError("Please select an examination first.");



      return;



    }



    if (batchFiles.length === 0) {



      setError("Please select answer sheet files for batch upload.");



      return;



    }







    try {



      setProcessing(true);



      setError(null);



      setUploadProgress(10);



      setBatchResults(null);



      setBatchSummary(null);







      const formData = new FormData();



      formData.append("examId", selectedExamId);







      batchFiles.forEach((file) => {



        formData.append("images", file);



      });







      const response = await ScanService.uploadBatch(formData, (percent) => {



        setUploadProgress(percent);



      });







      if (response.success && response.data) {



        setBatchResults(response.data.results);



        setBatchSummary({



          totalFiles: response.data.totalFiles,



          successfulCount: response.data.successfulCount,



          failedCount: response.data.failedCount,



          reviewRequiredCount: response.data.reviewRequiredCount,



        });



      }



    } catch (err: any) {



      console.error("Batch processing error:", err);



      const resData = err.response?.data;



      setError(resData?.message || "Failed to process batch scans. Check service connection.");



    } finally {



      setProcessing(false);



      setUploadProgress(null);



    }



  };







  const selectedExam = exams.find((e) => e._id === selectedExamId);







  return (



    <div className="max-w-4xl mx-auto px-4 py-8">



      {/* Header */}



      <div className="mb-6 text-center sm:text-left">



        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">



          Scan OMR Answer Sheets



        </h1>



        <p className="text-slate-600 dark:text-slate-400 mt-1 text-sm sm:text-base">



          Automated evaluation with OCR detection of student name and roll number.



        </p>



      </div>







      {/* Mode Switcher Tabs */}



      <div className="flex p-1.5 mb-6 bg-slate-100 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">



        <button



          type="button"



          onClick={() => {



            setScanMode("single");



            setError(null);



          }}



          className={`flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 ${



            scanMode === "single"



              ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm"



              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"



          }`}



        >



          <Camera className="w-4 h-4" />



          Single Sheet (Camera / Photo)



        </button>







        <button



          type="button"



          onClick={() => {



            setScanMode("batch");



            setError(null);



          }}



          className={`flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 ${



            scanMode === "batch"



              ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm"



              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"



          }`}



        >



          <Layers className="w-4 h-4" />



          Batch Upload (50–100 Sheets)



          <span className="ml-1 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-extrabold">



            Bulk



          </span>



        </button>



      </div>







      {/* Automated OCR Feature Callout Banner */}



      <div className="mb-6 p-4 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200/60 dark:border-indigo-900/40 flex items-start gap-3">



        <Sparkles className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />



        <div className="text-xs sm:text-sm text-indigo-950 dark:text-indigo-200">



          <strong className="font-bold">Automated Student Name & Roll Number Recognition:</strong>



          <p className="mt-0.5 text-xs text-indigo-800 dark:text-indigo-300 leading-relaxed">



            You do not need to manually enter student names or roll numbers. The vision engine automatically reads candidate details directly from the sheet header. If any digit or handwriting is ambiguous or uncertain, it will be flagged for your quick verification.



          </p>



        </div>



      </div>







      {error && (



        <div className="mb-6 p-4 rounded-2xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 flex items-start gap-3 text-sm">



          <AlertCircle className="w-5 h-5 text-red-500 dark:text-red-400 shrink-0 mt-0.5" />



          <div>



            <h4 className="font-bold">Scan Notice</h4>



            <p className="mt-0.5 text-xs text-red-600 dark:text-red-300/90 leading-relaxed">{error}</p>



          </div>



        </div>



      )}







      {/* Exam Selector */}



      <div className="mb-6 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-3 transition-colors">



        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">



          Target Examination *



        </label>



        <select



          required



          value={selectedExamId}



          onChange={(e) => setSelectedExamId(e.target.value)}



          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-medium"



        >



          {exams.length === 0 ? (



            <option value="">No exams available - please create one first</option>



          ) : (



            exams.map((ex) => (



              <option key={ex._id} value={ex._id}>



                {ex.title} ({ex.className} - {ex.subject}) • {ex.totalQuestions} Questions



              </option>



            ))



          )}



        </select>







        {selectedExam && (



          <p className="text-xs text-slate-500 dark:text-slate-400">



            Selected: <strong className="text-slate-700 dark:text-slate-300">{selectedExam.title}</strong> • Marking: +{selectedExam.markingScheme.correctMarks} / {selectedExam.markingScheme.incorrectMarks} • Total Scans to date: {selectedExam.totalScans || 0}



          </p>



        )}



      </div>







      {/* ======================================================== */}



      {/* MODE 1: SINGLE SCAN                                       */}



      {/* ======================================================== */}



      {scanMode === "single" && (



        <form onSubmit={handleSingleSubmit} className="space-y-6">



          {/* Capture or Upload Zone */}



          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4 transition-colors">



            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">



              OMR Answer Sheet Image *



            </label>







            {previewUrl ? (



              <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-900 flex items-center justify-center max-h-96">



                <img src={previewUrl} alt="Preview" className="w-full h-full object-contain max-h-96" />



                <button



                  type="button"



                  onClick={clearSingleSelection}



                  className="absolute top-3 right-3 p-2 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"



                  title="Remove Image"



                >



                  <X className="w-4 h-4" />



                </button>



              </div>



            ) : (



              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">



                {/* Mobile Camera Option */}



                <button



                  type="button"



                  onClick={() => setIsCameraOpen(true)}



                  className="p-6 rounded-2xl border-2 border-dashed border-indigo-200 dark:border-indigo-800/80 bg-indigo-50/40 dark:bg-indigo-950/30 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 hover:border-indigo-400 dark:hover:border-indigo-600 transition-all flex flex-col items-center justify-center text-center gap-2 group"



                >



                  <div className="w-12 h-12 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-md group-hover:scale-105 transition-transform">



                    <Camera className="w-6 h-6" />



                  </div>



                  <span className="font-bold text-slate-800 dark:text-slate-200 text-sm">Open Mobile Camera</span>



                  <span className="text-[11px] text-slate-500 dark:text-slate-400">Live preview with alignment guides</span>



                </button>







                {/* File Upload Option */}



                <label className="p-6 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500 bg-slate-50/50 dark:bg-slate-800/40 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all flex flex-col items-center justify-center text-center gap-2 cursor-pointer group">



                  <input



                    type="file"



                    accept="image/jpeg,image/png,image/webp"



                    onChange={handleSingleFileChange}



                    className="hidden"



                  />



                  <div className="w-12 h-12 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 flex items-center justify-center group-hover:scale-105 transition-transform">



                    <Upload className="w-6 h-6" />



                  </div>



                  <span className="font-bold text-slate-800 dark:text-slate-200 text-sm">Upload Photo File</span>



                  <span className="text-[11px] text-slate-500 dark:text-slate-400">JPEG, PNG up to 15MB</span>



                </label>



              </div>



            )}







            {/* Optional Collapsible Manual Override */}



            <div className="pt-2 border-t border-slate-100 dark:border-slate-800">



              <button



                type="button"



                onClick={() => setShowManualOverride(!showManualOverride)}



                className="text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-1 transition-colors"



              >



                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showManualOverride ? "rotate-180" : ""}`} />



                {showManualOverride ? "Hide Manual Identification Override" : "Optional: Manual Candidate Override"}



              </button>







              {showManualOverride && (



                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60">



                  <div>



                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">



                      Student Name (Preset Override)



                    </label>



                    <input



                      type="text"



                      value={studentName}



                      onChange={(e) => setStudentName(e.target.value)}



                      placeholder="Leave empty for auto OCR"



                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs font-medium"



                    />



                  </div>







                  <div>



                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">



                      Roll Number (Preset Override)



                    </label>



                    <input



                      type="text"



                      value={rollNumber}



                      onChange={(e) => setRollNumber(e.target.value)}



                      placeholder="Leave empty for auto OCR"



                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs font-mono font-medium"



                    />



                  </div>



                </div>



              )}



            </div>







            {/* Progress Indicator */}



            {processing && (



              <div className="pt-2">



                <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">



                  <span className="flex items-center gap-2">



                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-600 dark:text-indigo-400" />



                    Evaluating bubbles & recognizing student info...



                  </span>



                  <span>{uploadProgress || 60}%</span>



                </div>



                <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">



                  <div



                    className="h-full bg-indigo-600 rounded-full transition-all duration-300"



                    style={{ width: `${uploadProgress || 60}%` }}



                  />



                </div>



              </div>



            )}



          </div>







          {/* Submit Action */}



          <button



            type="submit"



            disabled={processing || !selectedFile || !selectedExamId}



            className="w-full py-3.5 px-6 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-base transition-all shadow-md shadow-indigo-600/20 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"



          >



            {processing ? (



              <>



                <RefreshCw className="w-5 h-5 animate-spin" />



                Evaluating Sheet...



              </>



            ) : (



              <>



                Evaluate Sheet & Auto-Detect Student



                <ArrowRight className="w-5 h-5" />



              </>



            )}



          </button>



        </form>



      )}







      {/* ======================================================== */}



      {/* MODE 2: BATCH SCAN (50 - 100 IMAGES)                      */}



      {/* ======================================================== */}



      {scanMode === "batch" && (



        <div className="space-y-6">



          <form onSubmit={handleBatchSubmit} className="space-y-6">



            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-5 transition-colors">



              <div className="flex items-center justify-between">



                <div>



                  <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">



                    Batch Answer Sheet Upload



                  </h3>



                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">



                    Select between 1 and 100 OMR sheet photographs at once.



                  </p>



                </div>



                {batchFiles.length > 0 && (



                  <button



                    type="button"



                    onClick={clearBatchFiles}



                    className="text-xs text-red-600 dark:text-red-400 hover:underline font-semibold"



                  >



                    Clear All



                  </button>



                )}



              </div>







              {/* Multi-file Dropzone */}



              <label className="p-8 rounded-2xl border-2 border-dashed border-indigo-200 dark:border-indigo-800/80 bg-indigo-50/30 dark:bg-indigo-950/20 hover:border-indigo-400 dark:hover:border-indigo-600 transition-all flex flex-col items-center justify-center text-center gap-3 cursor-pointer group">



                <input



                  type="file"



                  multiple



                  accept="image/jpeg,image/png,image/webp"



                  onChange={handleBatchFilesChange}



                  className="hidden"



                  disabled={processing}



                />



                <div className="w-14 h-14 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">



                  <Upload className="w-7 h-7" />



                </div>



                <div>



                  <span className="font-bold text-slate-800 dark:text-slate-200 text-base block">



                    Choose 50 to 100 Sheet Photographs



                  </span>



                  <span className="text-xs text-slate-500 dark:text-slate-400 mt-1 block">



                    Drag and drop files here, or click to browse your folders



                  </span>



                </div>



                <span className="text-[11px] px-3 py-1 rounded-full bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 font-medium">



                  JPEG, PNG, WebP • Max 100 images per batch



                </span>



              </label>







              {/* Selected Files Badge */}



              {batchFiles.length > 0 && (



                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 flex items-center justify-between">



                  <div className="flex items-center gap-3">



                    <div className="w-9 h-9 rounded-lg bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 flex items-center justify-center font-bold text-sm">



                      {batchFiles.length}



                    </div>



                    <div>



                      <strong className="text-xs sm:text-sm text-slate-900 dark:text-white font-bold block">



                        {batchFiles.length} Sheet Photographs Ready for Evaluation



                      </strong>



                      <span className="text-[11px] text-slate-500 dark:text-slate-400">



                        Total Size: {(batchFiles.reduce((acc, f) => acc + f.size, 0) / (1024 * 1024)).toFixed(1)} MB



                      </span>



                    </div>



                  </div>







                  <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200/50">



                    Ready to Upload



                  </span>



                </div>



              )}







              {/* Batch Processing Progress Bar */}



              {processing && (



                <div className="pt-2 space-y-2">



                  <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-300">



                    <span className="flex items-center gap-2">



                      <RefreshCw className="w-4 h-4 animate-spin text-indigo-600 dark:text-indigo-400" />



                      Evaluating batch of {batchFiles.length} sheets (Computer Vision + Candidate OCR)...



                    </span>



                    <span>{uploadProgress || 45}%</span>



                  </div>



                  <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">



                    <div



                      className="h-full bg-gradient-to-r from-indigo-600 to-emerald-500 rounded-full transition-all duration-300"



                      style={{ width: `${uploadProgress || 45}%` }}



                    />



                  </div>



                  <p className="text-[11px] text-slate-500 dark:text-slate-400 italic">



                    Sheets are processed concurrently. This takes only ~15–30 seconds for 50–100 sheets.



                  </p>



                </div>



              )}



            </div>







            {/* Submit Action */}



            <button



              type="submit"



              disabled={processing || batchFiles.length === 0 || !selectedExamId}



              className="w-full py-4 px-6 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-base transition-all shadow-md shadow-indigo-600/20 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"



            >



              {processing ? (



                <>



                  <RefreshCw className="w-5 h-5 animate-spin" />



                  Processing Batch ({batchFiles.length} Sheets)...



                </>



              ) : (



                <>



                  Start Batch Evaluation ({batchFiles.length} Sheets)



                  <ArrowRight className="w-5 h-5" />



                </>



              )}



            </button>



          </form>







          {/* ======================================================== */}



          {/* BATCH COMPLETION SUMMARY & RESULTS TABLE                 */}



          {/* ======================================================== */}



          {batchSummary && batchResults && (



            <div className="space-y-6 pt-4 animate-fadeIn">



              {/* Summary KPIs */}



              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">



                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm">



                  <span className="text-[11px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider">



                    Total Uploaded



                  </span>



                  <p className="text-2xl font-black text-slate-900 dark:text-white mt-0.5">



                    {batchSummary.totalFiles}



                  </p>



                </div>







                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-emerald-200 dark:border-emerald-900/60 shadow-sm bg-emerald-50/20">



                  <span className="text-[11px] text-emerald-600 dark:text-emerald-400 uppercase font-bold tracking-wider">



                    Successfully Evaluated



                  </span>



                  <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-0.5">



                    {batchSummary.successfulCount}



                  </p>



                </div>







                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-amber-200 dark:border-amber-900/60 shadow-sm bg-amber-50/20">



                  <span className="text-[11px] text-amber-600 dark:text-amber-400 uppercase font-bold tracking-wider">



                    Requires Teacher Review



                  </span>



                  <p className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-0.5">



                    {batchSummary.reviewRequiredCount}



                  </p>



                </div>







                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-red-200 dark:border-red-900/60 shadow-sm bg-red-50/20">



                  <span className="text-[11px] text-red-600 dark:text-red-400 uppercase font-bold tracking-wider">



                    Failed / Rejected



                  </span>



                  <p className="text-2xl font-black text-red-600 dark:text-red-400 mt-0.5">



                    {batchSummary.failedCount}



                  </p>



                </div>



              </div>







              {/* Navigation Action Buttons */}



              <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-slate-900 text-white shadow-md">



                <div className="text-xs sm:text-sm">



                  <span className="font-bold text-white block">Batch Evaluation Completed!</span>



                  <span className="text-slate-300 text-xs">



                    {batchSummary.reviewRequiredCount > 0



                      ? `${batchSummary.reviewRequiredCount} sheet(s) have ambiguous roll numbers or answers needing verification.`



                      : "All sheets were confidently identified and evaluated."}



                  </span>



                </div>







                <div className="flex items-center gap-2">



                  <Link



                    to={`/exams/${selectedExamId}`}



                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-bold transition-colors"



                  >



                    View Exam Results



                  </Link>



                </div>



              </div>







              {/* Itemized Batch Results List */}



              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden transition-colors">



                <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">



                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">



                    Itemized Sheet Results ({batchResults.length})



                  </h4>



                  <span className="text-[11px] text-slate-500 dark:text-slate-400">



                    Click "Review" on any flagged sheet to verify details



                  </span>



                </div>







                <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[500px] overflow-y-auto">



                  {batchResults.map((item, idx) => (



                    <div



                      key={idx}



                      className="p-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors flex items-center justify-between gap-3 text-xs"



                    >



                      {/* File & Student info */}



                      <div className="flex items-center gap-3 min-w-0">



                        <div



                          className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 font-bold ${



                            item.success



                              ? item.reviewRequired



                                ? "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300"



                                : "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300"



                              : item.isFailedScan



                              ? "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300"



                              : "bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300"



                          }`}



                        >



                          {item.success ? (



                            item.reviewRequired ? (



                              <AlertTriangle className="w-4 h-4" />



                            ) : (



                              <CheckCircle2 className="w-4 h-4" />



                            )



                          ) : item.isFailedScan ? (



                            <AlertTriangle className="w-4 h-4" />



                          ) : (



                            <X className="w-4 h-4" />



                          )}



                        </div>







                        <div className="min-w-0">



                          <div className="flex flex-wrap items-center gap-1.5">



                            <span className="font-bold text-slate-900 dark:text-white truncate">



                              {item.studentName || item.fileName}



                            </span>



                            {item.isFailedScan && (



                              <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-[10px] font-bold text-amber-700 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/60">



                                Image Kept Intact • Fill Details



                              </span>



                            )}



                            {item.rollNumber && !item.isFailedScan && (



                              <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-mono text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">



                                Roll: {item.rollNumber}



                              </span>



                            )}



                            {item.rosterMatch?.matched && (



                              <span className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/60">



                                ✓ Roster



                              </span>



                            )}



                            {item.nameFlagged && (



                              <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-[10px] font-bold text-amber-700 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/60">



                                Name Review



                              </span>



                            )}



                            {item.rollNumberFlagged && (



                              <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-[10px] font-bold text-amber-700 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/60">



                                Roll Review



                              </span>



                            )}



                            {(item.nameCrossedOutDetected || item.rollCrossedOutDetected) && (



                              <span className="px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-950/60 text-[10px] font-bold text-rose-700 dark:text-rose-300 border border-rose-200/60 dark:border-rose-800/60">



                                Crossed-Out



                              </span>



                            )}



                          </div>



                          <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate block">



                            File: {item.fileName}



                            {item.nameReason ? ` • ${item.nameReason}` : ""}



                            {item.rollNumberReason ? ` • ${item.rollNumberReason}` : ""}



                            {item.error ? ` • Error: ${item.error}` : ""}



                          </span>



                        </div>



                      </div>







                      {/* Score & Actions */}



                      <div className="flex items-center gap-3 shrink-0">



                        {item.success && (



                          <div className="text-right">



                            <strong className="text-slate-900 dark:text-white font-black block">



                              {item.score} / {item.maximumMarks}



                            </strong>



                            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">



                              {item.percentage}%



                            </span>



                          </div>



                        )}







                        {item.scanId ? (



                          <Link



                            to={`/scans/${item.scanId}/review`}



                            className={`px-3 py-1.5 rounded-lg font-bold text-[11px] transition-colors flex items-center gap-1 ${



                              item.isFailedScan



                                ? "bg-indigo-600 hover:bg-indigo-700 text-white"



                                : item.reviewRequired



                                ? "bg-amber-500 hover:bg-amber-600 text-white"



                                : "bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300"



                            }`}



                          >



                            {item.isFailedScan ? "View Image & Fill Details" : "Review"}



                            <ExternalLink className="w-3 h-3" />



                          </Link>



                        ) : (



                          <span className="text-[11px] text-red-500 font-semibold">Failed</span>



                        )}



                      </div>



                    </div>



                  ))}



                </div>



              </div>



            </div>



          )}



        </div>



      )}







      {/* Fullscreen Camera Modal for Single Capture */}



      {isCameraOpen && (



        <CameraCapture



          onCapture={handleCameraCapture}



          onClose={() => setIsCameraOpen(false)}



        />



      )}



    </div>



  );



};



