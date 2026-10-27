"""
Unit Tests for OMR Template Geometry and Standardized PDF Generation.
"""

import os
from pathlib import Path
import pytest

from scanner.app.services.template_config import generate_template_config, load_template_config
from scanner.app.services.pdf_generator import OMRSheetGenerator


def test_template_geometry_specifications():
    """Validates that template configuration has complete and geometrically sound specs."""
    cfg = generate_template_config()

    assert cfg["template_version"] == "OMR-V1.0"
    page = cfg["page"]
    assert page["format"] == "A4"
    assert page["width_pt"] == 595.28
    assert page["height_pt"] == 841.89
    assert page["canonical_width_px"] == 1200
    assert page["canonical_height_px"] == 1700

    # Verify 4 Corner Markers
    markers = cfg["markers"]
    for m_key in ["top_left", "top_right", "bottom_left", "bottom_right"]:
        assert m_key in markers
        m = markers[m_key]
        assert m["x_pt"] >= 0 and m["x_pt"] <= page["width_pt"]
        assert m["y_pt"] >= 0 and m["y_pt"] <= page["height_pt"]

    # Verify 30 Questions
    questions = cfg["questions"]
    assert len(questions) == 30
    for idx, q in enumerate(questions):
        q_num = q["question_number"]
        assert q_num == idx + 1
        assert q["column"] in [1, 2]
        bubbles = q["bubbles"]
        assert set(bubbles.keys()) == {"A", "B", "C", "D"}

        # Verify bubble center coordinates are ordered horizontally A < B < C < D
        assert bubbles["A"]["cx_px"] < bubbles["B"]["cx_px"] < bubbles["C"]["cx_px"] < bubbles["D"]["cx_px"]


def test_pdf_generation(tmp_path):
    """Tests generating the printable A4 OMR PDF."""
    generator = OMRSheetGenerator()
    out_pdf = tmp_path / "test_omr_sheet.pdf"

    generated_path = generator.generate(
        output_path=str(out_pdf),
        exam_id="TEST-EXAM-101",
        exam_title="Biology Midterm",
        subject="Biology",
        class_name="Grade 11-A",
        exam_date="2026-10-27",
    )

    assert Path(generated_path).exists()
    file_size = Path(generated_path).stat().st_size
    assert file_size > 1500  # Non-trivial PDF with vector elements
