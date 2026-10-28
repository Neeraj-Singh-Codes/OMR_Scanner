import axios from "axios";
import { Exam, ScanResult, BatchUploadResponse } from "../types";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "/api",
  timeout: 120000, // 2 minutes for batch operations (50-100 files)
});

export const ExamService = {
  async getAll(): Promise<Exam[]> {
    const res = await api.get<{ success: boolean; data: Exam[] }>("/exams");
    return res.data.data;
  },

  async getById(id: string): Promise<Exam> {
    const res = await api.get<{ success: boolean; data: Exam }>(`/exams/${id}`);
    return res.data.data;
  },

  async create(data: Partial<Exam>): Promise<Exam> {
    const res = await api.post<{ success: boolean; data: Exam }>("/exams", data);
    return res.data.data;
  },

  async update(id: string, data: Partial<Exam>): Promise<Exam> {
    const res = await api.put<{ success: boolean; data: Exam }>(`/exams/${id}`, data);
    return res.data.data;
  },

  getTemplatePdfUrl(id: string): string {
    const base = import.meta.env.VITE_API_BASE_URL || "/api";
    return `${base}/exams/${id}/template`;
  },
};

export const ScanService = {
  async uploadScan(
    formData: FormData,
    onProgress?: (percent: number) => void
  ): Promise<{ success: boolean; data: ScanResult; message?: string }> {
    const res = await api.post<{ success: boolean; data: ScanResult; message?: string }>("/scans", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
      onUploadProgress: (progressEvent) => {
        if (progressEvent.total && onProgress) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(percent);
        }
      },
    });
    return res.data;
  },

  async uploadBatch(
    formData: FormData,
    onProgress?: (percent: number) => void
  ): Promise<BatchUploadResponse> {
    const res = await api.post<BatchUploadResponse>("/scans/batch", formData, {
      timeout: 600000, // 10 minutes timeout for 50-100 sheets
      headers: {
        "Content-Type": "multipart/form-data",
      },
      onUploadProgress: (progressEvent) => {
        if (progressEvent.total && onProgress) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(percent);
        }
      },
    });
    return res.data;
  },

  async getById(id: string): Promise<ScanResult> {
    const res = await api.get<{ success: boolean; data: ScanResult }>(`/scans/${id}`);
    return res.data.data;
  },

  async review(
    id: string,
    data: {
      studentName?: string;
      rollNumber?: string;
      correctedAnswers?: Record<string, string | null>;
    }
  ): Promise<ScanResult> {
    const res = await api.put<{ success: boolean; data: ScanResult }>(`/scans/${id}/review`, data);
    return res.data.data;
  },

  async finalize(id: string): Promise<ScanResult> {
    const res = await api.post<{ success: boolean; data: ScanResult }>(`/scans/${id}/finalize`);
    return res.data.data;
  },

  async getExamResults(
    examId: string,
    params?: { search?: string; reviewStatus?: string; sortBy?: string; sortOrder?: string }
  ): Promise<ScanResult[]> {
    const res = await api.get<{ success: boolean; data: ScanResult[] }>(`/exams/${examId}/results`, { params });
    return res.data.data;
  },

  getResultsExportCsvUrl(examId: string): string {
    const base = import.meta.env.VITE_API_BASE_URL || "/api";
    return `${base}/exams/${examId}/results/export`;
  },
};
