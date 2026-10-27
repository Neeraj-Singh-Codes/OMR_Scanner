"""
Automated Computer Vision and OMR Pipeline Tests.
Validates clean sheets, blank sheets, multiple marks, light shading, erasures,
photographed perspective distortion, and failure mode rejections.
"""

import cv2
import numpy as np
import pytest

from scanner.app.services.omr_processor import OMRProcessor
from scanner.app.services.synthetic_generator import SyntheticOMRGenerator
from scanner.app.omr.marker_detection import MarkerDetectionError
from scanner.app.omr.preprocessing import PreprocessingError


@pytest.fixture
def processor():
    return OMRProcessor()


@pytest.fixture
def generator():
    return SyntheticOMRGenerator()


def test_clean_30_questions_all_filled(processor, generator):
    """
    Test 1: Clean, correctly filled sheet with 30 known answers.
    Must achieve 100% detection accuracy on all 30 questions.
    """
    # Define an alternating answer key for all 30 questions
    expected_answers = {}
    options_cycle = ["A", "B", "C", "D"]
    for q_num in range(1, 31):
        expected_answers[q_num] = options_cycle[(q_num - 1) % 4]

    img = generator.generate_sheet_with_responses(expected_answers)
    result = processor.process_image(img, generate_annotated=False)

    assert result["success"] is True
    assert result["total_questions"] == 30
    assert result["summary"]["blank_count"] == 0
    assert result["summary"]["multiple_marked_count"] == 0
    assert result["summary"]["ambiguous_count"] == 0
    assert result["summary"]["review_required"] is False

    # Check each question answer matches exactly
    for q_num in range(1, 31):
        detected = result["detected_answers"][str(q_num)]
        expected = expected_answers[q_num]
        assert detected == expected, f"Question {q_num}: expected {expected}, got {detected}"


def test_blank_sheet(processor, generator):
    """
    Test 2: Completely blank sheet.
    Must detect all 30 questions as BLANK with selected_option = None.
    """
    img = generator.generate_base_canonical_image()
    result = processor.process_image(img, generate_annotated=False)

    assert result["success"] is True
    assert result["summary"]["blank_count"] == 30
    assert result["summary"]["confident_count"] == 0
    assert result["summary"]["review_required"] is False

    for q_num in range(1, 31):
        assert result["detected_answers"][str(q_num)] is None


def test_multiple_marked_question(processor, generator):
    """
    Test 3: Multiple bubbles filled for a question.
    Must flag as MULTIPLE_MARKED and require teacher review.
    """
    responses = {
        1: "A",
        5: ["B", "D"],  # Multiple marked on Q5
        10: "C",
    }
    img = generator.generate_sheet_with_responses(responses)
    result = processor.process_image(img, generate_annotated=False)

    assert result["success"] is True
    assert result["detected_answers"]["1"] == "A"
    assert result["detected_answers"]["10"] == "C"

    # Q5 checks
    q5 = result["questions"][4]
    assert q5["status"] == "MULTIPLE_MARKED"
    assert q5["review_required"] is True
    assert result["detected_answers"]["5"] is None
    assert 5 in result["summary"]["review_question_numbers"]
    assert result["summary"]["review_required"] is True


def test_lightly_shaded_bubble_requires_review(processor, generator):
    """
    Test 4: Lightly shaded bubble.
    Must NOT guess silently; must flag as AMBIGUOUS and require review.
    """
    responses = {
        3: {"option": "C", "type": "LIGHT"},
        4: "B",
    }
    img = generator.generate_sheet_with_responses(responses)
    result = processor.process_image(img, generate_annotated=False)

    q3 = result["questions"][2]
    assert q3["status"] == "AMBIGUOUS"
    assert q3["review_required"] is True
    assert 3 in result["summary"]["review_question_numbers"]


def test_erased_answer_resolved_correctly(processor, generator):
    """
    Test 5: Student marks option A, then erases it and darkens option C.
    The dominant answer C should be recognized while the faint erasure is resolved.
    """
    responses = {
        12: "C",  # Firmly darkened C
    }
    img = generator.generate_sheet_with_responses(responses)
    # Add a faint erased mark to option A of Q12
    generator.fill_bubble(img, 12, "A", fill_type="ERASED")

    result = processor.process_image(img, generate_annotated=False)
    q12 = result["questions"][11]

    assert q12["selected_option"] == "C"
    assert q12["status"] == "CONFIDENT"


def test_camera_capture_perspective_and_lighting(processor, generator):
    """
    Test 6: Simulated smartphone camera photograph with perspective tilt,
    rotation, and uneven lighting falloff.
    Must locate markers, correct perspective, and accurately identify answers.
    """
    known_responses = {
        1: "A",
        2: "C",
        3: "B",
        4: "D",
        15: "A",
        16: "B",
        29: "C",
        30: "D",
    }
    canonical_sheet = generator.generate_sheet_with_responses(known_responses)

    # Simulate mobile camera capture: 2.5 deg rotation, perspective tilt, lighting gradient
    camera_photo = generator.simulate_camera_capture(
        canonical_sheet,
        rotation_deg=2.5,
        tilt_x=0.3,
        tilt_y=0.15,
        lighting_gradient=True,
        blur_kernel=0,
    )

    result = processor.process_image(camera_photo, generate_annotated=True)

    assert result["success"] is True
    assert result["annotated_image_base64"] is not None

    # Verify answers across different quadrants of the tilted sheet
    for q_num, expected in known_responses.items():
        detected = result["detected_answers"][str(q_num)]
        assert detected == expected, f"Camera capture: Q{q_num} expected {expected}, got {detected}"


def test_rejection_missing_corner_marker(processor, generator):
    """
    Test 7: Missing alignment marker (cropped or obscured corner).
    Must raise MarkerDetectionError and reject scan.
    """
    img = generator.generate_base_canonical_image()
    # Corrupt the Top-Left marker by whiting it out
    tl = processor.config["markers"]["top_left"]
    cx = int(round(tl["cx_px"]))
    cy = int(round(tl["cy_px"]))
    m_size = int(round(processor.config["markers"]["size_px"]))
    cv2.rectangle(img, (cx - m_size, cy - m_size), (cx + m_size, cy + m_size), (255, 255, 255), -1)

    with pytest.raises(MarkerDetectionError) as exc_info:
        processor.process_image(img)

    assert exc_info.value.code in ["MARKER_NOT_FOUND", "MARKER_ORIENTATION_INVALID"]


def test_rejection_excessive_blur(processor, generator):
    """
    Test 8: Severely blurred image.
    Must raise PreprocessingError with code IMAGE_BLURRY.
    """
    img = generator.generate_base_canonical_image()
    # Apply severe Gaussian blur
    blurry = cv2.GaussianBlur(img, (45, 45), 0)

    with pytest.raises(PreprocessingError) as exc_info:
        processor.process_image(blurry, check_blur=True)

    assert exc_info.value.code == "IMAGE_BLURRY"
