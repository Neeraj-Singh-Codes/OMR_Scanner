"""
Automated Tests for Real-World School 25-Question Dual-Table OMR Sheet Scanning.
Tests both the filled student response photograph and the empty blank sheet photograph.
"""

from pathlib import Path
import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from scanner.app.main import app
from scanner.app.services.omr_processor import OMRProcessor
from scanner.app.omr.dual_table_detector import detect_dual_tables, evaluate_dual_table_omr

client = TestClient(app)

FILLED_IMAGE_PATH = Path("C:/Users/Dell/.gemini/antigravity/brain/fdd032c5-2f88-414f-a266-39479eecbe16/.user_uploaded/media_1793084190331_4d4630eb.png")
EMPTY_IMAGE_PATH = Path("C:/Users/Dell/.gemini/antigravity/brain/fdd032c5-2f88-414f-a266-39479eecbe16/.user_uploaded/media_1793084201496_c0ce671d.png")

if not FILLED_IMAGE_PATH.exists() or not EMPTY_IMAGE_PATH.exists():
    pytest.skip("Local test image files not present on current system, skipping real-sheet integration tests", allow_module_level=True)

GROUND_TRUTH_FILLED = {
    "1": "C", "2": "C", "3": "C", "4": "B", "5": "A",
    "6": "A", "7": "D", "8": "D", "9": "B", "10": "A",
    "11": "B", "12": "D", "13": "A", "14": "C", "15": "B",
    "16": "A", "17": "D", "18": "A", "19": "B", "20": "A",
    "21": "D", "22": "A", "23": "C", "24": "D", "25": "A"
}


def test_dual_table_detector_finds_tables():
    """Verifies that dual question tables are detected on both filled and empty real sheets."""
    assert FILLED_IMAGE_PATH.exists(), "Filled OMR image must exist"
    assert EMPTY_IMAGE_PATH.exists(), "Empty OMR image must exist"

    filled_img = cv2.imread(str(FILLED_IMAGE_PATH))
    tables_filled = detect_dual_tables(filled_img)
    assert tables_filled is not None
    assert "left_table" in tables_filled and "right_table" in tables_filled
    assert len(tables_filled["left_table"]) == 4
    assert len(tables_filled["right_table"]) == 4

    empty_img = cv2.imread(str(EMPTY_IMAGE_PATH))
    tables_empty = detect_dual_tables(empty_img)
    assert tables_empty is not None
    assert "left_table" in tables_empty and "right_table" in tables_empty


def test_evaluate_filled_school_omr_sheet():
    """Verifies 100% accurate bubble detection on the real student filled OMR sheet."""
    filled_img = cv2.imread(str(FILLED_IMAGE_PATH))
    processor = OMRProcessor()

    result = processor.process_image(filled_img, generate_annotated=True, check_blur=True)

    assert result["success"] is True
    assert result["template_version"] == "SCHOOL-25Q-DUAL-TABLE"
    assert result["total_questions"] == 25

    detected = result["detected_answers"]
    for q_str, expected_opt in GROUND_TRUTH_FILLED.items():
        assert detected.get(q_str) == expected_opt, (
            f"Question {q_str}: expected {expected_opt}, got {detected.get(q_str)}"
        )

    # All 25 answers should be confidently detected with no blanks
    assert result["summary"]["blank_count"] == 0
    assert result["summary"]["review_required"] is False
    assert result["annotated_image_base64"] is not None

    cand = result.get("candidate_info", {})
    assert cand.get("student_name") == "Aditya Virendra Singh"
    assert cand.get("roll_number") == "52"
    assert cand.get("name_details", {}).get("review_required") is False
    assert cand.get("roll_details", {}).get("review_required") is False


def test_evaluate_empty_school_omr_sheet():
    """Verifies that an unshaded blank sheet has 0 false positives and 25 blank responses."""
    empty_img = cv2.imread(str(EMPTY_IMAGE_PATH))
    processor = OMRProcessor()

    result = processor.process_image(empty_img, generate_annotated=True, check_blur=True)

    assert result["success"] is True
    assert result["template_version"] == "SCHOOL-25Q-DUAL-TABLE"
    assert result["total_questions"] == 25
    assert result["summary"]["blank_count"] == 25

    for q_str in [str(i) for i in range(1, 26)]:
        assert result["detected_answers"][q_str] is None

    # Empty sheet candidate fields should be marked as unassigned/blank
    cand = result.get("candidate_info", {})
    assert cand.get("student_name") == "Unassigned Student"
    assert cand.get("roll_number") == "UNASSIGNED"
    assert cand.get("name_details", {}).get("is_blank") is True
    assert cand.get("roll_details", {}).get("is_blank") is True


def test_api_scan_endpoint_with_school_omr():
    """Tests the /scan REST API endpoint directly with the uploaded student sheet."""
    with open(FILLED_IMAGE_PATH, "rb") as f:
        file_bytes = f.read()

    response = client.post(
        "/scan",
        files={"file": ("student_exam_sheet.png", file_bytes, "image/png")},
        params={"return_annotated": True, "check_blur": True},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["template_version"] == "SCHOOL-25Q-DUAL-TABLE"
    assert data["total_questions"] == 25
    assert data["detected_answers"]["1"] == "C"
    assert data["detected_answers"]["25"] == "A"
    assert "annotated_image_base64" in data
