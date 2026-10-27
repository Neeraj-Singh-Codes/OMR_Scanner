"""
OMR Template Configuration Generator and Loader.
Defines the single source of truth for the OMR sheet geometry,
ensuring PDF generation, CV scanning, and Frontend coordinate overlays
are 100% consistent.
"""

import json
import os
from pathlib import Path
from typing import Dict, Any, List

# Path to shared configuration file
ROOT_DIR = Path(__file__).resolve().parent.parent.parent.parent
CONFIG_PATH = ROOT_DIR / "shared" / "omr-template-config.json"


def generate_template_config() -> Dict[str, Any]:
    """Generates the geometric specifications for Standard OMR Sheet V1.0."""
    page_width_pt = 595.28  # A4 width in pt
    page_height_pt = 841.89  # A4 height in pt
    canonical_w = 1200
    canonical_h = 1700

    scale_x = canonical_w / page_width_pt
    scale_y = canonical_h / page_height_pt

    marker_size_pt = 26.0
    half_marker_pt = marker_size_pt / 2.0
    margin_x_pt = 36.0
    margin_y_pt = 36.0

    # 4 Corner alignment markers
    tl_x = margin_x_pt
    tl_y = margin_y_pt
    tr_x = page_width_pt - margin_x_pt - marker_size_pt
    tr_y = margin_y_pt
    bl_x = margin_x_pt
    bl_y = page_height_pt - margin_y_pt - marker_size_pt
    br_x = page_width_pt - margin_x_pt - marker_size_pt
    br_y = page_height_pt - margin_y_pt - marker_size_pt

    markers = {
        "size_pt": marker_size_pt,
        "size_px": round(marker_size_pt * scale_x, 2),
        "top_left": {
            "x_pt": tl_x,
            "y_pt": tl_y,
            "cx_pt": tl_x + half_marker_pt,
            "cy_pt": tl_y + half_marker_pt,
            "cx_px": round((tl_x + half_marker_pt) * scale_x, 2),
            "cy_px": round((tl_y + half_marker_pt) * scale_y, 2),
        },
        "top_right": {
            "x_pt": tr_x,
            "y_pt": tr_y,
            "cx_pt": tr_x + half_marker_pt,
            "cy_pt": tr_y + half_marker_pt,
            "cx_px": round((tr_x + half_marker_pt) * scale_x, 2),
            "cy_px": round((tr_y + half_marker_pt) * scale_y, 2),
        },
        "bottom_left": {
            "x_pt": bl_x,
            "y_pt": bl_y,
            "cx_pt": bl_x + half_marker_pt,
            "cy_pt": bl_y + half_marker_pt,
            "cx_px": round((bl_x + half_marker_pt) * scale_x, 2),
            "cy_px": round((bl_y + half_marker_pt) * scale_y, 2),
        },
        "bottom_right": {
            "x_pt": br_x,
            "y_pt": br_y,
            "cx_pt": br_x + half_marker_pt,
            "cy_pt": br_y + half_marker_pt,
            "cx_px": round((br_x + half_marker_pt) * scale_x, 2),
            "cy_px": round((br_y + half_marker_pt) * scale_y, 2),
        },
    }

    bubble_radius_pt = 6.5
    bubble_radius_px = round(bubble_radius_pt * scale_x, 2)
    inner_sample_radius_px = round(bubble_radius_px * 0.75, 2)  # Avoid outer ring boundary

    options = ["A", "B", "C", "D"]
    total_questions = 30
    col1_start_y = 340.0
    row_step_y = 26.5

    questions = []
    for q_num in range(1, total_questions + 1):
        if q_num <= 15:
            column = 1
            idx_in_col = q_num - 1
            y_pt = col1_start_y + idx_in_col * row_step_y
            q_num_x_pt = 80.0
            bubble_xs = {
                "A": 135.0,
                "B": 163.0,
                "C": 191.0,
                "D": 219.0,
            }
        else:
            column = 2
            idx_in_col = q_num - 16
            y_pt = col1_start_y + idx_in_col * row_step_y
            q_num_x_pt = 335.0
            bubble_xs = {
                "A": 390.0,
                "B": 418.0,
                "C": 446.0,
                "D": 474.0,
            }

        y_px = round(y_pt * scale_y, 2)
        bubbles_info = {}
        for opt in options:
            bx_pt = bubble_xs[opt]
            bx_px = round(bx_pt * scale_x, 2)
            bubbles_info[opt] = {
                "cx_pt": bx_pt,
                "cy_pt": y_pt,
                "cx_px": bx_px,
                "cy_px": y_px,
                "radius_pt": bubble_radius_pt,
                "radius_px": bubble_radius_px,
                "sample_radius_px": inner_sample_radius_px,
            }

        questions.append({
            "question_number": q_num,
            "column": column,
            "num_label_x_pt": q_num_x_pt,
            "y_pt": y_pt,
            "y_px": y_px,
            "bubbles": bubbles_info,
        })

    config = {
        "template_version": "OMR-V1.0",
        "description": "Standardized 30-Question 4-Option (A-D) A4 Answer Sheet",
        "page": {
            "format": "A4",
            "width_pt": page_width_pt,
            "height_pt": page_height_pt,
            "width_mm": 210.0,
            "height_mm": 297.0,
            "canonical_width_px": canonical_w,
            "canonical_height_px": canonical_h,
            "scale_x": scale_x,
            "scale_y": scale_y,
            "origin": "top-left",
        },
        "markers": markers,
        "bubble_specs": {
            "radius_pt": bubble_radius_pt,
            "radius_px": bubble_radius_px,
            "sample_radius_px": inner_sample_radius_px,
            "options": options,
            "total_questions": total_questions,
        },
        "header_zones": {
            "title_zone": {
                "x_pt": 60.0,
                "y_pt": 40.0,
                "width_pt": 475.0,
                "height_pt": 50.0,
            },
            "exam_info_box": {
                "x_pt": 60.0,
                "y_pt": 105.0,
                "width_pt": 235.0,
                "height_pt": 110.0,
            },
            "student_info_box": {
                "x_pt": 305.0,
                "y_pt": 105.0,
                "width_pt": 230.0,
                "height_pt": 110.0,
                "roll_number_digits": 10,
            },
            "instructions_box": {
                "x_pt": 60.0,
                "y_pt": 225.0,
                "width_pt": 475.0,
                "height_pt": 80.0,
            },
        },
        "grid_layout": {
            "column_1_box": {
                "x_pt": 60.0,
                "y_pt": 315.0,
                "width_pt": 235.0,
                "height_pt": 435.0,
            },
            "column_2_box": {
                "x_pt": 305.0,
                "y_pt": 315.0,
                "width_pt": 230.0,
                "height_pt": 435.0,
            },
        },
        "classification_thresholds": {
            "blank_fill_ratio": 0.16,
            "filled_fill_ratio": 0.42,
            "light_fill_ratio": 0.28,
            "ambiguous_difference_threshold": 0.12,
        },
        "questions": questions,
    }
    return config


def save_template_config(dest_path: Path = CONFIG_PATH) -> Path:
    """Generates and writes the canonical template config to disk."""
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    cfg = generate_template_config()
    with open(dest_path, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2)
    return dest_path


def load_template_config(path: Path = CONFIG_PATH) -> Dict[str, Any]:
    """Loads template config from disk, generating it if it doesn't exist."""
    if not path.exists():
        save_template_config(path)
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


if __name__ == "__main__":
    p = save_template_config()
    print(f"Generated template config at: {p}")
