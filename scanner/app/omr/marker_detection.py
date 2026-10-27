"""
Corner Alignment Marker Detection for OMR Sheets.
Locates the 4 solid black corner alignment squares with high precision,
validates their geometric consistency, and extracts sub-pixel marker centers.
"""

import math
from typing import Dict, Any, List, Optional, Tuple
import cv2
import numpy as np

from scanner.app.omr.preprocessing import PreprocessingError


class MarkerDetectionError(PreprocessingError):
    pass


def find_marker_candidates(
    gray: np.ndarray,
    min_area: Optional[float] = None,
    max_area: Optional[float] = None
) -> List[Dict[str, Any]]:
    """
    Finds square-like solid dark contours in the image.
    Uses adaptive and Otsu thresholding to handle variable illumination.
    """
    h, w = gray.shape[:2]
    total_image_area = w * h

    # In our standardized A4 sheet, each marker is ~26x26 pt.
    # At 1200x1700, that's ~52x52 px (~2700 px²).
    # In any photo where sheet occupies >= 50% of the image,
    # marker area is at least 0.0005 * total_image_area (~1000 px² for 1200x1700).
    if min_area is None:
        min_area = max(400.0, total_image_area * 0.00035)
    if max_area is None:
        max_area = total_image_area * 0.06

    candidates = []

    # Adaptive block size must be larger than the marker diameter (~52px at 1200w)
    # to avoid hollowing out the solid black center.
    block_size = max(61, int(w * 0.05) | 1)
    if block_size % 2 == 0:
        block_size += 1

    thresh_adaptive_1 = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, block_size, 10
    )

    thresh_adaptive_2 = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, block_size + 30, 10
    )

    threshold_maps = [thresh_adaptive_1, thresh_adaptive_2]

    for thresh in threshold_maps:
        contours, _ = cv2.findContours(thresh, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)

        for cnt in contours:
            area = cv2.contourArea(cnt)
            if area < min_area or area > max_area:
                continue

            # Bounding box
            bx, by, bw, bh = cv2.boundingRect(cnt)
            aspect_ratio = float(bw) / float(bh)
            if aspect_ratio < 0.65 or aspect_ratio > 1.55:
                continue

            # Solidity check (contour area vs convex hull area)
            hull = cv2.convexHull(cnt)
            hull_area = cv2.contourArea(hull)
            if hull_area == 0:
                continue
            solidity = area / hull_area
            if solidity < 0.80:
                continue

            # Extent check (contour area vs bounding box area)
            extent = area / float(bw * bh)
            if extent < 0.65:
                continue

            # Darkness check: marker must be solid dark print
            mask = np.zeros(gray.shape, dtype=np.uint8)
            cv2.drawContours(mask, [cnt], -1, 255, -1)
            mean_val = cv2.mean(gray, mask=mask)[0]
            if mean_val > 130:
                continue

            # Compute precise center of mass using spatial moments
            M = cv2.moments(cnt)
            if M["m00"] == 0:
                continue
            cx = float(M["m10"] / M["m00"])
            cy = float(M["m01"] / M["m00"])

            candidates.append({
                "contour": cnt,
                "center": (cx, cy),
                "bbox": (bx, by, bw, bh),
                "area": area,
                "solidity": solidity,
                "mean_val": mean_val,
            })

    # Deduplicate candidates that are very close to each other
    unique_candidates: List[Dict[str, Any]] = []
    for cand in candidates:
        cx, cy = cand["center"]
        is_dup = False
        for existing in unique_candidates:
            ex_cx, ex_cy = existing["center"]
            dist = math.hypot(cx - ex_cx, cy - ex_cy)
            if dist < 25.0:
                is_dup = True
                if cand["solidity"] > existing["solidity"]:
                    existing.update(cand)
                break
        if not is_dup:
            unique_candidates.append(cand)

    return unique_candidates


def find_corner_markers(
    gray: np.ndarray,
) -> Dict[str, Tuple[float, float]]:
    """
    Identifies the 4 corner alignment markers: top-left, top-right, bottom-left, bottom-right.
    Returns:
        {
            "top_left": (x, y),
            "top_right": (x, y),
            "bottom_left": (x, y),
            "bottom_right": (x, y)
        }
    Raises MarkerDetectionError if markers cannot be found reliably.
    """
    h, w = gray.shape[:2]
    candidates = find_marker_candidates(gray)

    if len(candidates) < 4:
        raise MarkerDetectionError(
            "MARKER_NOT_FOUND",
            f"Found only {len(candidates)} marker candidates, need 4. Please ensure all four corner markers are clearly visible and uncropped.",
            {"candidates_found": len(candidates)}
        )

    # Divide image into 4 quadrants
    mid_x = w / 2.0
    mid_y = h / 2.0

    quad_tl = [c for c in candidates if c["center"][0] < mid_x and c["center"][1] < mid_y]
    quad_tr = [c for c in candidates if c["center"][0] >= mid_x and c["center"][1] < mid_y]
    quad_bl = [c for c in candidates if c["center"][0] < mid_x and c["center"][1] >= mid_y]
    quad_br = [c for c in candidates if c["center"][0] >= mid_x and c["center"][1] >= mid_y]

    # Every quadrant MUST contain at least one valid candidate
    if not (quad_tl and quad_tr and quad_bl and quad_br):
        missing = []
        if not quad_tl: missing.append("top-left")
        if not quad_tr: missing.append("top-right")
        if not quad_bl: missing.append("bottom-left")
        if not quad_br: missing.append("bottom-right")
        raise MarkerDetectionError(
            "MARKER_NOT_FOUND",
            f"Corner alignment marker(s) missing in {', '.join(missing)} quadrant. Ensure all 4 corners are visible.",
            {"missing_quadrants": missing}
        )

    tl_cand = min(quad_tl, key=lambda c: math.hypot(c["center"][0] - 0, c["center"][1] - 0))
    tr_cand = min(quad_tr, key=lambda c: math.hypot(c["center"][0] - w, c["center"][1] - 0))
    bl_cand = min(quad_bl, key=lambda c: math.hypot(c["center"][0] - 0, c["center"][1] - h))
    br_cand = min(quad_br, key=lambda c: math.hypot(c["center"][0] - w, c["center"][1] - h))

    chosen_cands = [tl_cand, tr_cand, bl_cand, br_cand]

    # 1. Check Area Consistency across the 4 candidates
    # Corner markers have identical printed dimensions; their areas must be consistent
    areas = [c["area"] for c in chosen_cands]
    median_area = float(np.median(areas))
    for idx, c in enumerate(chosen_cands):
        ratio = c["area"] / median_area
        if ratio < 0.40 or ratio > 2.50:
            quad_names = ["top-left", "top-right", "bottom-left", "bottom-right"]
            raise MarkerDetectionError(
                "MARKER_NOT_FOUND",
                f"Candidate marker at {quad_names[idx]} has invalid size ({c['area']:.0f} vs median {median_area:.0f}). Alignment marker may be obscured or corrupted.",
                {"marker": quad_names[idx], "area": c["area"], "median_area": median_area}
            )

    chosen = {
        "top_left": tl_cand["center"],
        "top_right": tr_cand["center"],
        "bottom_left": bl_cand["center"],
        "bottom_right": br_cand["center"],
    }

    # 2. Validate geometric layout of the chosen 4 markers
    tl_x, tl_y = chosen["top_left"]
    tr_x, tr_y = chosen["top_right"]
    bl_x, bl_y = chosen["bottom_left"]
    br_x, br_y = chosen["bottom_right"]

    # Orientation checks: TL must be left of TR and above BL
    if not (tl_x < tr_x and bl_x < br_x and tl_y < bl_y and tr_y < br_y):
        raise MarkerDetectionError(
            "MARKER_ORIENTATION_INVALID",
            "Marker orientation is invalid or rotated upside down. Please orient the sheet right side up.",
            {"chosen_markers": chosen}
        )

    # 3. Width and Height consistency
    top_w = math.hypot(tr_x - tl_x, tr_y - tl_y)
    bot_w = math.hypot(br_x - bl_x, br_y - bl_y)
    left_h = math.hypot(bl_x - tl_x, bl_y - tl_y)
    right_h = math.hypot(br_x - tr_x, br_y - tr_y)

    if top_w < 150 or bot_w < 150 or left_h < 200 or right_h < 200:
        raise MarkerDetectionError(
            "MARKER_TOO_SMALL",
            "The detected sheet area is too small. Please position the camera closer to the sheet.",
            {"top_w": round(top_w, 1), "left_h": round(left_h, 1)}
        )

    w_ratio = top_w / bot_w
    h_ratio = left_h / right_h
    if w_ratio < 0.60 or w_ratio > 1.65 or h_ratio < 0.60 or h_ratio > 1.65:
        raise MarkerDetectionError(
            "MARKER_PERSPECTIVE_EXTREME",
            "Camera angle is too extreme. Hold the phone directly above the sheet facing down.",
            {"width_ratio": round(w_ratio, 2), "height_ratio": round(h_ratio, 2)}
        )

    # 4. Aspect ratio check (A4 height/width is ~1.41)
    avg_w = (top_w + bot_w) / 2.0
    avg_h = (left_h + right_h) / 2.0
    aspect = avg_h / avg_w
    if aspect < 0.95 or aspect > 2.0:
        raise MarkerDetectionError(
            "SHEET_ASPECT_RATIO_INVALID",
            f"The sheet aspect ratio ({aspect:.2f}) does not match standard A4 proportions.",
            {"aspect_ratio": round(aspect, 2)}
        )

    # 5. Span coverage check: corner markers must enclose at least 48% of the image area
    total_area = float(w * h)
    quad_poly = np.array([[tl_x, tl_y], [tr_x, tr_y], [br_x, br_y], [bl_x, bl_y]], dtype=np.float32)
    quad_area = cv2.contourArea(quad_poly)
    if quad_area < 0.48 * total_area:
        raise MarkerDetectionError(
            "MARKER_NOT_FOUND",
            f"Detected marker candidates cover only {quad_area / total_area * 100:.1f}% of the page. True corner markers are missing.",
            {"coverage_fraction": round(quad_area / total_area, 2)}
        )

    return chosen
