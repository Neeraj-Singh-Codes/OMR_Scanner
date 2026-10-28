"""
Dual-Table School OMR Detector and Evaluator (20-Question & 25-Question formats).
Handles real-world school examination answer sheets formatted with two side-by-side
tabular question grids without requiring corner alignment squares or clean margins.
"""

import base64
import re
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


def check_table_grid_lines(gray: np.ndarray, pts: np.ndarray) -> int:
    """Measures horizontal grid line dips to detect lined 25Q tables vs unlined 20Q tables."""
    target_w, target_h = 200, 600
    dst_pts = np.array([[0, 0], [target_w - 1, 0], [target_w - 1, target_h - 1], [0, target_h - 1]], dtype="float32")
    M = cv2.getPerspectiveTransform(pts, dst_pts)
    warped = cv2.warpPerspective(gray, M, (target_w, target_h))
    h_proj = np.mean(warped, axis=1)
    dips = [y for y in range(15, target_h - 15) if h_proj[y] < 165 and h_proj[y] < h_proj[y - 1] and h_proj[y] < h_proj[y + 1]]
    filtered = []
    for y in dips:
        if not filtered or y - filtered[-1] > 20:
            filtered.append(y)
    return len(filtered)


def detect_dual_tables(image: np.ndarray) -> Optional[Dict[str, np.ndarray]]:
    """
    Detects the left (Q1-Q10 or Q1-Q13) and right (Q11-Q20 or Q14-Q25) table quadrilaterals in an OMR image.
    Uses robust symmetric pair scoring so the outer border of the page is never mistaken for a table.
    Pools candidate contours across adaptive and canny edge detection.
    Reconstructs partner table if only one is clearly detected, or falls back to paper boundary projection.
    Returns ordered (4, 2) corners for both tables, or None if not found.
    """
    if len(image.shape) == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = image

    H, W = gray.shape
    min_area = (H * W) * 0.04  # at least 4% of image area
    max_area = (H * W) * 0.55  # at most 55%

    blurred = cv2.GaussianBlur(gray, (5, 5), 0)

    # Multi-strategy contour detection: pool candidates across adaptive and Canny
    all_candidates = []
    for method in ["adaptive", "canny"]:
        if method == "canny":
            edges = cv2.Canny(blurred, 40, 140)
        else:
            edges = cv2.adaptiveThreshold(
                blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 51, 5
            )

        contours, _ = cv2.findContours(edges, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)

        for c in contours:
            area = cv2.contourArea(c)
            if area < min_area or area > max_area:
                continue
            peri = cv2.arcLength(c, True)
            approx = cv2.approxPolyDP(c, 0.02 * peri, True)
            pts = None
            if len(approx) == 4:
                pts = approx.reshape(4, 2)
            elif 4 < len(approx) <= 24:
                min_rect = cv2.minAreaRect(c)
                (rcx, rcy), (rw, rh), angle = min_rect
                if rw > rh:
                    rw, rh = rh, rw
                raspect = rh / max(1.0, rw)
                if 1.20 < raspect < 3.4:
                    pts = cv2.boxPoints(min_rect)

            if pts is not None:
                rect = order_points(pts)
                w_box = float(np.linalg.norm(rect[1] - rect[0]))
                h_box = float(np.linalg.norm(rect[3] - rect[0]))
                aspect = h_box / max(w_box, 1.0)
                if 1.20 < aspect < 3.4:
                    cx = float(np.mean(pts[:, 0]))
                    cy = float(np.mean(pts[:, 1]))
                    if not any(abs(cx - cand["cx"]) < W * 0.06 and abs(cy - cand["cy"]) < H * 0.06 for cand in all_candidates):
                        all_candidates.append({
                            "pts": rect,
                            "cx": cx,
                            "cy": cy,
                            "w": w_box,
                            "h": h_box,
                            "area": area,
                        })

    if len(all_candidates) >= 2:
        best_pair = None
        best_score = -1.0

        for i in range(len(all_candidates)):
            for j in range(i + 1, len(all_candidates)):
                c1, c2 = all_candidates[i], all_candidates[j]
                if c1["cx"] > c2["cx"]:
                    c1, c2 = c2, c1

                x_dist = c2["cx"] - c1["cx"]
                if x_dist < W * 0.18:
                    continue

                h_ratio = min(c1["h"], c2["h"]) / max(c1["h"], c2["h"])
                w_ratio = min(c1["w"], c2["w"]) / max(c1["w"], c2["w"])
                area_ratio = min(c1["area"], c2["area"]) / max(c1["area"], c2["area"])
                y_diff = abs(c1["cy"] - c2["cy"]) / float(H)

                if h_ratio > 0.55 and area_ratio > 0.35 and y_diff < 0.20:
                    score = (h_ratio * 0.4) + (w_ratio * 0.3) + (area_ratio * 0.3) - (y_diff * 1.5)
                    if score > best_score:
                        best_score = score
                        best_pair = (c1, c2)

        if best_pair is not None:
            return {
                "left_table": best_pair[0]["pts"],
                "right_table": best_pair[1]["pts"],
            }

    # If only 1 table was detected with high confidence, project the partner table
    if len(all_candidates) == 1:
        c = all_candidates[0]
        if c["cx"] < W * 0.5:
            dx = c["w"] * 1.05
            rt_pts = c["pts"].copy()
            rt_pts[:, 0] += dx
            return {"left_table": c["pts"], "right_table": rt_pts}
        else:
            dx = c["w"] * 1.05
            lt_pts = c["pts"].copy()
            lt_pts[:, 0] -= dx
            return {"left_table": lt_pts, "right_table": c["pts"]}

    # Fallback: project dual tables from detected paper sheet boundary
    try:
        from scanner.app.omr.marker_detection import detect_paper_sheet
        paper = detect_paper_sheet(gray)
        if paper is not None:
            src_paper = np.array([paper["top_left"], paper["top_right"], paper["bottom_right"], paper["bottom_left"]], dtype="float32")
            dst_paper = np.array([[0, 0], [1200, 0], [1200, 1700], [0, 1700]], dtype="float32")
            M_c2p = cv2.getPerspectiveTransform(dst_paper, src_paper)

            canon_lt = np.array([[60, 430], [580, 430], [580, 1600], [60, 1600]], dtype="float32").reshape(-1, 1, 2)
            canon_rt = np.array([[600, 430], [1120, 430], [1120, 1600], [600, 1600]], dtype="float32").reshape(-1, 1, 2)

            lt_orig = cv2.perspectiveTransform(canon_lt, M_c2p).reshape(4, 2)
            rt_orig = cv2.perspectiveTransform(canon_rt, M_c2p).reshape(4, 2)
            return {"left_table": lt_orig, "right_table": rt_orig}
    except Exception:
        pass

    return None


def evaluate_dual_table_omr(
    image: np.ndarray,
    dual_tables: Dict[str, np.ndarray],
    generate_annotated: bool = True,
    sharpness: float = 100.0,
    total_questions: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Warp-corrects the dual question tables, measures circular bubble fill states,
    and returns detected answers adhering to the standard OMR response structure.
    Seamlessly adapts to 20-Question (10 left, 10 right) and 25-Question (13 left, 12 right) layouts.
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

    # Multi-channel ink map combining both darkness and blue/purple ink differential
    if len(image.shape) == 3:
        b, g, r = cv2.split(image)
        ink_diff = cv2.subtract(b, r)
        dark_gray = cv2.subtract(255, gray)
        ink_map = cv2.addWeighted(ink_diff, 1.5, dark_gray, 0.5, 0)
    else:
        ink_map = cv2.subtract(255, gray)

    warped_ink_left = cv2.warpPerspective(ink_map, M_left, (target_w, target_h))
    warped_ink_right = cv2.warpPerspective(ink_map, M_right, (target_w, target_h))

    # Determine layout: 20Q vs 25Q
    if total_questions is not None and total_questions <= 20:
        is_20q = True
    elif total_questions == 25:
        is_20q = False
    else:
        # Auto-detect: check horizontal grid dips
        grid_dips = check_table_grid_lines(gray, dual_tables["left_table"])
        is_20q = (grid_dips <= 18)

    if is_20q:
        q_count_left = 10
        q_count_right = 10
        total_q = 20
        opt_x_centers = [166, 256, 345, 435]
        template_ver = "SCHOOL-20Q-DUAL-TABLE"
        row_y_left = [int(68 + i * 121) for i in range(10)]
        row_y_right = [int(70 + i * 121) for i in range(10)]

        # Fine-tune row y-centers using HoughCircles if circles are detected
        for w_img, row_ys in [(warped_left, row_y_left), (warped_right, row_y_right)]:
            blurred_t = cv2.medianBlur(w_img, 5)
            circles = cv2.HoughCircles(blurred_t, cv2.HOUGH_GRADIENT, dp=1, minDist=35, param1=50, param2=25, minRadius=14, maxRadius=32)
            if circles is not None:
                c_ys = [float(c[1]) for c in circles[0] if 40 <= c[1] <= 1260]
                if len(c_ys) >= 6:
                    best_d = 0
                    max_hits = 0
                    for d in range(-30, 31, 2):
                        hits = sum(1 for y in c_ys if any(abs((ry + d) - y) < 18 for ry in row_ys))
                        if hits > max_hits:
                            max_hits = hits
                            best_d = d
                    if max_hits >= 6:
                        for idx in range(10):
                            row_ys[idx] += best_d
    else:
        q_count_left = 13
        q_count_right = 12
        total_q = 25
        row_h_left = target_h / 13.0
        row_h_right = target_h / 12.0
        opt_x_centers = [150, 250, 350, 450]
        template_ver = "SCHOOL-25Q-DUAL-TABLE"
        row_y_left = [int((q - 0.5) * row_h_left) for q in range(1, 14)]
        row_y_right = [int((q - 0.5) * row_h_right) for q in range(1, 13)]

    options = ["A", "B", "C", "D"]

    detected_answers: Dict[str, Optional[str]] = {}
    classified_questions: List[Dict[str, Any]] = []
    blank_count = 0
    multiple_count = 0
    ambiguous_count = 0
    review_required = []

    # Draw table borders on annotated image
    cv2.polylines(annotated, [dual_tables["left_table"].astype(np.int32)], True, (79, 70, 229), 2)
    cv2.polylines(annotated, [dual_tables["right_table"].astype(np.int32)], True, (79, 70, 229), 2)

    # Auto-crop candidate header region and perform high-precision candidate OCR
    header_b64 = None
    candidate_info = {
        "student_name": "Unassigned Student",
        "roll_number": "UNASSIGNED",
        "division": None,
        "confidence": 0.0,
        "is_ambiguous": True,
        "ambiguity_reason": "Header could not be located.",
    }
    warped_hdr = None
    try:
        from scanner.app.services.candidate_ocr import warp_candidate_header, extract_candidate_info
        warped_hdr = warp_candidate_header(image, dual_tables)
        if warped_hdr is not None and warped_hdr.size > 0:
            candidate_info = extract_candidate_info(warped_hdr)
            _, hdr_buf = cv2.imencode(".jpg", warped_hdr, [cv2.IMWRITE_JPEG_QUALITY, 90])
            header_b64 = base64.b64encode(hdr_buf).decode("utf-8")
    except Exception:
        pass

    # Regex OCR fallback if candidate name or roll number remains unassigned
    if candidate_info.get("roll_number") == "UNASSIGNED" or candidate_info.get("student_name") == "Unassigned Student":
        try:
            from rapidocr_onnxruntime import RapidOCR
            ocr_engine = RapidOCR()
            target_hdr = warped_hdr
            if target_hdr is None or target_hdr.size == 0:
                # Use top 30% of image
                h_img = image.shape[0]
                target_hdr = image[:int(h_img * 0.3), :]

            ocr_res, _ = ocr_engine(target_hdr)
            if ocr_res:
                lines = [r[1].strip() for r in ocr_res]
                full_hdr_text = "\n".join(lines)
                if candidate_info.get("roll_number") == "UNASSIGNED":
                    r_match = re.search(r"(?:Roll\s*No\.?|Roll|Rol)\s*[:_\.\s-]*([0-9]{1,4})\b", full_hdr_text, re.IGNORECASE)
                    if r_match:
                        candidate_info["roll_number"] = r_match.group(1)
                        candidate_info["is_ambiguous"] = False
                    else:
                        for idx_l, line_l in enumerate(lines):
                            if re.search(r"Roll|Rol", line_l, re.IGNORECASE):
                                nums = re.findall(r"\b\d{1,3}\b", line_l)
                                nums = [n for n in nums if n not in ["40", "20", "23", "26", "10"]]
                                if nums:
                                    candidate_info["roll_number"] = nums[0]
                                    candidate_info["is_ambiguous"] = False
                                    break
                                for adj in [idx_l - 1, idx_l + 1]:
                                    if 0 <= adj < len(lines):
                                        nums = re.findall(r"^\s*(\d{1,3})\s*$", lines[adj])
                                        nums = [n for n in nums if n not in ["40", "20", "23", "26", "10"]]
                                        if nums:
                                            candidate_info["roll_number"] = nums[0]
                                            candidate_info["is_ambiguous"] = False
                                            break
                if candidate_info.get("student_name") == "Unassigned Student":
                    n_match = re.search(r"(?:Name|ame)\s*[:_\.\s-]*([A-Za-z\.\s]{3,30})", full_hdr_text, re.IGNORECASE)
                    if n_match:
                        cand_n = n_match.group(1).strip()
                        cand_n = re.sub(r"(?:Roll|Division|Score|Date|Total).*", "", cand_n, flags=re.IGNORECASE).strip()
                        if len(cand_n) >= 2:
                            candidate_info["student_name"] = cand_n
                            candidate_info["is_ambiguous"] = False
                    else:
                        for idx_l, line_l in enumerate(lines):
                            if re.search(r"^\s*(?:Name|ame)[:_\.\s]*$", line_l, re.IGNORECASE):
                                for adj in [idx_l + 1, idx_l - 1]:
                                    if 0 <= adj < len(lines):
                                        cand_n = lines[adj].strip()
                                        if re.match(r"^[A-Za-z\.\s]{3,30}$", cand_n) and not any(k in cand_n.upper() for k in ["OMR", "SHEET", "TOTAL", "DIVISION", "SCORE"]):
                                            candidate_info["student_name"] = cand_n
                                            candidate_info["is_ambiguous"] = False
                                            break
        except Exception:
            pass

    # Helper function to process each question row
    def process_question_row(q: int, warped_table: np.ndarray, warped_ink: np.ndarray, y_center: int, M_inv: np.ndarray):
        nonlocal blank_count, multiple_count, ambiguous_count

        option_data = {}
        for opt_idx, opt in enumerate(options):
            xc = opt_x_centers[opt_idx]
            patch_gray = warped_table[max(0, y_center - 24) : min(target_h, y_center + 24), max(0, xc - 24) : min(target_w, xc + 24)]
            patch_ink = warped_ink[max(0, y_center - 24) : min(target_h, y_center + 24), max(0, xc - 24) : min(target_w, xc + 24)]

            avg_brightness = float(np.mean(patch_gray))
            ink_score = float(np.mean(patch_ink))
            # Darkness combining grayscale and ink differential
            darkness = max(0.0, min(1.0, max((170.0 - avg_brightness) / 120.0, ink_score / 110.0)))

            option_data[opt] = {
                "avg_val": avg_brightness,
                "ink_score": ink_score,
                "fill_ratio": darkness,
                "x_center": xc,
            }

        fill_vals = [option_data[opt]["fill_ratio"] for opt in options]
        max_fill = max(fill_vals)
        best_opt = [opt for opt in options if option_data[opt]["fill_ratio"] == max_fill][0]
        sorted_fills = sorted(fill_vals, reverse=True)
        runner_up = sorted_fills[1] if len(sorted_fills) > 1 else 0.0

        contrast = max_fill - runner_up
        if max_fill < 0.28:
            status = "BLANK"
            classified_ans = None
            blank_count += 1
        elif runner_up > 0.40 and contrast < 0.15:
            status = "MULTIPLE_MARKED"
            classified_ans = best_opt
            multiple_count += 1
            review_required.append(q)
        elif contrast < 0.18 and max_fill < 0.65:
            status = "AMBIGUOUS"
            classified_ans = best_opt
            ambiguous_count += 1
            review_required.append(q)
        else:
            status = "CONFIDENT"
            classified_ans = best_opt

        detected_answers[str(q)] = classified_ans
        classified_questions.append({
            "question_number": q,
            "status": status,
            "detected_answer": classified_ans,
            "fill_ratios": {opt: round(option_data[opt]["fill_ratio"], 3) for opt in options},
            "best_option": best_opt,
            "max_fill_ratio": round(max_fill, 3),
        })

        if classified_ans:
            wc = (option_data[classified_ans]["x_center"], y_center)
            pt_orig = cv2.perspectiveTransform(
                np.array([[[wc[0], wc[1]]]], dtype="float32"), M_inv
            )[0][0]
            circ_color = (0, 200, 0) if status == "CONFIDENT" else (0, 215, 255)
            cv2.circle(annotated, (int(pt_orig[0]), int(pt_orig[1])), 14, circ_color, 3, cv2.LINE_AA)

    # Process Left Table
    for q in range(1, q_count_left + 1):
        y_center = row_y_left[q - 1]
        process_question_row(q, warped_left, warped_ink_left, y_center, M_left_inv)

    # Process Right Table
    for q in range(q_count_left + 1, q_count_left + q_count_right + 1):
        row_idx = q - q_count_left
        y_center = row_y_right[row_idx - 1]
        process_question_row(q, warped_right, warped_ink_right, y_center, M_right_inv)

    annotated_b64 = None
    if generate_annotated:
        _, buffer = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 85])
        annotated_b64 = base64.b64encode(buffer).decode("utf-8")

    is_review = len(review_required) > 0

    return {
        "success": True,
        "template_version": template_ver,
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
        "candidate_info": candidate_info,
        "diagnostics": {
            "processing_time_ms": 0.0,
            "sharpness_score": sharpness,
            "template_type": "DUAL_TABLE_20Q" if is_20q else "DUAL_TABLE_25Q",
            "annotated_image_base64": annotated_b64,
            "header_image_base64": header_b64,
            "candidate_info": candidate_info,
        },
        "annotated_image_base64": annotated_b64,
    }
