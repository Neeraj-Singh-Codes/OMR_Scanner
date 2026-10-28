"""
OMR End-to-End Processing Engine.
Orchestrates preprocessing, resilient alignment (corner markers, paper boundary, dual tables),
bubble radiometric measurement, answer classification, and candidate OCR.
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
    detect_paper_sheet,
    MarkerDetectionError,
)
from scanner.app.omr.dual_table_detector import (
    detect_dual_tables,
    evaluate_dual_table_omr,
    check_table_grid_lines,
    order_points,
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
        total_questions: Optional[int] = None,
        template_type: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Executes the resilient OMR pipeline on an input image.
        Uses a multi-tier alignment hierarchy:
        1. Question table / dual column detection (School 20Q or 25Q layouts)
        2. Corner alignment markers (4, 3, or 2 markers with geometric reconstruction)
        3. Full paper sheet boundary contour (document edge detection against surface)

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

        h, w = image.shape[:2]

        # Intelligent orientation ordering:
        rotations = [0, 180, 270, 90] if h >= w else [0, 90, 270, 180]
        try:
            from rapidocr_onnxruntime import RapidOCR
            ocr_quick = RapidOCR()
            top_sample = image[:int(h * 0.25), :]
            bot_sample = image[int(h * 0.75):, :]
            r_top, _ = ocr_quick(top_sample)
            r_bot, _ = ocr_quick(bot_sample)
            txt_top = " ".join([r[1] for r in r_top]) if r_top else ""
            txt_bot = " ".join([r[1] for r in r_bot]) if r_bot else ""
            kw = ["OMR", "NAME", "ROLL", "DIVISION", "DATE", "SCORE", "TOTAL", "MARKS"]
            top_score = sum(1 for k in kw if k in txt_top.upper())
            bot_score = sum(1 for k in kw if k in txt_bot.upper())
            if bot_score > top_score + 1:
                rotations = [180, 0, 270, 90] if h >= w else [180, 90, 270, 0]
        except Exception:
            pass

        is_school_request = (total_questions is not None and total_questions <= 25) or (
            template_type and ("SCHOOL" in str(template_type).upper() or "20" in str(template_type) or "25" in str(template_type))
        )

        for angle in rotations:
            if angle == 0:
                cur_img = image
                cur_gray = gray
            elif angle == 90:
                cur_img = cv2.rotate(image, cv2.ROTATE_90_CLOCKWISE)
                cur_gray = cv2.cvtColor(cur_img, cv2.COLOR_BGR2GRAY) if len(cur_img.shape) == 3 else cur_img
            elif angle == 180:
                cur_img = cv2.rotate(image, cv2.ROTATE_180)
                cur_gray = cv2.cvtColor(cur_img, cv2.COLOR_BGR2GRAY) if len(cur_img.shape) == 3 else cur_img
            elif angle == 270:
                cur_img = cv2.rotate(image, cv2.ROTATE_90_COUNTERCLOCKWISE)
                cur_gray = cv2.cvtColor(cur_img, cv2.COLOR_BGR2GRAY) if len(cur_img.shape) == 3 else cur_img

            # If school format explicitly requested (<= 25 questions), prioritize dual table detection
            if is_school_request:
                dual_tables = detect_dual_tables(cur_gray)
                if dual_tables is not None:
                    res = evaluate_dual_table_omr(
                        image=cur_img,
                        dual_tables=dual_tables,
                        generate_annotated=generate_annotated,
                        sharpness=sharpness,
                        total_questions=total_questions,
                    )
                    elapsed_ms = round((time.perf_counter() - start_time) * 1000, 1)
                    res["diagnostics"]["processing_time_ms"] = elapsed_ms
                    res["diagnostics"]["alignment_strategy"] = res["diagnostics"].get("template_type", "SCHOOL_DUAL_TABLE")
                    return res

            # Strategy 1: Corner Alignment Markers (4, 3, or 2 markers with auto-reconstruction)
            # Default for standard 30Q template sheets
            markers = None
            try:
                markers = find_corner_markers(cur_gray)
            except MarkerDetectionError:
                markers = None

            if markers is not None and not is_school_request:
                return self._process_canonical_aligned(
                    image=cur_img,
                    markers=markers,
                    generate_annotated=generate_annotated,
                    sharpness=sharpness,
                    start_time=start_time,
                    alignment_strategy="CORNER_MARKERS",
                )

            # Strategy 2: Question Table / Dual Column Detection (School 20Q/25Q or 30Q dual columns)
            dual_tables = detect_dual_tables(cur_gray)
            if dual_tables is not None:
                # Check if it matches Canonical 30Q dual columns:
                if "grid_layout" in self.config and "column_1_box" in self.config["grid_layout"] and not is_school_request:
                    warped_color = self._warp_by_dual_columns_30q(cur_img, dual_tables)
                    if warped_color is not None:
                        warped_gray = cv2.cvtColor(warped_color, cv2.COLOR_BGR2GRAY)
                        measurements = inspect_all_bubbles(warped_gray, self.config)
                        classified_questions = self.classifier.classify_all(measurements)
                        confident = sum(1 for q in classified_questions if q["status"] == "CONFIDENT")
                        if confident > 0:
                            return self._process_canonical_from_warped(
                                warped_color=warped_color,
                                classified_questions=classified_questions,
                                generate_annotated=generate_annotated,
                                sharpness=sharpness,
                                start_time=start_time,
                                alignment_strategy="DUAL_COLUMNS_30Q",
                            )

                res = evaluate_dual_table_omr(
                    image=cur_img,
                    dual_tables=dual_tables,
                    generate_annotated=generate_annotated,
                    sharpness=sharpness,
                    total_questions=total_questions,
                )
                elapsed_ms = round((time.perf_counter() - start_time) * 1000, 1)
                res["diagnostics"]["processing_time_ms"] = elapsed_ms
                res["diagnostics"]["alignment_strategy"] = res["diagnostics"].get("template_type", "SCHOOL_DUAL_TABLE")
                return res

            # Strategy 3: Document / Paper Sheet Boundary Contour Detection
            paper_markers = detect_paper_sheet(cur_gray, config=self.config)
            if paper_markers is not None:
                if is_school_request or (total_questions is not None and total_questions <= 20):
                    p_tables = detect_dual_tables(cur_gray)
                    if p_tables is not None:
                        res = evaluate_dual_table_omr(
                            image=cur_img,
                            dual_tables=p_tables,
                            generate_annotated=generate_annotated,
                            sharpness=sharpness,
                            total_questions=total_questions,
                        )
                        elapsed_ms = round((time.perf_counter() - start_time) * 1000, 1)
                        res["diagnostics"]["processing_time_ms"] = elapsed_ms
                        res["diagnostics"]["alignment_strategy"] = "PAPER_BOUNDARY_DUAL_TABLE"
                        return res

                return self._process_canonical_aligned(
                    image=cur_img,
                    markers=paper_markers,
                    generate_annotated=generate_annotated,
                    sharpness=sharpness,
                    start_time=start_time,
                    alignment_strategy="PAPER_BOUNDARY",
                )

        # If all orientations and all strategies failed:
        raise MarkerDetectionError(
            "MARKER_NOT_FOUND",
            "Could not locate question tables, MCQ bubbles, or sheet boundaries in the image. "
            "Please ensure the question area and student details are clearly visible, flat, and well-lit.",
            {"rotations_tried": rotations}
        )

    def _warp_by_dual_columns_30q(
        self,
        image: np.ndarray,
        dual_tables: Dict[str, np.ndarray],
    ) -> Optional[np.ndarray]:
        """Warps image into canonical space using the outer boundaries of the two question columns."""
        try:
            lt = order_points(dual_tables["left_table"])
            rt = order_points(dual_tables["right_table"])

            scale_x = self.config["page"]["scale_x"]
            scale_y = self.config["page"]["scale_y"]
            c1 = self.config["grid_layout"]["column_1_box"]
            c2 = self.config["grid_layout"]["column_2_box"]

            c1_x1 = c1["x_pt"] * scale_x
            c1_y1 = c1["y_pt"] * scale_y
            c2_x2 = (c2["x_pt"] + c2["width_pt"]) * scale_x
            c2_y2 = (c2["y_pt"] + c2["height_pt"]) * scale_y

            src_pts = np.float32([lt[0], rt[1], rt[2], lt[3]])
            dst_pts = np.float32([
                [c1_x1, c1_y1],
                [c2_x2, c1_y1],
                [c2_x2, c2_y2],
                [c1_x1, c2_y2],
            ])

            H = cv2.getPerspectiveTransform(src_pts, dst_pts)
            canonical_w = self.config["page"]["canonical_width_px"]
            canonical_h = self.config["page"]["canonical_height_px"]
            warped = cv2.warpPerspective(
                image,
                H,
                (canonical_w, canonical_h),
                flags=cv2.INTER_LANCZOS4,
                borderMode=cv2.BORDER_CONSTANT,
                borderValue=(255, 255, 255),
            )
            return warped
        except Exception:
            return None

    def _process_canonical_aligned(
        self,
        image: np.ndarray,
        markers: Dict[str, Tuple[float, float]],
        generate_annotated: bool,
        sharpness: float,
        start_time: float,
        alignment_strategy: str = "CORNER_MARKERS",
    ) -> Dict[str, Any]:
        warp_res = warp_to_canonical(image, markers, self.config)
        warped_color = warp_res["warped"]
        warped_gray = cv2.cvtColor(warped_color, cv2.COLOR_BGR2GRAY)

        measurements = inspect_all_bubbles(warped_gray, self.config)
        classified_questions = self.classifier.classify_all(measurements)

        return self._process_canonical_from_warped(
            warped_color=warped_color,
            classified_questions=classified_questions,
            generate_annotated=generate_annotated,
            sharpness=sharpness,
            start_time=start_time,
            alignment_strategy=alignment_strategy,
            detected_markers=markers,
        )

    def _process_canonical_from_warped(
        self,
        warped_color: np.ndarray,
        classified_questions: List[Dict[str, Any]],
        generate_annotated: bool,
        sharpness: float,
        start_time: float,
        alignment_strategy: str,
        detected_markers: Optional[Dict[str, Tuple[float, float]]] = None,
    ) -> Dict[str, Any]:
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

        # Candidate Info Extraction for Canonical Sheets
        header_b64 = None
        candidate_info = {
            "student_name": "Unassigned Student",
            "roll_number": "UNASSIGNED",
            "division": None,
            "confidence": 0.0,
            "is_ambiguous": True,
            "ambiguity_reason": "Header could not be located.",
        }
        try:
            from scanner.app.services.candidate_ocr import extract_candidate_info
            hdr_crop = warped_color[80:650, 60:1140]
            candidate_info = extract_candidate_info(hdr_crop)
            _, hdr_buf = cv2.imencode(".jpg", hdr_crop, [cv2.IMWRITE_JPEG_QUALITY, 90])
            header_b64 = base64.b64encode(hdr_buf).decode("utf-8")
        except Exception:
            header_b64 = None

        annotated_b64 = None
        if generate_annotated:
            annotated_img = self._create_annotated_image(warped_color, classified_questions)
            _, buffer = cv2.imencode(".jpg", annotated_img, [cv2.IMWRITE_JPEG_QUALITY, 85])
            annotated_b64 = base64.b64encode(buffer).decode("utf-8")

        elapsed_ms = round((time.perf_counter() - start_time) * 1000, 1)

        return {
            "success": True,
            "template_version": self.config.get("template_version", "OMR-V1.0"),
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
            "candidate_info": candidate_info,
            "diagnostics": {
                "processing_time_ms": elapsed_ms,
                "sharpness_score": sharpness,
                "detected_markers": detected_markers,
                "alignment_strategy": alignment_strategy,
                "canonical_dimensions": self.config["page"]["canonical_width_px"],
                "annotated_image_base64": annotated_b64,
                "header_image_base64": header_b64,
                "candidate_info": candidate_info,
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
            if q_num > len(self.config["questions"]):
                continue
            q_spec = self.config["questions"][q_num - 1]

            if status == "CONFIDENT" and sel:
                b_info = q_spec["bubbles"][sel]
                cx = int(round(b_info["cx_px"]))
                cy = int(round(b_info["cy_px"]))
                cv2.circle(annotated, (cx, cy), radius + 4, (0, 200, 0), 2, cv2.LINE_AA)

            elif status == "AMBIGUOUS":
                for opt, opt_data in q["options"].items():
                    if opt_data["composite_score"] >= self.classifier.light_threshold:
                        b_info = q_spec["bubbles"][opt]
                        cx = int(round(b_info["cx_px"]))
                        cy = int(round(b_info["cy_px"]))
                        cv2.circle(annotated, (cx, cy), radius + 5, (0, 215, 255), 2, cv2.LINE_AA)

            elif status == "MULTIPLE_MARKED":
                for opt in q.get("marked_options", []):
                    b_info = q_spec["bubbles"][opt]
                    cx = int(round(b_info["cx_px"]))
                    cy = int(round(b_info["cy_px"]))
                    cv2.circle(annotated, (cx, cy), radius + 5, (0, 0, 255), 2, cv2.LINE_AA)

        return annotated
