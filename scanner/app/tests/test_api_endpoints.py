"""
Automated FastAPI Endpoint Integration Tests.
Validates HTTP endpoints: /health, /template, /template/pdf, and /scan.
"""

import io
import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from scanner.app.main import app
from scanner.app.services.synthetic_generator import SyntheticOMRGenerator

client = TestClient(app)


def test_health_endpoint():
    """Tests the /health endpoint."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["service"] == "omr-vision-service"
    assert data["template_version"] == "OMR-V1.0"


def test_template_endpoint():
    """Tests the /template endpoint."""
    response = client.get("/template")
    assert response.status_code == 200
    data = response.json()
    assert data["template_version"] == "OMR-V1.0"
    assert "markers" in data
    assert "questions" in data
    assert len(data["questions"]) == 30


def test_template_pdf_endpoint():
    """Tests the /template/pdf dynamic generator endpoint."""
    response = client.get(
        "/template/pdf",
        params={
            "exam_id": "EXAM-MATH-999",
            "exam_title": "Mathematics Final",
            "subject": "Math",
            "class_name": "Class 10-C",
            "exam_date": "2026-10-27",
        },
    )
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert len(response.content) > 1500


def test_scan_endpoint_valid_image():
    """Tests POST /scan with a valid synthetic image upload."""
    generator = SyntheticOMRGenerator()
    test_sheet = generator.generate_sheet_with_responses({
        1: "B",
        2: "D",
        15: "A",
        30: "C",
    })

    # Encode as JPEG
    success, buffer = cv2.imencode(".jpg", test_sheet)
    assert success

    file_bytes = buffer.tobytes()
    response = client.post(
        "/scan",
        files={"file": ("test_sheet.jpg", file_bytes, "image/jpeg")},
        params={"return_annotated": True, "check_blur": False},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["total_questions"] == 30
    assert data["detected_answers"]["1"] == "B"
    assert data["detected_answers"]["2"] == "D"
    assert data["detected_answers"]["15"] == "A"
    assert data["detected_answers"]["30"] == "C"
    assert data["annotated_image_base64"] is not None
    assert "processing_time_ms" in data["diagnostics"]


def test_scan_endpoint_missing_markers_rejection():
    """Tests POST /scan with an image missing corner markers (fails gracefully with 422)."""
    # Create blank white image with no markers
    blank_white = np.full((1200, 1000, 3), 255, dtype=np.uint8)
    _, buffer = cv2.imencode(".jpg", blank_white)

    response = client.post(
        "/scan",
        files={"file": ("invalid_sheet.jpg", buffer.tobytes(), "image/jpeg")},
        params={"return_annotated": False, "check_blur": False},
    )

    assert response.status_code == 422
    data = response.json()
    assert data["success"] is False
    assert data["error_code"] in ["MARKER_NOT_FOUND", "MARKER_ORIENTATION_INVALID"]
    assert "message" in data
