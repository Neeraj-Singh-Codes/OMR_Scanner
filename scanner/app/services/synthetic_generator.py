"""
Synthetic OMR Sheet Image Generator.
Generates realistic canonical and photographed OMR sheet images
for unit testing, calibration, and pipeline verification.
"""

import math
import random
from typing import Dict, Any, List, Optional, Tuple, Union
import cv2
import numpy as np

from scanner.app.services.template_config import load_template_config


class SyntheticOMRGenerator:
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self.config = config or load_template_config()
        self.w = self.config["page"]["canonical_width_px"]
        self.h = self.config["page"]["canonical_height_px"]

    def generate_base_canonical_image(
        self,
        exam_id: str = "EXAM-2026-001",
        student_name: str = "John Doe",
        roll_number: str = "1048291042",
    ) -> np.ndarray:
        """Renders the blank template into a pristine canonical 1200x1700 BGR image."""
        img = np.full((self.h, self.w, 3), 255, dtype=np.uint8)

        # 1. Corner markers
        markers = self.config["markers"]
        m_size_px = int(round(markers["size_px"]))

        for marker_key in ["top_left", "top_right", "bottom_left", "bottom_right"]:
            m = markers[marker_key]
            cx = int(round(m["cx_px"]))
            cy = int(round(m["cy_px"]))
            half = m_size_px // 2
            cv2.rectangle(
                img,
                (cx - half, cy - half),
                (cx + half, cy + half),
                (0, 0, 0),
                -1
            )

        # 2. Header Title & Subtitle
        cv2.putText(
            img,
            "OMR EXAMINATION ANSWER SHEET",
            (self.w // 2 - 270, 75),
            cv2.FONT_HERSHEY_DUPLEX,
            0.9,
            (20, 20, 20),
            2,
            cv2.LINE_AA,
        )
        cv2.putText(
            img,
            "OFFICIAL STANDARDIZED EVALUATION FORM",
            (self.w // 2 - 180, 105),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.55,
            (100, 100, 100),
            1,
            cv2.LINE_AA,
        )

        version_str = f"TEMPLATE: {self.config['template_version']}"
        cv2.putText(
            img,
            version_str,
            (self.w - 290, 75),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.5,
            (40, 40, 40),
            1,
            cv2.LINE_AA,
        )

        # 3. Exam Details Box (Left)
        scale_x = self.config["page"]["scale_x"]
        scale_y = self.config["page"]["scale_y"]
        eb = self.config["header_zones"]["exam_info_box"]
        ex1, ey1 = int(eb["x_pt"] * scale_x), int(eb["y_pt"] * scale_y)
        ex2, ey2 = int((eb["x_pt"] + eb["width_pt"]) * scale_x), int((eb["y_pt"] + eb["height_pt"]) * scale_y)
        cv2.rectangle(img, (ex1, ey1), (ex2, ey2), (160, 160, 160), 2)
        cv2.rectangle(img, (ex1, ey1), (ex2, ey1 + 35), (235, 235, 235), -1)
        cv2.putText(img, "EXAMINATION DETAILS", (ex1 + 15, ey1 + 24), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (20, 20, 20), 2, cv2.LINE_AA)
        cv2.putText(img, f"Exam ID:  {exam_id}", (ex1 + 15, ey1 + 65), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (30, 30, 30), 1, cv2.LINE_AA)
        cv2.putText(img, "Subject:  General Science", (ex1 + 15, ey1 + 105), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (30, 30, 30), 1, cv2.LINE_AA)
        cv2.putText(img, "Date:     2026-10-27", (ex1 + 15, ey1 + 145), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (30, 30, 30), 1, cv2.LINE_AA)

        # 4. Student Details Box (Right)
        sb = self.config["header_zones"]["student_info_box"]
        sx1, sy1 = int(sb["x_pt"] * scale_x), int(sb["y_pt"] * scale_y)
        sx2, sy2 = int((sb["x_pt"] + sb["width_pt"]) * scale_x), int((sb["y_pt"] + sb["height_pt"]) * scale_y)
        cv2.rectangle(img, (sx1, sy1), (sx2, sy2), (160, 160, 160), 2)
        cv2.rectangle(img, (sx1, sy1), (sx2, sy1 + 35), (235, 235, 235), -1)
        cv2.putText(img, "CANDIDATE DETAILS", (sx1 + 15, sy1 + 24), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (20, 20, 20), 2, cv2.LINE_AA)
        cv2.putText(img, f"Name: {student_name}", (sx1 + 15, sy1 + 65), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (30, 30, 30), 1, cv2.LINE_AA)
        cv2.putText(img, f"Roll: {roll_number}", (sx1 + 15, sy1 + 105), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (30, 30, 30), 1, cv2.LINE_AA)

        # 5. Instructions Box
        ib = self.config["header_zones"]["instructions_box"]
        ix1, iy1 = int(ib["x_pt"] * scale_x), int(ib["y_pt"] * scale_y)
        ix2, iy2 = int((ib["x_pt"] + ib["width_pt"]) * scale_x), int((ib["y_pt"] + ib["height_pt"]) * scale_y)
        cv2.rectangle(img, (ix1, iy1), (ix2, iy2), (190, 190, 190), 1)
        cv2.putText(img, "INSTRUCTIONS FOR CANDIDATES", (ix1 + 15, iy1 + 25), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 180), 2, cv2.LINE_AA)
        cv2.putText(img, "- Darken completely one bubble per question using blue or black ink.", (ix1 + 15, iy1 + 55), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (60, 60, 60), 1, cv2.LINE_AA)
        cv2.putText(img, "- Do not fold or make stray marks. Keep markers completely intact.", (ix1 + 15, iy1 + 85), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (60, 60, 60), 1, cv2.LINE_AA)
        cv2.putText(img, "Guide: Correct [ O ]  Incorrect [ X ] [ / ]", (ix1 + 15, iy1 + 115), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (40, 40, 40), 1, cv2.LINE_AA)

        # 6. Grid Layout Box 1 & 2
        for col_key in ["column_1_box", "column_2_box"]:
            cb = self.config["grid_layout"][col_key]
            cx1, cy1 = int(cb["x_pt"] * scale_x), int(cb["y_pt"] * scale_y)
            cx2, cy2 = int((cb["x_pt"] + cb["width_pt"]) * scale_x), int((cb["y_pt"] + cb["height_pt"]) * scale_y)
            cv2.rectangle(img, (cx1, cy1), (cx2, cy2), (200, 200, 200), 2)
            cv2.rectangle(img, (cx1, cy1), (cx2, cy1 + 35), (225, 230, 235), -1)
            cv2.putText(img, "Q.No", (cx1 + 20, cy1 + 25), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (20, 20, 20), 2, cv2.LINE_AA)

        # Bubble headers
        for opt in ["A", "B", "C", "D"]:
            c1_b = self.config["questions"][0]["bubbles"][opt]
            c2_b = self.config["questions"][15]["bubbles"][opt]
            cv2.putText(img, opt, (int(round(c1_b["cx_px"])) - 6, int(round(c1_b["cy_px"])) - 38), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (30, 30, 30), 2, cv2.LINE_AA)
            cv2.putText(img, opt, (int(round(c2_b["cx_px"])) - 6, int(round(c2_b["cy_px"])) - 38), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (30, 30, 30), 2, cv2.LINE_AA)

        # 7. Draw questions and bubbles
        b_radius = int(round(self.config["bubble_specs"]["radius_px"]))
        for q in self.config["questions"]:
            q_num = q["question_number"]
            q_y = int(round(q["y_px"]))
            q_label_x = int(round(q["num_label_x_pt"] * scale_x))

            # Number
            cv2.putText(
                img,
                f"{q_num:02d}",
                (q_label_x - 12, q_y + 5),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.55,
                (20, 20, 20),
                2,
                cv2.LINE_AA,
            )

            # Bubbles A, B, C, D
            for opt, b_info in q["bubbles"].items():
                bcx = int(round(b_info["cx_px"]))
                bcy = int(round(b_info["cy_px"]))

                # Draw outer ring
                cv2.circle(img, (bcx, bcy), b_radius, (30, 30, 30), 2, cv2.LINE_AA)

                # Option letter inside
                cv2.putText(
                    img,
                    opt,
                    (bcx - 5, bcy + 5),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.38,
                    (110, 110, 110),
                    1,
                    cv2.LINE_AA,
                )

        return img

    def fill_bubble(
        self,
        image: np.ndarray,
        q_num: int,
        option: str,
        fill_type: str = "NORMAL",
        jitter: bool = True,
    ) -> None:
        """
        Fills a bubble on the image with simulated pen ink.
        fill_type: 'NORMAL', 'LIGHT', 'ERASED', 'TICK'
        """
        q_info = self.config["questions"][q_num - 1]
        b_info = q_info["bubbles"][option]
        cx = int(round(b_info["cx_px"]))
        cy = int(round(b_info["cy_px"]))
        radius = int(round(b_info["radius_px"]))

        if jitter:
            cx += random.randint(-1, 1)
            cy += random.randint(-1, 1)

        if fill_type == "NORMAL":
            # Realistic solid fill (dark gray/black with slight pencil/pen texture)
            color = (random.randint(15, 30), random.randint(15, 30), random.randint(15, 30))
            cv2.circle(image, (cx, cy), radius - 1, color, -1, cv2.LINE_AA)
            # Add subtle texture
            patch = image[cy - radius:cy + radius, cx - radius:cx + radius]
            if patch.shape[0] > 0 and patch.shape[1] > 0:
                noise = np.random.randint(-10, 10, patch.shape, dtype=np.int16)
                patch[:] = np.clip(patch.astype(np.int16) + noise, 0, 255).astype(np.uint8)

        elif fill_type == "LIGHT":
            # Light shading (fill ratio ~30-40%)
            color = (random.randint(120, 145), random.randint(120, 145), random.randint(120, 145))
            cv2.circle(image, (cx, cy), radius - 2, color, -1, cv2.LINE_AA)

        elif fill_type == "ERASED":
            # Faint smudge/erased mark (fill ratio ~18-25%)
            color = (random.randint(190, 210), random.randint(190, 210), random.randint(190, 210))
            cv2.circle(image, (cx, cy), radius - 2, color, -1, cv2.LINE_AA)

        elif fill_type == "TICK":
            # Invalid checkmark / stray slash across bubble
            color = (random.randint(20, 40), random.randint(20, 40), random.randint(20, 40))
            cv2.line(image, (cx - radius, cy), (cx - 2, cy + radius - 2), color, 2, cv2.LINE_AA)
            cv2.line(image, (cx - 2, cy + radius - 2), (cx + radius, cy - radius), color, 2, cv2.LINE_AA)

    def generate_sheet_with_responses(
        self,
        responses: Dict[int, Union[str, List[str], Dict[str, Any]]],
        exam_id: str = "EXAM-2026-001",
        student_name: str = "Student 01",
        roll_number: str = "202600101",
    ) -> np.ndarray:
        """
        Generates a synthetic sheet with specified responses.
        responses: {
            1: 'A',
            2: 'B',
            3: ['A', 'C'], # Multiple marked
            4: {'option': 'D', 'type': 'LIGHT'},
            5: {'option': 'B', 'type': 'ERASED'},
            6: None # Blank
        }
        """
        img = self.generate_base_canonical_image(exam_id, student_name, roll_number)

        for q_num, ans in responses.items():
            if ans is None:
                continue
            if isinstance(ans, str):
                self.fill_bubble(img, q_num, ans, fill_type="NORMAL")
            elif isinstance(ans, list):
                # Multiple answers marked
                for opt in ans:
                    self.fill_bubble(img, q_num, opt, fill_type="NORMAL")
            elif isinstance(ans, dict):
                opt = ans.get("option")
                ftype = ans.get("type", "NORMAL")
                if opt:
                    self.fill_bubble(img, q_num, opt, fill_type=ftype)

        return img

    @staticmethod
    def simulate_camera_capture(
        image: np.ndarray,
        rotation_deg: float = 0.0,
        tilt_x: float = 0.0,
        tilt_y: float = 0.0,
        lighting_gradient: bool = False,
        blur_kernel: int = 0,
        sensor_noise: bool = False,
        background_pad: int = 150,
    ) -> np.ndarray:
        """
        Simulates taking a smartphone photograph of the printed sheet resting on a desk.
        Adds background padding, perspective projection, rotation, shadows, blur, and sensor noise.
        """
        h, w = image.shape[:2]

        # 1. Place the sheet onto a textured desktop surface
        pad = background_pad
        desk_w = w + pad * 2
        desk_h = h + pad * 2
        # Wooden/gray desk background
        desk = np.full((desk_h, desk_w, 3), (180, 175, 170), dtype=np.uint8)
        # Add grain texture to desk
        desk_noise = np.random.randint(-15, 15, desk.shape, dtype=np.int16)
        desk = np.clip(desk.astype(np.int16) + desk_noise, 0, 255).astype(np.uint8)

        # Place the pristine white sheet in center
        desk[pad:pad + h, pad:pad + w] = image

        # 2. Perspective distortion (tilt & skew)
        src_pts = np.float32([
            [pad, pad],
            [pad + w, pad],
            [pad + w, pad + h],
            [pad, pad + h]
        ])

        # Compute warped destination points
        # tilt_x alters top width vs bottom width; tilt_y alters left height vs right height
        dx = tilt_x * 80.0
        dy = tilt_y * 80.0
        rot_rad = math.radians(rotation_deg)

        dst_pts = np.float32([
            [pad - dx, pad - dy],
            [pad + w + dx, pad + dy * 0.5],
            [pad + w - dx * 0.5, pad + h + dy],
            [pad + dx * 0.5, pad + h - dy * 0.5]
        ])

        # If rotation applied
        if abs(rotation_deg) > 0.001:
            center = (desk_w / 2.0, desk_h / 2.0)
            M_rot = cv2.getRotationMatrix2D(center, rotation_deg, 1.0)
            desk = cv2.warpAffine(desk, M_rot, (desk_w, desk_h), borderValue=(170, 165, 160))
        else:
            H = cv2.getPerspectiveTransform(src_pts, dst_pts)
            desk = cv2.warpPerspective(desk, H, (desk_w, desk_h), borderValue=(170, 165, 160))

        result = desk

        # 3. Lighting gradient / shadow simulation
        if lighting_gradient:
            # Gradient mask simulating an overhead light source with falloff
            X, Y = np.meshgrid(np.linspace(0, 1, desk_w), np.linspace(0, 1, desk_h))
            # Diagonal light: brightest at top-left, darkest at bottom-right
            gradient = 0.65 + 0.45 * (1.0 - (0.6 * X + 0.4 * Y))
            gradient = np.expand_dims(gradient, axis=2)
            result = np.clip(result.astype(np.float32) * gradient, 0, 255).astype(np.uint8)

        # 4. Blur simulation (camera focus blur or mild motion blur)
        if blur_kernel > 0:
            if blur_kernel % 2 == 0:
                blur_kernel += 1
            result = cv2.GaussianBlur(result, (blur_kernel, blur_kernel), 0)

        # 5. Sensor noise simulation
        if sensor_noise:
            noise = np.random.normal(0, 4.0, result.shape).astype(np.float32)
            result = np.clip(result.astype(np.float32) + noise, 0, 255).astype(np.uint8)

        return result


if __name__ == "__main__":
    gen = SyntheticOMRGenerator()
    # Test generation
    img = gen.generate_sheet_with_responses({
        1: "A",
        2: "B",
        3: "C",
        4: "D",
        5: ["A", "C"],
        6: {"option": "B", "type": "LIGHT"},
        7: {"option": "D", "type": "ERASED"},
    })
    cv2.imwrite("synthetic_canonical.png", img)
    # Test camera capture simulation
    photo = gen.simulate_camera_capture(img, rotation_deg=3.5, tilt_x=0.4, tilt_y=0.2, lighting_gradient=True, blur_kernel=3)
    cv2.imwrite("synthetic_photo.png", photo)
    print("Generated synthetic canonical sheet and camera photo successfully!")
