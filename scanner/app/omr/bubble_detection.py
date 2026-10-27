"""
Bubble Detection and Region Inspection.
Inspects pre-defined bubble regions on the canonical sheet, extracts
multi-factor radiometric measurements (binary fill ratio, relative darkness,
and background reference), and generates diagnostic metrics for classification.
"""

from typing import Dict, Any, List, Optional, Tuple
import cv2
import numpy as np

from scanner.app.services.template_config import load_template_config


def create_circular_mask(radius: int) -> np.ndarray:
    """Creates a boolean circular kernel of specified radius."""
    diameter = radius * 2 + 1
    y, x = np.ogrid[-radius:radius + 1, -radius:radius + 1]
    mask = x**2 + y**2 <= radius**2
    return mask


def inspect_all_bubbles(
    warped_gray: np.ndarray,
    config: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, Any]]:
    """
    Inspects all 30 questions and their 4 options (A, B, C, D) on the canonical image.
    Returns per-question measurements with fill ratio, relative darkness, and raw metrics.
    """
    if config is None:
        config = load_template_config()

    questions = config["questions"]
    bubble_specs = config["bubble_specs"]
    sample_r = int(round(bubble_specs["sample_radius_px"]))
    mask = create_circular_mask(sample_r)
    mask_pixels = np.count_nonzero(mask)

    # Adaptive binary inversion map for the entire canonical sheet
    # 31x31 neighborhood with C=8 adapts cleanly across uneven local paper gradients
    binary_inv = cv2.adaptiveThreshold(
        warped_gray,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        31,
        8,
    )

    h, w = warped_gray.shape[:2]
    measured_questions = []

    for q in questions:
        q_num = q["question_number"]
        q_y = int(round(q["y_px"]))

        # Measure local paper background baseline near question row
        # Sample a 16x16 patch of bare paper between number and first bubble
        ref_x = int(round(q["num_label_x_pt"] * config["page"]["scale_x"])) + 25
        ref_y = q_y
        ref_patch = warped_gray[max(0, ref_y - 8):min(h, ref_y + 8), max(0, ref_x - 8):min(w, ref_x + 8)]
        local_paper_bg = float(np.mean(ref_patch)) if ref_patch.size > 0 else 240.0
        if local_paper_bg < 100.0:  # Safety clamp
            local_paper_bg = 240.0

        options_measurements = {}

        for opt, b_info in q["bubbles"].items():
            cx = int(round(b_info["cx_px"]))
            cy = int(round(b_info["cy_px"]))

            # Extract circular patch
            y1 = max(0, cy - sample_r)
            y2 = min(h, cy + sample_r + 1)
            x1 = max(0, cx - sample_r)
            x2 = min(w, cx + sample_r + 1)

            patch_gray = warped_gray[y1:y2, x1:x2]
            patch_bin = binary_inv[y1:y2, x1:x2]

            # Adjust mask slice if near edge
            sub_mask = mask[
                (y1 - (cy - sample_r)):(y2 - (cy - sample_r)),
                (x1 - (cx - sample_r)):(x2 - (cx - sample_r)),
            ]
            valid_count = np.count_nonzero(sub_mask)
            if valid_count == 0:
                valid_count = 1

            # 1. Binary Fill Ratio
            active_bin_pixels = np.count_nonzero(patch_bin[sub_mask])
            fill_ratio = float(active_bin_pixels / valid_count)

            # 2. Mean Intensity and Relative Darkness
            mean_intensity = float(np.mean(patch_gray[sub_mask]))
            rel_darkness = max(0.0, float((local_paper_bg - mean_intensity) / local_paper_bg))

            # 3. Composite Score
            # Blends binary coverage (spatial filling) with radiometric darkness
            composite_score = 0.55 * fill_ratio + 0.45 * rel_darkness

            options_measurements[opt] = {
                "fill_ratio": round(fill_ratio, 4),
                "relative_darkness": round(rel_darkness, 4),
                "mean_intensity": round(mean_intensity, 2),
                "composite_score": round(composite_score, 4),
                "cx_px": cx,
                "cy_px": cy,
                "radius_px": sample_r,
            }

        measured_questions.append({
            "question_number": q_num,
            "column": q["column"],
            "y_px": q_y,
            "local_paper_bg": round(local_paper_bg, 2),
            "options": options_measurements,
        })

    return measured_questions
