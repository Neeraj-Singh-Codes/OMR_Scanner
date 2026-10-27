"""
Image Preprocessing and Validation for OMR Pipeline.
Handles image loading, format & resolution validation, blur detection,
and illumination normalization.
"""

from typing import Tuple, Dict, Any, Optional
import cv2
import numpy as np


class PreprocessingError(Exception):
    def __init__(self, code: str, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details or {}


def load_image_from_bytes(data: bytes) -> np.ndarray:
    """Decodes image bytes into a BGR OpenCV NumPy array."""
    if not data or len(data) == 0:
        raise PreprocessingError("EMPTY_FILE", "Uploaded file is empty.")

    # 15 MB max file size limit
    if len(data) > 15 * 1024 * 1024:
        raise PreprocessingError("FILE_TOO_LARGE", "Image file exceeds maximum limit of 15MB.")

    nparr = np.frombuffer(data, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if img is None:
        raise PreprocessingError("INVALID_IMAGE_FORMAT", "Failed to decode image. Ensure file is a valid JPEG or PNG.")

    return img


def validate_image_resolution(image: np.ndarray, min_w: int = 480, min_h: int = 640) -> None:
    """
    Verifies image meets minimum resolution to resolve OMR bubbles.
    Supports both portrait and landscape orientation without rejecting sideways camera captures.
    """
    h, w = image.shape[:2]
    short_side = min(w, h)
    long_side = max(w, h)
    min_short = min(min_w, min_h)
    min_long = max(min_w, min_h)

    if short_side < min_short or long_side < min_long:
        raise PreprocessingError(
            "LOW_RESOLUTION",
            f"Image resolution ({w}x{h}) is too low for reliable bubble detection. Minimum required is {min_short}x{min_long}.",
            {"width": w, "height": h, "min_short": min_short, "min_long": min_long}
        )


def compute_blur_metric(gray: np.ndarray) -> float:
    """
    Computes the variance of the Laplacian.
    Higher value means sharper image; low value (< 35.0) indicates severe blur.
    """
    laplacian = cv2.Laplacian(gray, cv2.CV_64F)
    variance = float(laplacian.var())
    return variance


def check_sharpness(gray: np.ndarray, min_sharpness: float = 30.0) -> float:
    """Verifies that the image is sharp enough to read."""
    var = compute_blur_metric(gray)
    if var < min_sharpness:
        raise PreprocessingError(
            "IMAGE_BLURRY",
            f"The image is too blurry (sharpness score: {var:.1f}, minimum required: {min_sharpness:.1f}). Please steady camera and retake photo.",
            {"sharpness": round(var, 2), "threshold": min_sharpness}
        )
    return var


def normalize_illumination(gray: np.ndarray) -> np.ndarray:
    """
    Compensates for uneven lighting and shadows using morphological opening
    to estimate and subtract background illumination.
    """
    # Large structuring element to estimate paper background intensity
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (51, 51))
    background = cv2.morphologyEx(gray, cv2.MORPH_OPEN, kernel)
    # Subtract background to normalize paper brightness to uniform white
    normalized = cv2.subtract(gray, background)
    normalized = cv2.bitwise_not(normalized)
    # Stretch histogram
    normalized = cv2.normalize(normalized, None, alpha=0, beta=255, norm_type=cv2.NORM_MINMAX)
    return normalized


def preprocess_image(
    image: np.ndarray,
    min_sharpness: float = 25.0,
    check_blur: bool = True
) -> Dict[str, Any]:
    """
    Full preprocessing pipeline:
    Validates dimensions, converts to grayscale, evaluates blur,
    and returns preprocessed representations.
    """
    validate_image_resolution(image)

    # Grayscale
    if len(image.shape) == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = image.copy()

    sharpness = compute_blur_metric(gray)
    if check_blur and sharpness < min_sharpness:
        raise PreprocessingError(
            "IMAGE_BLURRY",
            f"The image is too blurry (sharpness score: {sharpness:.1f}). Please retake with better focus.",
            {"sharpness": round(sharpness, 2), "threshold": min_sharpness}
        )

    return {
        "gray": gray,
        "sharpness": round(sharpness, 2),
    }
