"""
Corner Alignment Marker Detection and Paper Boundary Detection for OMR Sheets.
Locates solid black corner alignment squares, reconstructs missing markers via
geometric parallelogram / affine projection, and provides whole-paper boundary detection.
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
    if len(gray.shape) == 3:
        gray = cv2.cvtColor(gray, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape[:2]
    total_image_area = w * h

    # In our standardized A4 sheet, each marker is ~26x26 pt.
    # At 1200x1700, that's ~52x52 px (~2700 px²).
    # In any photo where sheet occupies >= 20% of the image,
    # marker area is at least 0.0004 * total_image_area (~800 px²).
    # Bubbles (circles with area ~640 px² and extent ~0.71) are excluded by area and extent.
    if min_area is None:
        min_area = max(500.0, total_image_area * 0.0004)
    if max_area is None:
        max_area = total_image_area * 0.08

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
            # Solid square markers have aspect ratio ~ 1.0 (0.70 to 1.42)
            if aspect_ratio < 0.70 or aspect_ratio > 1.42:
                continue

            # Solidity check (contour area vs convex hull area)
            hull = cv2.convexHull(cnt)
            hull_area = cv2.contourArea(hull)
            if hull_area == 0:
                continue
            solidity = area / hull_area
            if solidity < 0.75:
                continue

            # Extent check (contour area vs bounding box area)
            # A solid square has extent ~ 0.95-1.0; a circle has extent pi/4 ~ 0.785
            extent = area / float(bw * bh)
            if extent < 0.82:
                continue

            # Darkness check: marker must be solid dark print
            mask = np.zeros(gray.shape, dtype=np.uint8)
            cv2.drawContours(mask, [cnt], -1, 255, -1)
            mean_val = cv2.mean(gray, mask=mask)[0]
            if mean_val > 140:
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
                "extent": extent,
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
    Identifies or geometrically reconstructs the 4 corner alignment markers:
    top-left, top-right, bottom-left, bottom-right.
    
    Resilient Architecture:
    - 4 markers detected: high-precision sub-pixel centers.
    - 3 markers detected (1 corner covered by finger, shadow, or clipped in framing):
      Mathematically reconstructs the missing 4th corner via affine parallelogram completion
      (TL + BR = TR + BL).
    - 2 markers detected (2 corners covered/clipped):
      Projects the opposite edge/corners using the canonical A4 grid aspect ratio.
    """
    h, w = gray.shape[:2]
    candidates = find_marker_candidates(gray)

    # Filter out small outliers if true markers exist
    if candidates:
        max_a = max(c["area"] for c in candidates)
        candidates = [c for c in candidates if c["area"] >= 0.40 * max_a]

    if len(candidates) < 2:
        raise MarkerDetectionError(
            "MARKER_NOT_FOUND",
            f"Found only {len(candidates)} marker candidates. Sheet content or table boundaries required.",
            {"candidates_found": len(candidates)}
        )

    # Adaptive center of mass for quadrant partitioning
    cand_xs = [c["center"][0] for c in candidates]
    cand_ys = [c["center"][1] for c in candidates]
    mid_x = (np.mean(cand_xs) + (w / 2.0)) / 2.0
    mid_y = (np.mean(cand_ys) + (h / 2.0)) / 2.0

    quad_tl = [c for c in candidates if c["center"][0] < mid_x and c["center"][1] < mid_y]
    quad_tr = [c for c in candidates if c["center"][0] >= mid_x and c["center"][1] < mid_y]
    quad_bl = [c for c in candidates if c["center"][0] < mid_x and c["center"][1] >= mid_y]
    quad_br = [c for c in candidates if c["center"][0] >= mid_x and c["center"][1] >= mid_y]

    tl_cand = min(quad_tl, key=lambda c: math.hypot(c["center"][0] - 0, c["center"][1] - 0)) if quad_tl else None
    tr_cand = min(quad_tr, key=lambda c: math.hypot(c["center"][0] - w, c["center"][1] - 0)) if quad_tr else None
    bl_cand = min(quad_bl, key=lambda c: math.hypot(c["center"][0] - 0, c["center"][1] - h)) if quad_bl else None
    br_cand = min(quad_br, key=lambda c: math.hypot(c["center"][0] - w, c["center"][1] - h)) if quad_br else None

    detected_cands = [c for c in [tl_cand, tr_cand, bl_cand, br_cand] if c is not None]

    # Canonical marker grid aspect ratio (H_grid / W_grid):
    # From canonical markers: (1601.06 - 98.94) / (1101.22 - 98.78) = 1502.12 / 1002.44 = 1.498463
    GRID_ASPECT_RATIO = 1.498463

    if len(detected_cands) >= 4:
        # All 4 corners clearly visible
        tl_pt = tl_cand["center"]
        tr_pt = tr_cand["center"]
        bl_pt = bl_cand["center"]
        br_pt = br_cand["center"]
    elif len(detected_cands) == 3:
        # 1 corner obscured (e.g. finger/thumb or frame cut) -> Parallelogram completion: TL + BR = TR + BL
        if not tl_cand:
            tr, bl, br = tr_cand["center"], bl_cand["center"], br_cand["center"]
            tl_pt = (tr[0] + bl[0] - br[0], tr[1] + bl[1] - br[1])
            tr_pt, bl_pt, br_pt = tr, bl, br
        elif not tr_cand:
            tl, bl, br = tl_cand["center"], bl_cand["center"], br_cand["center"]
            tr_pt = (tl[0] + br[0] - bl[0], tl[1] + br[1] - bl[1])
            tl_pt, bl_pt, br_pt = tl, bl, br
        elif not bl_cand:
            tl, tr, br = tl_cand["center"], tr_cand["center"], br_cand["center"]
            bl_pt = (tl[0] + br[0] - tr[0], tl[1] + br[1] - tr[1])
            tl_pt, tr_pt, br_pt = tl, tr, br
        else:  # not br_cand
            tl, tr, bl = tl_cand["center"], tr_cand["center"], bl_cand["center"]
            br_pt = (tr[0] + bl[0] - tl[0], tr[1] + bl[1] - tl[1])
            tl_pt, tr_pt, bl_pt = tl, tr, bl
    elif len(detected_cands) == 2:
        # 2 corners visible -> Project remaining 2 via canonical aspect ratio
        if tl_cand and tr_cand:
            v = np.array(tr_cand["center"]) - np.array(tl_cand["center"])
            len_v = max(float(np.linalg.norm(v)), 1.0)
            perp = np.array([-v[1], v[0]]) / len_v
            u = perp * (len_v * GRID_ASPECT_RATIO)
            tl_pt = tl_cand["center"]
            tr_pt = tr_cand["center"]
            bl_pt = tuple(np.array(tl_pt) + u)
            br_pt = tuple(np.array(tr_pt) + u)
        elif bl_cand and br_cand:
            v = np.array(br_cand["center"]) - np.array(bl_cand["center"])
            len_v = max(float(np.linalg.norm(v)), 1.0)
            perp = np.array([v[1], -v[0]]) / len_v
            u = perp * (len_v * GRID_ASPECT_RATIO)
            bl_pt = bl_cand["center"]
            br_pt = br_cand["center"]
            tl_pt = tuple(np.array(bl_pt) + u)
            tr_pt = tuple(np.array(br_pt) + u)
        elif tl_cand and bl_cand:
            v = np.array(bl_cand["center"]) - np.array(tl_cand["center"])
            len_v = max(float(np.linalg.norm(v)), 1.0)
            perp = np.array([v[1], -v[0]]) / len_v
            u = perp * (len_v / GRID_ASPECT_RATIO)
            tl_pt = tl_cand["center"]
            bl_pt = bl_cand["center"]
            tr_pt = tuple(np.array(tl_pt) + u)
            br_pt = tuple(np.array(bl_pt) + u)
        elif tr_cand and br_cand:
            v = np.array(br_cand["center"]) - np.array(tr_cand["center"])
            len_v = max(float(np.linalg.norm(v)), 1.0)
            perp = np.array([-v[1], v[0]]) / len_v
            u = perp * (len_v / GRID_ASPECT_RATIO)
            tr_pt = tr_cand["center"]
            br_pt = br_cand["center"]
            tl_pt = tuple(np.array(tr_pt) + u)
            bl_pt = tuple(np.array(br_pt) + u)
        elif tl_cand and br_cand:
            c = (np.array(tl_cand["center"]) + np.array(br_cand["center"])) / 2.0
            d = np.array(br_cand["center"]) - np.array(tl_cand["center"])
            tl_pt = tl_cand["center"]
            br_pt = br_cand["center"]
            tr_pt = tuple(c + np.array([d[0] / 2.0, -d[1] / 2.0]))
            bl_pt = tuple(c + np.array([-d[0] / 2.0, d[1] / 2.0]))
        elif tr_cand and bl_cand:
            c = (np.array(tr_cand["center"]) + np.array(bl_cand["center"])) / 2.0
            d = np.array(tr_cand["center"]) - np.array(bl_cand["center"])
            tr_pt = tr_cand["center"]
            bl_pt = bl_cand["center"]
            tl_pt = tuple(c + np.array([-d[0] / 2.0, -d[1] / 2.0]))
            br_pt = tuple(c + np.array([d[0] / 2.0, d[1] / 2.0]))
        else:
            raise MarkerDetectionError(
                "MARKER_NOT_FOUND",
                "Insufficient corner markers to resolve orientation.",
                {"detected_count": len(detected_cands)}
            )
    else:
        raise MarkerDetectionError(
            "MARKER_NOT_FOUND",
            f"Found only {len(detected_cands)} valid quadrant markers.",
            {"detected_count": len(detected_cands)}
        )

    chosen = {
        "top_left": (float(tl_pt[0]), float(tl_pt[1])),
        "top_right": (float(tr_pt[0]), float(tr_pt[1])),
        "bottom_left": (float(bl_pt[0]), float(bl_pt[1])),
        "bottom_right": (float(br_pt[0]), float(br_pt[1])),
    }

    # Validate geometric layout
    tl_x, tl_y = chosen["top_left"]
    tr_x, tr_y = chosen["top_right"]
    bl_x, bl_y = chosen["bottom_left"]
    br_x, br_y = chosen["bottom_right"]

    if not (tl_x < tr_x and bl_x < br_x and tl_y < bl_y and tr_y < br_y):
        raise MarkerDetectionError(
            "MARKER_ORIENTATION_INVALID",
            "Marker orientation is invalid or rotated upside down. Please orient the sheet right side up.",
            {"chosen_markers": chosen}
        )

    top_w = math.hypot(tr_x - tl_x, tr_y - tl_y)
    bot_w = math.hypot(br_x - bl_x, br_y - bl_y)
    left_h = math.hypot(bl_x - tl_x, bl_y - tl_y)
    right_h = math.hypot(br_x - tr_x, br_y - tr_y)

    if top_w < 80 or bot_w < 80 or left_h < 80 or right_h < 80:
        raise MarkerDetectionError(
            "MARKER_TOO_SMALL",
            "The detected sheet area is too small. Please position the camera closer to the sheet.",
            {"top_w": round(top_w, 1), "left_h": round(left_h, 1)}
        )

    # Relaxed aspect ratio check (A4 is ~1.41)
    avg_w = (top_w + bot_w) / 2.0
    avg_h = (left_h + right_h) / 2.0
    aspect = avg_h / max(avg_w, 1.0)
    if aspect < 0.70 or aspect > 2.5:
        raise MarkerDetectionError(
            "SHEET_ASPECT_RATIO_INVALID",
            f"The sheet aspect ratio ({aspect:.2f}) does not match standard proportions.",
            {"aspect_ratio": round(aspect, 2)}
        )

    # Relaxed span coverage check: markers must enclose at least 15% of the image area
    total_area = float(w * h)
    quad_poly = np.array([[tl_x, tl_y], [tr_x, tr_y], [br_x, br_y], [bl_x, bl_y]], dtype=np.float32)
    quad_area = cv2.contourArea(quad_poly)
    if quad_area < 0.15 * total_area:
        raise MarkerDetectionError(
            "MARKER_NOT_FOUND",
            f"Detected markers cover only {quad_area / total_area * 100:.1f}% of the image. Sheet content required.",
            {"coverage_fraction": round(quad_area / total_area, 2)}
        )

    return chosen


def detect_paper_sheet(
    gray: np.ndarray,
    canonical_w: int = 1200,
    canonical_h: int = 1700,
    config: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Tuple[float, float]]]:
    """
    Detects the physical quadrilateral paper sheet contour against a desk/surface background.
    Maps paper boundary to canonical A4 dimensions and projects canonical marker coordinates,
    allowing 100% alignment even when no corner markers are printed or visible.
    """
    from scanner.app.services.template_config import load_template_config

    if config is None:
        config = load_template_config()

    canonical_markers = config.get("markers", {})
    if not canonical_markers:
        return None

    if len(gray.shape) == 3:
        gray = cv2.cvtColor(gray, cv2.COLOR_BGR2GRAY)

    h, w = gray.shape[:2]
    total_area = w * h
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)

    best_box = None
    max_area = 0

    for method in ["otsu", "adaptive", "canny"]:
        if method == "otsu":
            _, binary = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        elif method == "adaptive":
            binary = cv2.adaptiveThreshold(blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 51, 10)
        else:
            binary = cv2.Canny(blurred, 30, 120)

        k = cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7))
        closed = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, k)
        cnts, _ = cv2.findContours(closed, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)

        for c in cnts:
            area = cv2.contourArea(c)
            if area < total_area * 0.15 or area > total_area * 0.98:
                continue
            peri = cv2.arcLength(c, True)
            approx = cv2.approxPolyDP(c, 0.02 * peri, True)
            if len(approx) == 4 and cv2.isContourConvex(approx):
                if area > max_area:
                    max_area = area
                    best_box = approx.reshape(4, 2)
            elif 4 < len(approx) <= 12:
                rect = cv2.minAreaRect(c)
                box = cv2.boxPoints(rect)
                box_area = rect[1][0] * rect[1][1]
                if box_area > max_area and box_area > total_area * 0.15:
                    max_area = box_area
                    best_box = box

    if best_box is None:
        return None

    # Order points: TL, TR, BR, BL
    pts = np.array(best_box, dtype="float32")
    s = pts.sum(axis=1)
    diff = np.diff(pts, axis=1)
    tl = pts[np.argmin(s)]
    br = pts[np.argmax(s)]
    tr = pts[np.argmin(diff)]
    bl = pts[np.argmax(diff)]

    paper_src = np.array([tl, tr, br, bl], dtype="float32")
    paper_dst = np.array(
        [[0, 0], [canonical_w, 0], [canonical_w, canonical_h], [0, canonical_h]],
        dtype="float32",
    )

    try:
        H_paper = cv2.getPerspectiveTransform(paper_src, paper_dst)
        H_paper_inv = np.linalg.inv(H_paper)
    except Exception:
        return None

    detected_markers = {}
    for m_key in ["top_left", "top_right", "bottom_right", "bottom_left"]:
        if m_key not in canonical_markers:
            continue
        m = canonical_markers[m_key]
        pt_h = np.array([m["cx_px"], m["cy_px"], 1.0])
        img_pt_h = H_paper_inv @ pt_h
        if img_pt_h[2] == 0:
            return None
        detected_markers[m_key] = (float(img_pt_h[0] / img_pt_h[2]), float(img_pt_h[1] / img_pt_h[2]))

    return detected_markers
