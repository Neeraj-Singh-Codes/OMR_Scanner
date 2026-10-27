"""
Perspective Correction and Standardized Coordinate Normalization.
Computes the homography transform using the 4 detected corner markers
and warps the image into the canonical 1200x1700 coordinate system.
"""

from typing import Dict, Any, Tuple, Optional
import cv2
import numpy as np

from scanner.app.services.template_config import load_template_config


def warp_to_canonical(
    image: np.ndarray,
    detected_markers: Dict[str, Tuple[float, float]],
    config: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Transforms the scanned sheet into the canonical coordinate space.
    Source points: detected marker centers.
    Destination points: canonical marker centers from template config.
    Returns:
        {
            "warped": np.ndarray (1200x1700),
            "H": 3x3 homography matrix,
            "H_inv": 3x3 inverse matrix
        }
    """
    if config is None:
        config = load_template_config()

    canonical_w = config["page"]["canonical_width_px"]
    canonical_h = config["page"]["canonical_height_px"]
    canonical_markers = config["markers"]

    # Source points order: [Top-Left, Top-Right, Bottom-Right, Bottom-Left]
    src_pts = np.float32([
        detected_markers["top_left"],
        detected_markers["top_right"],
        detected_markers["bottom_right"],
        detected_markers["bottom_left"],
    ])

    # Destination points: exact canonical pixel centers
    dst_pts = np.float32([
        [canonical_markers["top_left"]["cx_px"], canonical_markers["top_left"]["cy_px"]],
        [canonical_markers["top_right"]["cx_px"], canonical_markers["top_right"]["cy_px"]],
        [canonical_markers["bottom_right"]["cx_px"], canonical_markers["bottom_right"]["cy_px"]],
        [canonical_markers["bottom_left"]["cx_px"], canonical_markers["bottom_left"]["cy_px"]],
    ])

    # Compute perspective transformation matrix
    H = cv2.getPerspectiveTransform(src_pts, dst_pts)
    H_inv = np.linalg.inv(H)

    # Warp image to standard canonical size
    warped = cv2.warpPerspective(
        image,
        H,
        (canonical_w, canonical_h),
        flags=cv2.INTER_LANCZOS4,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=(255, 255, 255) if len(image.shape) == 3 else 255,
    )

    return {
        "warped": warped,
        "H": H,
        "H_inv": H_inv,
        "canonical_size": (canonical_w, canonical_h),
    }
