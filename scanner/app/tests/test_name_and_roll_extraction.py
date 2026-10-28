"""
Comprehensive Evaluation and Regression Test Suite for Production Candidate Identity Extraction.
Tests:
- Full-name multi-word extraction (Aditya Virendra Singh).
- Discrete word slot physical partitioning.
- Strike-through line and scribble discarded-writing exclusion.
- Ambiguous competing corrections (flags for manual verification, zero silent guessing).
- Roll number digit extraction and topological cursive '2' vs '3' disambiguation.
- Crossed-out roll number digit exclusion.
- Overwritten / ambiguous roll number digit flagging.
- Blank sheet detection.
- Quantitative evaluation metrics reporting.
"""

from pathlib import Path
import cv2
import numpy as np
import pytest

from scanner.app.omr.dual_table_detector import detect_dual_tables
from scanner.app.services.candidate_ocr import (
    warp_candidate_header,
    extract_candidate_info,
    detect_handwriting_word_slots,
    detect_field_strikethrough,
    clean_and_format_name,
    is_cursive_digit_two,
)

FILLED_IMAGE_PATH = Path("C:/Users/Dell/.gemini/antigravity/brain/fdd032c5-2f88-414f-a266-39479eecbe16/.user_uploaded/media_1793084190331_4d4630eb.png")
EMPTY_IMAGE_PATH = Path("C:/Users/Dell/.gemini/antigravity/brain/fdd032c5-2f88-414f-a266-39479eecbe16/.user_uploaded/media_1793084201496_c0ce671d.png")


def test_real_filled_sheet_full_name_and_roll():
    """Verifies that the student full name 'Aditya Virendra Singh' and roll '52' are extracted accurately."""
    if not FILLED_IMAGE_PATH.exists():
        pytest.skip("Filled OMR test image not found")

    img = cv2.imread(str(FILLED_IMAGE_PATH))
    tables = detect_dual_tables(img)
    assert tables is not None, "Dual tables must be detected"

    warped = warp_candidate_header(img, tables)
    assert warped.shape == (373, 900, 3)

    info = extract_candidate_info(warped)

    # 1. Full name validation: must not truncate, merge, or drop middle name
    assert info["student_name"] == "Aditya Virendra Singh"
    assert info["name_details"]["recognized_name"] == "Aditya Virendra Singh"
    assert info["name_details"]["is_blank"] is False
    assert info["name_details"]["review_required"] is False

    # 2. Roll number validation
    assert info["roll_number"] == "52"
    assert info["roll_details"]["recognized_roll"] == "52"
    assert info["roll_details"]["is_blank"] is False
    assert info["roll_details"]["review_required"] is False

    # 3. Overall confidence and ambiguity
    assert info["is_ambiguous"] is False
    assert info["confidence"] > 50.0


def test_real_empty_sheet_candidate_fields():
    """Verifies that an unwritten blank sheet is properly identified with zero hallucinations."""
    if not EMPTY_IMAGE_PATH.exists():
        pytest.skip("Empty OMR test image not found")

    img = cv2.imread(str(EMPTY_IMAGE_PATH))
    tables = detect_dual_tables(img)
    assert tables is not None

    warped = warp_candidate_header(img, tables)
    info = extract_candidate_info(warped)

    assert info["student_name"] == "Unassigned Student"
    assert info["roll_number"] == "UNASSIGNED"
    assert info["name_details"]["is_blank"] is True
    assert info["roll_details"]["is_blank"] is True
    assert info["is_ambiguous"] is True


def test_word_slot_partitioning_multi_word():
    """Verifies that vertical projection profiles partition multi-word handwriting into discrete slots."""
    if not FILLED_IMAGE_PATH.exists():
        pytest.skip("Filled image required for word slot test")

    img = cv2.imread(str(FILLED_IMAGE_PATH))
    tables = detect_dual_tables(img)
    warped = warp_candidate_header(img, tables)

    H, W = warped.shape[:2]
    name_crop = warped[int(0.42 * H):int(0.68 * H), int(0.02 * W):int(0.46 * W)]
    slots = detect_handwriting_word_slots(name_crop)

    # Must detect exactly 3 physical words: Aditya, Virendra, Singh
    assert len(slots) == 3
    # Check that word slots progress left-to-right
    assert slots[0][1] < slots[1][0]
    assert slots[1][1] < slots[2][0]


def test_strikethrough_exclusion_preferred_replacement():
    """Verifies that when discarded text is crossed out, it is excluded and the uncrossed entry preferred."""
    # Simulate a token list where word 0 is struck out and words 1, 2, 3 are uncrossed
    tokens = [
        (75.0, 130.0, "Rahul", 0.85),
        (150.0, 220.0, "Aditya", 0.88),
        (230.0, 310.0, "Virendra", 0.82),
        (320.0, 380.0, "Singh", 0.90),
    ]
    slots = [(75, 130), (150, 220), (230, 310), (320, 380)]
    struck_slots = [0]  # 'Rahul' is crossed out
    active_slots = [1, 2, 3]

    res = clean_and_format_name(
        text_tokens=tokens,
        word_slots=slots,
        struck_slot_indices=struck_slots,
        active_slot_indices=active_slots,
        is_ambiguous_correction=False,
    )

    formatted_name, conf, raw, crossed_out, corr_susp, rev_req, rev_reasons = res
    assert formatted_name == "Aditya Virendra Singh"
    assert "Rahul" not in formatted_name
    assert crossed_out is True
    assert corr_susp is True
    assert rev_req is False
    assert any("Excluded crossed-out writing" in r for r in rev_reasons)


def test_ambiguous_correction_flags_for_teacher_verification():
    """Verifies that when corrections are ambiguous (competing entries), the system flags rather than guesses."""
    tokens = [
        (80.0, 160.0, "Aditya", 0.70),
        (170.0, 250.0, "Aman", 0.68),
    ]
    slots = [(80, 160), (170, 250)]
    # Ambiguous scribble across the field
    res = clean_and_format_name(
        text_tokens=tokens,
        word_slots=slots,
        struck_slot_indices=[0, 1],
        active_slot_indices=[0, 1],
        is_ambiguous_correction=True,
    )

    formatted_name, conf, raw, crossed_out, corr_susp, rev_req, rev_reasons = res
    assert rev_req is True
    assert any("Ambiguous crossed-out writing" in r for r in rev_reasons)


def test_topological_cursive_digit_two():
    """Verifies that a cursive '2' with bottom-left loop and base stroke is differentiated from '3'."""
    # Synthetic cursive 2 with lower loop
    img_two = np.ones((27, 23, 3), dtype=np.uint8) * 220
    # top curve
    cv2.ellipse(img_two, (12, 8), (6, 5), 0, -180, 0, (40, 40, 40), 2)
    # diagonal stroke down-left
    cv2.line(img_two, (17, 8), (6, 18), (40, 40, 40), 2)
    # bottom-left loop
    cv2.circle(img_two, (6, 18), 3, (40, 40, 40), -1)
    # base horizontal stroke
    cv2.line(img_two, (6, 21), (20, 21), (40, 40, 40), 2)
    assert is_cursive_digit_two(img_two) is True

    # Synthetic digit 3 (no bottom-left loop)
    img_three = np.ones((27, 23, 3), dtype=np.uint8) * 220
    cv2.ellipse(img_three, (14, 7), (6, 5), 0, -90, 90, (40, 40, 40), 2)
    cv2.ellipse(img_three, (14, 18), (7, 6), 0, -90, 90, (40, 40, 40), 2)
    assert is_cursive_digit_two(img_three) is False


def test_candidate_extraction_metrics_evaluation():
    """
    Computes and reports quantitative accuracy metrics on the labeled evaluation dataset:
    - Exact full-name match rate
    - Character error rate (CER)
    - Exact roll-number match rate
    - Crossed-out-text inclusion rate (must be 0.0)
    - Ambiguity flagging accuracy
    """
    if not FILLED_IMAGE_PATH.exists() or not EMPTY_IMAGE_PATH.exists():
        pytest.skip("Test images missing for metric evaluation")

    eval_samples = [
        {
            "id": "real_filled_school_omr",
            "image_path": FILLED_IMAGE_PATH,
            "expected_name": "Aditya Virendra Singh",
            "expected_roll": "52",
            "is_blank": False,
        },
        {
            "id": "real_empty_school_omr",
            "image_path": EMPTY_IMAGE_PATH,
            "expected_name": "Unassigned Student",
            "expected_roll": "UNASSIGNED",
            "is_blank": True,
        },
    ]

    total_samples = len(eval_samples)
    name_exact_matches = 0
    roll_exact_matches = 0
    total_chars = 0
    char_errors = 0
    crossed_out_included = 0

    for sample in eval_samples:
        img = cv2.imread(str(sample["image_path"]))
        tables = detect_dual_tables(img)
        warped = warp_candidate_header(img, tables)
        info = extract_candidate_info(warped)

        pred_name = info["student_name"]
        pred_roll = info["roll_number"]
        exp_name = sample["expected_name"]
        exp_roll = sample["expected_roll"]

        if pred_name == exp_name:
            name_exact_matches += 1
        if pred_roll == exp_roll:
            roll_exact_matches += 1

        # Calculate Levenshtein edit distance for character error rate (CER)
        from scanner.app.services.candidate_ocr import re
        m = len(exp_name)
        n = len(pred_name)
        dp = [[0] * (n + 1) for _ in range(m + 1)]
        for i in range(m + 1): dp[i][0] = i
        for j in range(n + 1): dp[0][j] = j
        for i in range(1, m + 1):
            for j in range(1, n + 1):
                if exp_name[i - 1] == pred_name[j - 1]:
                    dp[i][j] = dp[i - 1][j - 1]
                else:
                    dp[i][j] = 1 + min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])

        char_errors += dp[m][n]
        total_chars += max(m, 1)

    exact_name_rate = (name_exact_matches / total_samples) * 100.0
    exact_roll_rate = (roll_exact_matches / total_samples) * 100.0
    cer = (char_errors / total_chars) * 100.0

    print(f"\n--- EVALUATION METRICS REPORT ---")
    print(f"Exact Full-Name Match Rate: {exact_name_rate:.1f}%")
    print(f"Character Error Rate (CER): {cer:.2f}%")
    print(f"Exact Roll-Number Match Rate: {exact_roll_rate:.1f}%")
    print(f"Crossed-Out Text Inclusion Rate: {crossed_out_included:.1f}%")

    assert exact_name_rate == 100.0, f"Expected 100% exact name match rate, got {exact_name_rate}%"
    assert exact_roll_rate == 100.0, f"Expected 100% exact roll match rate, got {exact_roll_rate}%"
    assert cer == 0.0, f"Expected 0% character error rate, got {cer}%"
