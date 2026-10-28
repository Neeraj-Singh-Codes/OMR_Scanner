/**
 * Unified Database Storage Layer with Graceful In-Memory Fallback.
 * If MongoDB is running, uses persistent Mongoose models.
 * If MongoDB is not yet running, transparently uses memory storage
 * so the application can be tested immediately on any machine without setup friction.
 */

import mongoose from "mongoose";
import { Exam } from "../models/Exam.js";
import { ScanResult } from "../models/ScanResult.js";

// In-Memory Fallback Maps
const memoryExams = new Map();
const memoryScanResults = new Map();

function isMongoConnected() {
  return mongoose.connection.readyState === 1;
}

function generateId() {
  return new mongoose.Types.ObjectId().toString();
}

export const dbStore = {
  isUsingMemoryFallback() {
    return !isMongoConnected();
  },

  async createExam(data) {
    if (isMongoConnected()) {
      const exam = new Exam(data);
      return await exam.save();
    }
    const id = generateId();
    const doc = {
      _id: id,
      ...data,
      totalQuestions: data.totalQuestions || (data.answerKey ? Object.keys(data.answerKey).length : 30),
      markingScheme: data.markingScheme || { correctMarks: 1, incorrectMarks: 0, unansweredMarks: 0 },
      roster: data.roster || [],
      templateVersion: "OMR-V1.0",
      createdAt: new Date(),
      updatedAt: new Date(),
      toObject() {
        return { ...this };
      },
    };
    memoryExams.set(id, doc);
    return doc;
  },

  async findExams() {
    if (isMongoConnected()) {
      return await Exam.find().sort({ createdAt: -1 }).lean();
    }
    return Array.from(memoryExams.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  },

  async findExamById(id) {
    if (isMongoConnected()) {
      return await Exam.findById(id);
    }
    return memoryExams.get(String(id)) || null;
  },

  async updateExam(id, updateData) {
    if (isMongoConnected()) {
      const exam = await Exam.findById(id);
      if (!exam) return null;
      Object.assign(exam, updateData);
      return await exam.save();
    }
    const existing = memoryExams.get(String(id));
    if (!existing) return null;
    const updated = {
      ...existing,
      ...updateData,
      updatedAt: new Date(),
      toObject() {
        return { ...this };
      },
    };
    memoryExams.set(String(id), updated);
    return updated;
  },

  async deleteExam(id) {
    if (isMongoConnected()) {
      await ScanResult.deleteMany({ examId: id });
      return await Exam.findByIdAndDelete(id);
    }
    memoryExams.delete(String(id));
    for (const [key, scan] of memoryScanResults.entries()) {
      if (String(scan.examId) === String(id)) {
        memoryScanResults.delete(key);
      }
    }
    return true;
  },

  async createScanResult(data) {
    if (isMongoConnected()) {
      const scan = new ScanResult(data);
      return await scan.save();
    }
    const id = generateId();
    const doc = {
      _id: id,
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
      toObject() {
        return { ...this };
      },
    };
    memoryScanResults.set(id, doc);
    return doc;
  },

  async findScanResultById(id) {
    if (isMongoConnected()) {
      return await ScanResult.findById(id).populate("examId");
    }
    const scan = memoryScanResults.get(String(id));
    if (!scan) return null;
    const exam = memoryExams.get(String(scan.examId));
    return {
      ...scan,
      examId: exam || scan.examId,
      toObject() {
        return { ...this };
      },
    };
  },

  async updateScanResult(id, updateData) {
    if (isMongoConnected()) {
      const scan = await ScanResult.findById(id);
      if (!scan) return null;
      Object.assign(scan, updateData);
      return await scan.save();
    }
    const existing = memoryScanResults.get(String(id));
    if (!existing) return null;
    const updated = {
      ...existing,
      ...updateData,
      updatedAt: new Date(),
      toObject() {
        return { ...this };
      },
    };
    memoryScanResults.set(String(id), updated);
    return updated;
  },

  async findScanResults(query = {}, sortOptions = { score: -1 }, projection = null) {
    if (isMongoConnected()) {
      let q = ScanResult.find(query);
      if (projection) {
        q = q.select(projection);
      }
      return await q.sort(sortOptions).lean();
    }
    let list = Array.from(memoryScanResults.values());
    if (query.examId) {
      list = list.filter((r) => String(r.examId) === String(query.examId));
    }
    if (query.reviewStatus) {
      list = list.filter((r) => r.reviewStatus === query.reviewStatus);
    }
    if (query.rollNumber) {
      list = list.filter((r) => r.rollNumber === query.rollNumber);
    }
    if (query.$or) {
      list = list.filter((r) => {
        return query.$or.some((clause) => {
          if (clause.studentName) {
            const regex = new RegExp(clause.studentName.$regex, clause.studentName.$options);
            return regex.test(r.studentName);
          }
          if (clause.rollNumber) {
            const regex = new RegExp(clause.rollNumber.$regex, clause.rollNumber.$options);
            return regex.test(r.rollNumber);
          }
          return false;
        });
      });
    }

    // Sort
    const [sortKey, sortDir] = Object.entries(sortOptions)[0] || ["score", -1];
    list.sort((a, b) => {
      const valA = a[sortKey] ?? 0;
      const valB = b[sortKey] ?? 0;
      return sortDir === 1 ? (valA > valB ? 1 : -1) : valA < valB ? 1 : -1;
    });

    return list;
  },

  async countScans(query = {}) {
    if (isMongoConnected()) {
      return await ScanResult.countDocuments(query);
    }
    let list = Array.from(memoryScanResults.values());
    if (query.examId) {
      list = list.filter((r) => String(r.examId) === String(query.examId));
    }
    if (query.reviewRequired !== undefined) {
      list = list.filter((r) => r.reviewRequired === query.reviewRequired);
    }
    return list.length;
  },
};
