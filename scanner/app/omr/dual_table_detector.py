"""
Dual-Table 25-Question School OMR Detector and Evaluator.
Handles real-world school examination answer sheets formatted with two side-by-side
tabular question grids (Questions 1 to 13 on the left, Questions 14 to 25 on the right)
without requiring corner alignment squares.
"""

import base64
from typing import Dict, Any, Optional, Tuple, List
import cv2
import numpy as np


def order_points(pts: np.ndarray) -> np.ndarray:
    """Orders 4 points as: top-left, top-right, bottom-right, bottom-left."""
    pts = np.array(pts, dtype="float32")
    rect = np.zeros((4, 2), dtype="float32")
    s = pts.sum(axis=1)
    rect[0] = pts[np.argmin(s)]  # top-left
    rect[2] = pts[np.argmax(s)]  # bottom-right
    diff = np.diff(pts, axis=1)
    rect[1] = pts[np.argmin(diff)]  # top-right
    rect[3] = pts[np.argmax(diff)]  # bottom-left
    return rect


def detect_dual_tables(image: np.ndarray) -> Optional[Dict[str, np.ndarray]]:
    """
    Detects the left (Q1-Q13) and right (Q14-Q25) table quadrilaterals in an OMR image.
    Returns ordered (4, 2) corners for both tables, or None if not found.
    """
    if len(image.shape) == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = image

    H, W = gray.shape
    min_area = (H * W) * 0.08  # at least 8% of image area

    blurred = cv2.GaussianBlur(gray, (5, 5), 0)

    # Multi-strategy contour detection: Canny first, then adaptive thresholding
    for method in ["canny", "adaptive"]:
        if method == "canny":
            edges = cv2.Canny(blurred, 40, 140)
        else:
            edges = cv2.adaptiveThreshold(
                blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 51, 5
            )

        contours, _ = cv2.findContours(edges, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
        contours = sorted(contours, key=cv2.contourArea, reverse=True)

        candidates = []
        for c in contours:
            area = cv2.contourArea(c)
            if area < min_area:
                continue
            peri = cv2.arcLength(c, True)
            approx = cv2.approxPolyDP(c, 0.02 * peri, True)
            if len(approx) == 4:
                pts = approx.reshape(4, 2)
                cx = float(np.mean(pts[:, 0]))
                cy = float(np.mean(pts[:, 1]))
                rect = order_points(pts)
                w_box = float(np.linalg.norm(rect[1] - rect[0]))
                h_box = float(np.linalg.norm(rect[3] - rect[0]))
                aspect = h_box / max(w_box, 1.0)
                # Each question table is vertically elongated (aspect ratio ~ 1.4 to 2.8)
                if 1.3 < aspect < 3.0:
                    if not any(abs(cx - cand["cx"]) < W * 0.08 for cand in candidates):
                        candidates.append({"pts": rect, "cx": cx, "cy": cy, "area": area})

        candidates = sorted(candidates, key=lambda t: t["cx"])
        if len(candidates) >= 2:
            # Verify candidate tables have internal horizontal row grid lines
            target_w, target_h = 200, 600
            dst_pts = np.array(
                [[0, 0], [target_w - 1, 0], [target_w - 1, target_h - 1], [0, target_h - 1]],
                dtype="float32",
            )
            M_chk = cv2.getPerspectiveTransform(candidates[0]["pts"], dst_pts)
            w_chk = cv2.warpPerspective(gray, M_chk, (target_w, target_h))
            h_proj = np.mean(w_chk, axis=1)
            line_dips = [
                y for y in range(15, target_h - 15)
                if h_proj[y] < 140 and h_proj[y] < h_proj[y - 1] and h_proj[y] < h_proj[y + 1]
            ]
            filtered_dips = []
            for y in line_dips:
                if not filtered_dips or y - filtered_dips[-1] > 20:
                    filtered_dips.append(y)

            # A real 12/13 row table has at least 6 visible horizontal line dips
            if len(filtered_dips) >= 6:
                return {
                    "left_table": candidates[0]["pts"],
                    "right_table": candidates[1]["pts"],
                }

    return None


def evaluate_dual_table_omr(
    image: np.ndarray,
    dual_tables: Dict[str, np.ndarray],
    generate_annotated: bool = True,
    sharpness: float = 100.0,
) -> Dict[str, Any]:
    """
    Warp-corrects the dual question tables, measures circular bubble fill states,
    and returns detected answers adhering to the standard OMR response structure.
    """
    if len(image.shape) == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        annotated = image.copy()
    else:
        gray = image
        annotated = cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)

    target_w, target_h = 500, 1300
    dst_pts = np.array(
        [[0, 0], [target_w - 1, 0], [target_w - 1, target_h - 1], [0, target_h - 1]],
        dtype="float32",
    )

    # Perspective transforms
    M_left = cv2.getPerspectiveTransform(order_points(dual_tables["left_table"]), dst_pts)
    warped_left = cv2.warpPerspective(gray, M_left, (target_w, target_h))
    M_left_inv = cv2.getPerspectiveTransform(dst_pts, order_points(dual_tables["left_table"]))

    M_right = cv2.getPerspectiveTransform(order_points(dual_tables["right_table"]), dst_pts)
    warped_right = cv2.warpPerspective(gray, M_right, (target_w, target_h))
    M_right_inv = cv2.getPerspectiveTransform(dst_pts, order_points(dual_tables["right_table"]))

    options = ["A", "B", "C", "D"]
    row_h_left = target_h / 13.0  # 13 questions in left table
    row_h_right = target_h / 12.0  # 12 questions in right table

    detected_answers: Dict[str, Optional[str]] = {}
    classified_questions: List[Dict[str, Any]] = []
    blank_count = 0
    multiple_count = 0
    ambiguous_count = 0
    review_required = []

    # Draw table borders on annotated image
    cv2.polylines(annotated, [dual_tables["left_table"].astype(np.int32)], True, (79, 70, 229), 2)
    cv2.polylines(annotated, [dual_tables["right_table"].astype(np.int32)], True, (79, 70, 229), 2)

    # Auto-crop candidate header region for visual identification
    header_b64 = None
    try:
        lt = dual_tables["left_table"]
        rt = dual_tables["right_table"]
        x_min = max(0, int(min(lt[0][0], lt[3][0]) - 15))
        x_max = min(image.shape[1], int(max(rt[1][0], rt[2][0]) + 15))
        y_min = max(0, int(min(lt[0][1], rt[0][1]) - 165))
        y_max = max(0, int(min(lt[0][1], rt[0][1]) - 5))
        if y_max > y_min + 30 and x_max > x_min + 100:
            hdr_crop = image[y_min:y_max, x_min:x_max]
            _, hdr_buf = cv2.imencode(".jpg", hdr_crop, [cv2.IMWRITE_JPEG_QUALITY, 85])
            header_b64 = base64.b64encode(hdr_buf).decode("utf-8")
    except Exception:
        header_b64 = None

    # Helper function to process each question row
    def process_question_row(q: int, warped_table: np.ndarray, y_center: int, M_inv: np.ndarray):
        nonlocal blank_count, multiple_count, ambiguous_count

        option_data = {}
        for opt_idx, opt in enumerate(options):
            x_min = int(100 + opt_idx * 100)
            x_max = int(100 + (opt_idx + 1) * 100)
            patch = warped_table[y_center - 25 : y_center + 25, x_min + 20 : x_max - 20]
            avg_brightness = float(np.mean(patch))
            darkness = max(0.0, min(1.0, (180.0 - avg_brightness) / 130.0))
            option_data[opt] = {
                "avg_val": avg_brightness,
                "fill_ratio": darkness,
                "warped_center": (int(100 + (opt_idx + 0.5) * 100), y_center),
            }

        sorted_opts = sorted(options, key=lambda o: option_data[o]["avg_val"])
        top_opt = sorted_opts[0]
        second_opt = sorted_opts[1]
        top_val = option_data[top_opt]["avg_val"]
        second_val = option_data[second_opt]["avg_val"]
        contrast = second_val - top_val

        status = "CONFIDENT"
        selected: Optional[str] = None

        if top_val > 110.0 or contrast < 20.0:
            status = "BLANK"
            blank_count += 1
            selected = None
        elif second_val < 95.0 and contrast < 25.0:
            status = "MULTIPLE_MARKED"
            multiple_count += 1
            review_required.append(q)
            selected = None
        elif contrast < 35.0:
            status = "AMBIGUOUS"
            ambiguous_count += 1
            review_required.append(q)
            selected = top_opt
        else:
            status = "CONFIDENT"
            selected = top_opt

        detected_answers[str(q)] = selected
        classified_questions.append(
            {
                "question_number": q,
                "status": status,
                "selected_option": selected,
                "options": {
                    o: {
                        "fill_ratio": option_data[o]["fill_ratio"],
                        "mean_intensity": option_data[o]["avg_val"],
                    }
                    for o in options
                },
            }
        )

        if generate_annotated and selected:
            wc = option_data[selected]["warped_center"]
            pt_orig = cv2.perspectiveTransform(
                np.array([[[wc[0], wc[1]]]], dtype="float32"), M_inv
            )[0][0]
            circ_color = (0, 200, 0) if status == "CONFIDENT" else (0, 215, 255)
            cv2.circle(annotated, (int(pt_orig[0]), int(pt_orig[1])), 14, circ_color, 3, cv2.LINE_AA)

    # Process Left Table (Q1 to Q13)
    for q in range(1, 14):
        y_center = int((q - 0.5) * row_h_left)
        process_question_row(q, warped_left, y_center, M_left_inv)

    # Process Right Table (Q14 to Q25)
    for q in range(14, 26):
        row_idx = q - 14
        y_center = int((row_idx + 0.5) * row_h_right)
        process_question_row(q, warped_right, y_center, M_right_inv)

    annotated_b64 = None
    if generate_annotated:
        _, buffer = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 85])
        annotated_b64 = base64.b64encode(buffer).decode("utf-8")

    total_q = 25
    is_review = len(review_required) > 0

    return {
        "success": True,
        "template_version": "SCHOOL-25Q-DUAL-TABLE",
        "total_questions": total_q,
        "detected_answers": detected_answers,
        "summary": {
            "confident_count": total_q - blank_count - multiple_count - ambiguous_count,
            "blank_count": blank_count,
            "multiple_marked_count": multiple_count,
            "ambiguous_count": ambiguous_count,
            "review_required": is_review,
            "review_question_numbers": review_required,
        },
        "questions": classified_questions,
        "diagnostics": {
            "processing_time_ms": 0.0,
            "sharpness_score": sharpness,
            "template_type": "DUAL_TABLE_25Q",
            "annotated_image_base64": annotated_b64,
            "header_image_base64": header_b64,
        },
        "annotated_image_base64": annotated_b64,
    }
