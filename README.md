# OMR Scanner and Automatic Evaluation Web Application

A full-stack, mobile-first **Optical Mark Recognition (OMR) Scanner and Automatic Examination Evaluation System** designed for schools and examination centers.

Built strictly according to project specifications:
- **Express.js Backend** as the primary application server handling REST APIs, exams, scoring engine, data models, Zod validation, and Multer file uploads.
- **Python FastAPI Service** for dedicated computer vision (OpenCV alignment marker detection, homography perspective correction, bubble fill ratio measurement, and diagnostic visualization).
- **React 18 + TypeScript + Vite + Tailwind CSS Frontend** with Browser Camera API (`getUserMedia`), real-time alignment guide brackets, flashlight toggle, interactive answer review, and CSV export.

---

## 1. System Architecture

```
                  ┌──────────────────────────────────────────────┐
                  │           React 18 Frontend Client           │
                  │   (Vite, TS, Tailwind, HTML5 Camera API)    │
                  └──────────────────────┬───────────────────────┘
                                         │ HTTP REST (JSON / Multipart)
                                         ▼
                  ┌──────────────────────────────────────────────┐
                  │           Node.js Express Backend            │
                  │  (Zod Validation, Multer, Scoring Engine)    │
                  └──────────────┬───────────────────────────────┘
                                 │
                 ┌───────────────┴───────────────┐
                 │                               │
                 ▼ Internal HTTP (Port 8000)     ▼ MongoDB / Memory Store
  ┌───────────────────────────────┐  ┌───────────────────────────────┐
  │ Python Computer Vision Service│  │    Persistent Mongoose DB     │
  │ (OpenCV, NumPy, ReportLab)    │  │ (Exams, Results, Audit Trail) │
  └───────────────────────────────┘  └───────────────────────────────┘
```

**Architecture Rule Adherence**:
- Express is the primary backend. All frontend requests go through Express (`/api/exams`, `/api/scans`).
- Express communicates with the Python vision service internally (`POST http://localhost:8000/scan`).
- The Python service does **not** handle exams, database operations, or scoring.
- Scoring is strictly calculated on the Express backend using stored answer keys and validated responses.

---

## 2. Directory Structure

```
OMR_Scanner/
├── shared/
│   └── omr-template-config.json    # Canonical single source of truth for sheet geometry
├── scanner/                        # Python OpenCV & FastAPI Microservice
│   ├── app/
│   │   ├── main.py                 # FastAPI service entry point
│   │   ├── routes/scan.py          # Endpoints: /scan, /template, /template/pdf, /health
│   │   ├── services/
│   │   │   ├── template_config.py  # Geometric spec generator & loader
│   │   │   ├── pdf_generator.py    # ReportLab A4 vector PDF generator
│   │   │   ├── omr_processor.py    # End-to-end CV evaluation & annotation engine
│   │   │   └── synthetic_generator.py # Test sheet generator & camera simulator
│   │   ├── omr/
│   │   │   ├── preprocessing.py    # Format validation, Laplacian blur, lighting normalization
│   │   │   ├── marker_detection.py # 4 corner square marker detection & layout validation
│   │   │   ├── perspective.py      # Homography perspective warp to 1200x1700 canonical space
│   │   │   ├── bubble_detection.py # Multi-factor radiometric & binary fill ratio inspection
│   │   │   └── classification.py   # State machine for Confident, Blank, Ambiguous, Multiple marks
│   │   └── tests/                  # Pytest automated test suite (15 test cases)
│   └── requirements.txt
├── server/                         # Node.js & Express REST Backend
│   ├── src/
│   │   ├── index.js                # Express app & MongoDB connection
│   │   ├── routes/                 # examRoutes.js, scanRoutes.js
│   │   ├── controllers/            # examController.js, scanController.js
│   │   ├── models/                 # Exam.js, ScanResult.js
│   │   ├── services/
│   │   │   ├── scoringEngine.js    # Independent scoring engine with review enforcement
│   │   │   └── dbStore.js          # Resilient storage with in-memory fallback
│   │   ├── validators/             # Zod request validation schemas
│   │   ├── middleware/             # Validation and centralized error handlers
│   │   └── utils/                  # Safe logging & custom AppError
│   ├── tests/                      # Node test runner suite (13 test cases)
│   └── package.json
├── client/                         # React 18, TypeScript, Vite & Tailwind CSS
│   ├── src/
│   │   ├── components/             # Navbar.tsx, CameraCapture.tsx
│   │   ├── pages/                  # Dashboard.tsx, CreateExam.tsx, ScanOMR.tsx, ScanReview.tsx, ExamDetails.tsx
│   │   ├── services/api.ts         # Axios REST client
│   │   └── types/index.ts          # TypeScript type definitions
│   └── package.json
├── .env.example                    # Environment variable template
└── README.md
```

---

## 3. Computer Vision Pipeline (OpenCV)

1. **Preprocessing & Blur Rejection**:
   - Laplacian variance check: $Var(\Delta I) < 35.0$ is rejected with `IMAGE_BLURRY`.
   - Morphological background illumination normalization for shadow compensation.
2. **Alignment Marker Detection**:
   - Detects the 4 corner black squares ($26 \times 26$ pt).
   - Validates quadrilateral geometry, aspect ratio, and marker area consistency to avoid confusing text or paper edges with markers.
3. **Perspective Correction**:
   - Homography transform $H$ warps the photographed sheet to canonical $1200 \times 1700$ pixel coordinates.
4. **Radiometric Bubble Inspection**:
   - Dual-factor measurement inside an inner sample radius ($r_{\text{sample}} = 0.75 \times r$) to avoid measuring the printed ring outline:
     - Local adaptive binary fill ratio ($F_{\text{binary}}$).
     - Radiometric relative darkness ($D_{\text{rel}}$) referenced against local paper background.
5. **Answer Classification**:
   - `CONFIDENT`: High fill ratio ($> 40\%$) with clearance $\ge 12\%$ over second highest option.
   - `BLANK`: Fill ratio $< 16\%$.
   - `MULTIPLE_MARKED`: Two or more options filled; flags question for teacher review.
   - `AMBIGUOUS`: Lightly shaded mark ($24\% - 40\%$) or narrow delta; flags question for teacher review.

---

## 4. Setup & Running on Windows

### Prerequisites
- **Python**: 3.10+ (tested on Python 3.14)
- **Node.js**: v20+ (tested on Node v24)
- **npm**: v10+

### Step 1: Start the Python Computer Vision Microservice
Open PowerShell in the project directory:
```powershell
cd c:\Users\Dell\Documents\OMR_Scanner
python -m pip install -r scanner/requirements.txt
python -m uvicorn scanner.app.main:app --host 0.0.0.0 --port 8000
```
- Swagger API Docs: `http://localhost:8000/docs`
- Health check: `http://localhost:8000/health`

### Step 2: Start the Express Backend Server
Open a second PowerShell terminal:
```powershell
cd c:\Users\Dell\Documents\OMR_Scanner\server
npm install
npm run dev
```
- Express API runs on `http://localhost:5000`
- If MongoDB is installed locally or via Atlas, it automatically connects. If running offline without MongoDB, the server transparently uses an in-memory repository fallback so you can test all features immediately.

### Step 3: Start the React Frontend Application
Open a third PowerShell terminal:
```powershell
cd c:\Users\Dell\Documents\OMR_Scanner\client
npm install
npm run dev
```
- Web application available at `http://localhost:3000` (and on your local network for mobile phone browser testing).

---

## 5. Automated Tests

All automated test suites pass with 100% success:

### A. Python Vision & Pipeline Tests (pytest)
```powershell
cd c:\Users\Dell\Documents\OMR_Scanner
python -m pytest scanner/app/tests -v
```
**15 passed in 6.77s**:
- `test_health_endpoint`: **PASSED**
- `test_template_endpoint`: **PASSED**
- `test_template_pdf_endpoint`: **PASSED**
- `test_scan_endpoint_valid_image`: **PASSED**
- `test_scan_endpoint_missing_markers_rejection`: **PASSED**
- `test_clean_30_questions_all_filled`: **PASSED** (100% accuracy on all 30 questions)
- `test_blank_sheet`: **PASSED** (all 30 questions detected as `BLANK`)
- `test_multiple_marked_question`: **PASSED** (flags multiple filled bubbles and requests teacher review)
- `test_lightly_shaded_bubble_requires_review`: **PASSED** (flags ambiguous shading without guessing)
- `test_erased_answer_resolved_correctly`: **PASSED** (distinguishes erasure smudge from firm mark)
- `test_camera_capture_perspective_and_lighting`: **PASSED** (handles simulated camera capture with $2.5^\circ$ rotation, perspective tilt, and lighting gradient)
- `test_rejection_missing_corner_marker`: **PASSED** (detects missing marker and raises `MarkerDetectionError`)
- `test_rejection_excessive_blur`: **PASSED** (detects out-of-focus capture and raises `PreprocessingError`)
- `test_template_geometry_specifications`: **PASSED**
- `test_pdf_generation`: **PASSED**

### B. Node.js Backend Tests (Node Test Runner)
```powershell
cd c:\Users\Dell\Documents\OMR_Scanner
node --test server/tests/scoringEngine.test.js
node --test server/tests/api.test.js
```
**13 passed**:
- Scoring Engine: standard 1-mark scheme: **PASSED**
- Scoring Engine: negative marking penalty: **PASSED**
- Scoring Engine: review required enforcement: **PASSED**
- Scoring Engine: teacher correction recalculation: **PASSED**
- API: `GET /health`: **PASSED**
- API: `POST /api/exams` creation: **PASSED**
- API: Zod validation error rejection: **PASSED**
- API: `GET /api/exams`: **PASSED**
- API: `GET /api/exams/:id`: **PASSED**
- API: `PUT /api/exams/:id`: **PASSED**
- API: `GET /api/exams/:id/results`: **PASSED**
- API: `GET /api/exams/:id/results/export` CSV streaming: **PASSED**

### C. Client Production Build
```powershell
cd c:\Users\Dell\Documents\OMR_Scanner\client
npm run build
```
- Vite production bundle compiles with **0 TypeScript and bundling errors**.
