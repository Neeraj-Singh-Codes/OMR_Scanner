"""
OMR End-to-End Processing Engine.
Orchestrates preprocessing, marker detection, homography perspective warping,
bubble radiometric measurement, and answer classification.
Also generates annotated diagnostic visualizations.
"""

import base64
import time
from typing import Dict, Any, List, Optional, Tuple, Union
import cv2
import numpy as np

from scanner.app.omr.preprocessing import (
    load_image_from_bytes,
    preprocess_image,
    PreprocessingError,
)
from scanner.app.omr.marker_detection import (
    find_corner_markers,
    find_marker_candidates,
    MarkerDetectionError,
)
from scanner.app.omr.dual_table_detector import (
    detect_dual_tables,
    evaluate_dual_table_omr,
)
from scanner.app.omr.perspective import warp_to_canonical
from scanner.app.omr.bubble_detection import inspect_all_bubbles
from scanner.app.omr.classification import BubbleClassifier
from scanner.app.services.template_config import load_template_config


class OMRProcessor:
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self.config = config or load_template_config()
        thresh_cfg = self.config.get("classification_thresholds", {})
        self.classifier = BubbleClassifier(
            blank_threshold=thresh_cfg.get("blank_fill_ratio", 0.16),
            filled_threshold=thresh_cfg.get("filled_fill_ratio", 0.40),
            light_threshold=thresh_cfg.get("light_fill_ratio", 0.28),
            ambiguous_delta=thresh_cfg.get("ambiguous_difference_threshold", 0.12),
        )

    def process_image(
        self,
        image_input: Union[bytes, np.ndarray],
        generate_annotated: bool = True,
        check_blur: bool = True,
    ) -> Dict[str, Any]:
        """
        Executes the full OMR pipeline on an input image.
        image_input: raw file bytes or BGR numpy array.
        Returns structured scan results with detected answers and diagnostics.
        """
        start_time = time.perf_counter()

        # 1. Load & validate
        if isinstance(image_input, bytes):
            image = load_image_from_bytes(image_input)
        else:
            image = image_input

        # 2. Preprocess
        prep = preprocess_image(image, check_blur=check_blur)
        gray = prep["gray"]
        sharpness = prep["sharpness"]

        # 3. Detect Alignment Features
        # Strategy A: Standard 4-Corner Alignment Markers
        markers = None
        try:
            markers = find_corner_markers(gray)
        except MarkerDetectionError:
            markers = None

        if markers is None:
            # Strategy B: School Dual-Table 25-Question Format
            dual_tables = detect_dual_tables(gray)
            if dual_tables is not None:
                res = evaluate_dual_table_omr(
                    image=image,
                    dual_tables=dual_tables,
                    generate_annotated=generate_annotated,
                    sharpness=sharpness,
                )
                elapsed_ms = round((time.perf_counter() - start_time) * 1000, 1)
                res["diagnostics"]["processing_time_ms"] = elapsed_ms
                return res

            # Neither template format detected
            raise MarkerDetectionError(
                "MARKER_NOT_FOUND",
                "Could not locate four corner alignment markers or dual question tables in image. "
                "Please ensure the entire answer sheet is fully visible, well-lit, and uncropped."
            )

        # 4. Perspective Correction to Canonical System
        warp_res = warp_to_canonical(image, markers, self.config)
        warped_color = warp_res["warped"]
        warped_gray = cv2.cvtColor(warped_color, cv2.COLOR_BGR2GRAY)

        # 5. Inspect Bubble Regions
        measurements = inspect_all_bubbles(warped_gray, self.config)

        # 6. Classify Answers
        classified_questions = self.classifier.classify_all(measurements)

        # 7. Aggregate Statistics
        detected_answers = {}
        blank_count = 0
        multiple_marked_count = 0
        ambiguous_count = 0
        review_required_questions = []

        for q in classified_questions:
            q_num = q["question_number"]
            status = q["status"]
            sel = q["selected_option"]

            detected_answers[str(q_num)] = sel

            if status == "BLANK":
                blank_count += 1
            elif status == "MULTIPLE_MARKED":
                multiple_marked_count += 1
                review_required_questions.append(q_num)
            elif status == "AMBIGUOUS":
                ambiguous_count += 1
                review_required_questions.append(q_num)

        total_questions = len(classified_questions)
        is_review_required = len(review_required_questions) > 0

        # 8. Annotated Visualization (Optional)
        annotated_b64 = None
        if generate_annotated:
            annotated_img = self._create_annotated_image(warped_color, classified_questions)
            _, buffer = cv2.imencode(".jpg", annotated_img, [cv2.IMWRITE_JPEG_QUALITY, 85])
            annotated_b64 = base64.b64encode(buffer).decode("utf-8")

        elapsed_ms = round((time.perf_counter() - start_time) * 1000, 1)

        return {
            "success": True,
            "template_version": self.config["template_version"],
            "total_questions": total_questions,
            "detected_answers": detected_answers,
            "summary": {
                "confident_count": total_questions - blank_count - multiple_marked_count - ambiguous_count,
                "blank_count": blank_count,
                "multiple_marked_count": multiple_marked_count,
                "ambiguous_count": ambiguous_count,
                "review_required": is_review_required,
                "review_question_numbers": review_required_questions,
            },
            "questions": classified_questions,
            "diagnostics": {
                "processing_time_ms": elapsed_ms,
                "sharpness_score": sharpness,
                "detected_markers": markers,
                "canonical_dimensions": self.config["page"]["canonical_width_px"],
            },
            "annotated_image_base64": annotated_b64,
        }

    def _create_annotated_image(
        self,
        warped: np.ndarray,
        questions: List[Dict[str, Any]],
    ) -> np.ndarray:
        """Draws visual feedback overlays (green=confident, yellow=ambiguous, red=multiple)."""
        annotated = warped.copy()
        radius = int(round(self.config["bubble_specs"]["radius_px"]))

        for q in questions:
            q_num = q["question_number"]
            status = q["status"]
            sel = q["selected_option"]
            q_spec = self.config["questions"][q_num - 1]

            if status == "CONFIDENT" and sel:
                # Green circle around chosen bubble
                b_info = q_spec["bubbles"][sel]
                cx = int(round(b_info["cx_px"]))
                cy = int(round(b_info["cy_px"]))
                cv2.circle(annotated, (cx, cy), radius + 4, (0, 200, 0), 2, cv2.LINE_AA)

            elif status == "AMBIGUOUS":
                # Yellow circle around ambiguous bubbles
                for opt, opt_data in q["options"].items():
                    if opt_data["composite_score"] >= self.classifier.light_threshold:
                        b_info = q_spec["bubbles"][opt]
                        cx = int(round(b_info["cx_px"]))
                        cy = int(round(b_info["cy_px"]))
                        cv2.circle(annotated, (cx, cy), radius + 5, (0, 215, 255), 2, cv2.LINE_AA)

            elif status == "MULTIPLE_MARKED":
                # Red circles around all filled bubbles
                for opt in q.get("marked_options", []):
                    b_info = q_spec["bubbles"][opt]
                    cx = int(round(b_info["cx_px"]))
                    cy = int(round(b_info["cy_px"]))
                    cv2.circle(annotated, (cx, cy), radius + 5, (0, 0, 255), 2, cv2.LINE_AA)

        return annotated


if __name__ == "__main__":
    from scanner.app.services.synthetic_generator import SyntheticOMRGenerator

    gen = SyntheticOMRGenerator()
    test_responses = {
        1: "A",
        2: "B",
        3: "C",
        4: "D",
        5: ["A", "C"],  # Multiple
        6: {"option": "B", "type": "LIGHT"},  # Light mark
        7: None,  # Blank
        8: "D",
    }
    img = gen.generate_sheet_with_responses(test_responses)
    photo = gen.simulate_camera_capture(img, rotation_deg=2.5, tilt_x=0.3, lighting_gradient=True)

    processor = OMRProcessor()
    result = processor.process_image(photo)

    print("Pipeline executed successfully!")
    print(f"Total Questions: {result['total_questions']}")
    print(f"Summary: {result['summary']}")
    print(f"Detected Answers Q1-Q8: {[result['detected_answers'][str(i)] for i in range(1, 9)]}")
