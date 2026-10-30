import express from "express";
import multer from "multer";
import {
  processScan,
  processBatchScans,
  getScanById,
  reviewScan,
  finalizeScan,
  deleteScan,
  deleteBatchScans,
  deleteAllScansForExam,
} from "../controllers/scanController.js";
import { validateBody } from "../middleware/validate.js";
import { reviewScanSchema } from "../validators/scanValidator.js";

const router = express.Router();

// Configure Multer memory storage (support up to 100 files in batch, 15MB per file)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 15 * 1024 * 1024, // 15MB max file size
    files: 100, // up to 100 files at once
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files (JPEG, PNG, WebP) are allowed."), false);
    }
  },
});

router.post("/", upload.single("image"), processScan);
router.post("/batch", upload.array("images", 100), processBatchScans);
router.post("/delete-batch", deleteBatchScans);
router.delete("/exam/:examId", deleteAllScansForExam);
router.delete("/:id", deleteScan);
router.get("/:id", getScanById);
router.put("/:id/review", validateBody(reviewScanSchema), reviewScan);
router.post("/:id/finalize", finalizeScan);

export default router;
