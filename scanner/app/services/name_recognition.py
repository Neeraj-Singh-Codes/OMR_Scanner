"""
Dedicated Handwritten Student Full-Name Recognition Pipeline.
Uses Microsoft TrOCR (microsoft/trocr-base-handwritten) with conservative
multi-variant preprocessing, stroke envelope isolation, and RapidOCR dual-engine verification.
Operates strictly independently of the roll-number recognition pipeline.
"""

import os
import re
import logging
import warnings
from typing import Dict, Any, Optional, List, Tuple
import cv2
import numpy as np
from PIL import Image

logger = logging.getLogger(__name__)

# Suppress Hugging Face, PyTorch & Hub verbose loading logs
os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"
os.environ["HF_HUB_DISABLE_IMPLICIT_TOKEN"] = "1"
os.environ["HF_HUB_ENABLE_HF_TRANSFER"] = "0"
os.environ["TOKENIZERS_PARALLELISM"] = "false"
warnings.filterwarnings("ignore")

# Singleton TrOCR engine state
_trocr_base_model: Any = None
_trocr_base_processor: Any = None
_trocr_base_load_attempted: bool = False

# Default Name Field Crop Template relative to 900px header
DEFAULT_NAME_CROP_TEMPLATE = {
    "x_start_ratio": 0.02,
    "x_end_ratio": 0.46,
    "y_start_ratio": 0.40,
    "y_end_ratio": 0.68,
}


def get_trocr_base_engine():
    """
    Returns or lazily initializes the singleton Microsoft TrOCR-base engine.
    Uses 'microsoft/trocr-base-handwritten' as primary model.
    """
    global _trocr_base_model, _trocr_base_processor, _trocr_base_load_attempted
    if _trocr_base_processor is not None and _trocr_base_model is not None:
        return _trocr_base_processor, _trocr_base_model
    if _trocr_base_load_attempted:
        return None, None
    _trocr_base_load_attempted = True
    try:
        import transformers
        transformers.logging.set_verbosity_error()
        transformers.logging.disable_progress_bar()
        from transformers import TrOCRProcessor, VisionEncoderDecoderModel
        import torch

        # Restrict PyTorch thread count to prevent thread contention during multi-request batch scans
        torch.set_num_threads(min(4, os.cpu_count() or 4))

        model_name = os.environ.get("OMR_NAME_MODEL", "microsoft/trocr-base-handwritten")
        processor = TrOCRProcessor.from_pretrained(model_name)
        model = VisionEncoderDecoderModel.from_pretrained(model_name)
        model.eval()

        device = "cuda" if torch.cuda.is_available() else "cpu"
        model.to(device)

        _trocr_base_processor = processor
        _trocr_base_model = model
        return _trocr_base_processor, _trocr_base_model
    except Exception as e:
        logger.warning(f"Could not load TrOCR base model: {e}. Falling back to small model or RapidOCR.")
        # Fallback to small model if base cannot be loaded
        try:
            from transformers import TrOCRProcessor, VisionEncoderDecoderModel
            import torch
            fallback_name = "microsoft/trocr-small-handwritten"
            processor = TrOCRProcessor.from_pretrained(fallback_name)
            model = VisionEncoderDecoderModel.from_pretrained(fallback_name)
            model.eval()
            device = "cuda" if torch.cuda.is_available() else "cpu"
            model.to(device)
            _trocr_base_processor = processor
            _trocr_base_model = model
            return _trocr_base_processor, _trocr_base_model
        except Exception:
            return None, None


def validate_name_crop(crop_bgr: np.ndarray) -> Tuple[bool, str]:
    """
    Validates that the Name field crop has valid dimensions, aspect ratio,
    and nonzero content before passing to recognition models.
    """
    if crop_bgr is None or crop_bgr.size == 0:
        return False, "Name crop is empty or missing."
    H, W = crop_bgr.shape[:2]
    if H < 15 or W < 40:
        return False, f"Name crop dimensions ({W}x{H}) are too small for recognition."
    aspect = W / max(H, 1.0)
    if aspect < 0.8:
        return False, f"Abnormal Name crop aspect ratio ({aspect:.2f})."
    return True, "Valid"


def isolate_handwriting_crop(name_crop_bgr: np.ndarray, label_margin_x: int = 72) -> np.ndarray:
    """
    Isolates the actual student handwriting area by removing the printed 'Name:' label
    and suppressing outer perimeter border lines and the printed underline.
    """
    if name_crop_bgr is None or name_crop_bgr.size == 0:
        return name_crop_bgr
    H, W = name_crop_bgr.shape[:2]
    # Skip printed 'Name:' label
    x_start = min(label_margin_x, max(0, W - 30)) if W > 80 else 0
    hw = name_crop_bgr[:, x_start:].copy()
    return hw


def generate_name_preprocessing_variants(hw_crop_bgr: np.ndarray) -> List[Tuple[str, np.ndarray]]:
    """
    Generates conservative preprocessing variants tailored for handwritten text recognition:
    1. 'standard': Raw natural crop with white border padding.
    2. 'clahe_enhanced': Adaptive histogram equalization (CLAHE) to normalize uneven lighting and faint ink.
    3. 'stroke_tight': Tight bounding box around handwriting strokes with padding to remove excessive margins.
    """
    if hw_crop_bgr is None or hw_crop_bgr.size == 0:
        return []
    variants = []

    # 1. Standard variant with padding
    pad_y, pad_x = 12, 16
    padded_std = cv2.copyMakeBorder(
        hw_crop_bgr, pad_y, pad_y, pad_x, pad_x, cv2.BORDER_CONSTANT, value=[255, 255, 255]
    )
    variants.append(("standard", padded_std))

    # 2. CLAHE illumination & faint stroke enhancement
    try:
        lab = cv2.cvtColor(hw_crop_bgr, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        cl = clahe.apply(l)
        enhanced = cv2.cvtColor(cv2.merge((cl, a, b)), cv2.COLOR_LAB2BGR)
        padded_clahe = cv2.copyMakeBorder(
            enhanced, pad_y, pad_y, pad_x, pad_x, cv2.BORDER_CONSTANT, value=[255, 255, 255]
        )
        variants.append(("clahe_enhanced", padded_clahe))
    except Exception as e:
        logger.debug(f"CLAHE preprocessing variant failed: {e}")

    # 3. Stroke envelope tight crop
    try:
        gray = cv2.cvtColor(hw_crop_bgr, cv2.COLOR_BGR2GRAY)
        bg = float(np.median(gray))
        ink = (gray < (bg - 20)).astype(np.uint8) * 255
        # Remove baseline underline
        h_k = cv2.getStructuringElement(cv2.MORPH_RECT, (25, 1))
        h_lines = cv2.morphologyEx(ink, cv2.MORPH_OPEN, h_k)
        no_lines = cv2.subtract(ink, h_lines)
        pts = cv2.findNonZero(no_lines)
        if pts is not None:
            x, y, w, h = cv2.boundingRect(pts)
            if w >= 20 and h >= 10:
                p = 10
                tight = hw_crop_bgr[
                    max(0, y - p):min(hw_crop_bgr.shape[0], y + h + p),
                    max(0, x - p):min(hw_crop_bgr.shape[1], x + w + p),
                ]
                padded_tight = cv2.copyMakeBorder(
                    tight, pad_y, pad_y, pad_x, pad_x, cv2.BORDER_CONSTANT, value=[255, 255, 255]
                )
                variants.append(("stroke_tight", padded_tight))
    except Exception as e:
        logger.debug(f"Stroke envelope variant failed: {e}")

    return variants


def clean_trocr_name_prediction(raw_text: str) -> str:
    """
    Cleans raw TrOCR text predictions:
    - Strips leading/trailing sentence punctuation hallucinations (dots, quotes, dashes).
    - Strips printed label prefixes ('name', 'candidate', 'student').
    - Normalizes multi-word whitespace while strictly preserving full names.
    """
    if not raw_text:
        return ""
    t = raw_text.strip()
    # Strip printed label prefixes
    t = re.sub(r'^(?:name|candidate|student|nam|ne|omr|ans)[.:\s_]*', '', t, flags=re.IGNORECASE).strip()
    # Strip sentence quotes and punctuation hallucinations
    t = re.sub(r'^[^\w]+', '', t)
    t = re.sub(r'[^\w.]+$', '', t)
    t = re.sub(r'[_]+', ' ', t)
    # Remove repeated punctuation
    t = re.sub(r'\.{2,}', '.', t)
    t = re.sub(r'\s+', ' ', t).strip()

    # Format in Title Case without altering spelling
    words = t.split()
    formatted = []
    for w in words:
        clean_w = re.sub(r'[^A-Za-z.]', '', w)
        if clean_w:
            if len(clean_w) == 1 or (len(clean_w) == 2 and clean_w.endswith('.')):
                formatted.append(clean_w.upper())
            else:
                formatted.append(clean_w.capitalize())

    return " ".join(formatted).strip()


def recognize_name_with_trocr_base(
    name_crop_bgr: np.ndarray,
) -> Tuple[Optional[str], float, List[Dict[str, Any]]]:
    """
    Runs multi-variant inference using Microsoft TrOCR-base (microsoft/trocr-base-handwritten).
    Tests the standard, CLAHE, and tight stroke variants, scoring by token probability.
    Returns (best_predicted_name, confidence_percent, list_of_raw_predictions).
    """
    processor, model = get_trocr_base_engine()
    if processor is None or model is None:
        return None, 0.0, []

    is_valid, reason = validate_name_crop(name_crop_bgr)
    if not is_valid:
        return None, 0.0, []

    hw = isolate_handwriting_crop(name_crop_bgr)
    variants = generate_name_preprocessing_variants(hw)
    if not variants:
        variants = [("standard", hw)]

    import torch
    device = next(model.parameters()).device
    raw_predictions = []
    best_text = None
    best_conf = 0.0

    for v_name, v_img in variants:
        try:
            rgb = cv2.cvtColor(v_img, cv2.COLOR_BGR2RGB)
            pil_img = Image.fromarray(rgb)
            pv = processor(images=pil_img, return_tensors="pt").pixel_values.to(device)
            with torch.no_grad():
                out = model.generate(
                    pv,
                    return_dict_in_generate=True,
                    output_scores=True,
                    max_new_tokens=30,
                )
                text = processor.batch_decode(out.sequences, skip_special_tokens=True)[0].strip()
                probs = [float(torch.softmax(s, dim=-1).max()) for s in out.scores]
                conf = round(float(np.mean(probs)) * 100, 1) if probs else 0.0
                cleaned = clean_trocr_name_prediction(text)

                if cleaned:
                    raw_predictions.append({
                        "engine": f"microsoft/trocr-base-handwritten ({v_name})",
                        "raw_text": text,
                        "text": cleaned,
                        "confidence": conf,
                    })
                    if conf > best_conf and len(cleaned) >= 3:
                        best_conf = conf
                        best_text = cleaned
        except Exception as e:
            logger.debug(f"TrOCR-base variant '{v_name}' inference failed: {e}")

    return best_text, best_conf, raw_predictions
