import mongoose from "mongoose";

const examSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Exam title is required"],
      trim: true,
      maxlength: [100, "Title cannot exceed 100 characters"],
    },
    subject: {
      type: String,
      required: [true, "Subject is required"],
      trim: true,
      maxlength: [50, "Subject cannot exceed 50 characters"],
    },
    className: {
      type: String,
      required: [true, "Class or section is required"],
      trim: true,
      maxlength: [50, "Class name cannot exceed 50 characters"],
    },
    examDate: {
      type: Date,
      default: Date.now,
    },
    totalQuestions: {
      type: Number,
      required: [true, "Total questions is required"],
      min: [1, "Exam must have at least 1 question"],
      max: [30, "Standard template supports up to 30 questions"],
      default: 30,
    },
    answerKey: {
      type: Map,
      of: {
        type: String,
        enum: ["A", "B", "C", "D"],
        uppercase: true,
      },
      required: [true, "Answer key is required"],
      validate: {
        validator: function (v) {
          return v && v.size > 0 && v.size <= 30;
        },
        message: "Answer key must contain between 1 and 30 questions",
      },
    },
    markingScheme: {
      correctMarks: {
        type: Number,
        default: 1,
        min: [0.1, "Correct marks must be positive"],
      },
      incorrectMarks: {
        type: Number,
        default: 0,
        min: [0, "Incorrect mark penalty must be non-negative"],
      },
      unansweredMarks: {
        type: Number,
        default: 0,
      },
    },
    roster: [
      {
        rollNumber: {
          type: String,
          required: true,
          trim: true,
        },
        studentName: {
          type: String,
          required: true,
          trim: true,
        },
      },
    ],
    templateVersion: {
      type: String,
      default: "OMR-V1.0",
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
examSchema.index({ createdAt: -1 });
examSchema.index({ subject: 1, className: 1 });

export const Exam = mongoose.model("Exam", examSchema);
