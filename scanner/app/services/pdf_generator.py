"""
Standardized OMR Sheet PDF Generator.
Uses ReportLab to draw a pixel-perfect A4 answer sheet adhering strictly
to shared/omr-template-config.json.
"""

import os
from pathlib import Path
from typing import Dict, Any, Optional
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib import colors

from scanner.app.services.template_config import load_template_config


class OMRSheetGenerator:
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self.config = config or load_template_config()
        self.page_w = self.config["page"]["width_pt"]
        self.page_h = self.config["page"]["height_pt"]

    def _c_y(self, top_left_y: float) -> float:
        """Converts top-left Y coordinate to ReportLab bottom-left coordinate."""
        return self.page_h - top_left_y

    def generate_school_25q(
        self,
        output_path: str,
        exam_id: str = "EXAM-2026-001",
        exam_title: str = "School Assessment Examination",
        subject: str = "Science",
        class_name: str = "Class 10",
        exam_date: str = "2026-10-27",
    ) -> str:
        """Generates a printable A4 School Dual-Table OMR PDF matching the 25-question layout."""
        out_file = Path(output_path).resolve()
        out_file.parent.mkdir(parents=True, exist_ok=True)

        c = canvas.Canvas(str(out_file), pagesize=(self.page_w, self.page_h))
        c.setTitle(f"School OMR Sheet (25Q) - {exam_id}")
        c.setAuthor("OMR Evaluation System")

        margin_x = 45.0
        content_w = self.page_w - (2 * margin_x)

        # 1. Title & Header
        c.setFont("Helvetica-Bold", 16)
        c.setFillColor(colors.HexColor("#0F172A"))
        c.drawCentredString(self.page_w / 2.0, self._c_y(40), exam_title.upper())

        c.setFont("Helvetica", 9)
        c.setFillColor(colors.HexColor("#475569"))
        c.drawCentredString(
            self.page_w / 2.0,
            self._c_y(56),
            f"Subject: {subject}   |   Class: {class_name}   |   Date: {exam_date}   |   Exam Code: {exam_id}",
        )

        # 2. Candidate Information Card (Auto-cropped by detector during scan review)
        cand_y = 68.0
        cand_h = 75.0
        c.setStrokeColor(colors.HexColor("#0F172A"))
        c.setLineWidth(1.2)
        c.rect(margin_x, self._c_y(cand_y + cand_h), content_w, cand_h, fill=0, stroke=1)

        # Candidate Details Header strip
        c.setFillColor(colors.HexColor("#F1F5F9"))
        c.rect(margin_x, self._c_y(cand_y + 18), content_w, 18, fill=1, stroke=0)
        c.setFillColor(colors.HexColor("#0F172A"))
        c.setFont("Helvetica-Bold", 8.5)
        c.drawString(margin_x + 8, self._c_y(cand_y + 13), "CANDIDATE INFORMATION & IDENTIFICATION")

        c.setFont("Helvetica-Bold", 9)
        c.drawString(margin_x + 10, self._c_y(cand_y + 35), "Student Name:")
        c.setStrokeColor(colors.HexColor("#94A3B8"))
        c.setLineWidth(0.8)
        c.line(margin_x + 85, self._c_y(cand_y + 35), margin_x + content_w - 10, self._c_y(cand_y + 35))

        c.drawString(margin_x + 10, self._c_y(cand_y + 58), "Roll Number:")
        # Draw roll number digit boxes
        digit_box_w = 14.0
        digit_box_h = 16.0
        start_dx = margin_x + 85
        for d in range(8):
            c.rect(start_dx + d * (digit_box_w + 2), self._c_y(cand_y + 46 + digit_box_h), digit_box_w, digit_box_h, fill=0, stroke=1)

        c.drawString(margin_x + 230, self._c_y(cand_y + 58), "Class:")
        c.line(margin_x + 265, self._c_y(cand_y + 58), margin_x + 320, self._c_y(cand_y + 58))

        c.drawString(margin_x + 335, self._c_y(cand_y + 58), "Division:")
        c.line(margin_x + 385, self._c_y(cand_y + 58), margin_x + 430, self._c_y(cand_y + 58))

        # Instructions banner
        inst_y = cand_y + cand_h + 10
        c.setFont("Helvetica-Bold", 7.5)
        c.setFillColor(colors.HexColor("#DC2626"))
        c.drawString(margin_x, self._c_y(inst_y + 8), "INSTRUCTIONS:")
        c.setFont("Helvetica", 7.5)
        c.setFillColor(colors.HexColor("#334155"))
        c.drawString(
            margin_x + 75,
            self._c_y(inst_y + 8),
            "• Use Blue/Black Ballpoint pen only. • Completely darken one circle per question:  Correct [ ● ]  Incorrect [ ✗ ] [ ✓ ]",
        )

        # 3. Dual Answer Tables
        # Left Table: Questions 1 to 13 (13 question rows + 1 header row = 14 rows)
        # Right Table: Questions 14 to 25 (12 question rows + 1 header row = 13 rows)
        table_top_y = inst_y + 20
        table_h = 580.0
        table_w = (content_w - 20) / 2.0  # ~242.6 pt each

        left_tbl_x = margin_x
        right_tbl_x = margin_x + table_w + 20.0

        q_radius = 8.5
        options = ["A", "B", "C", "D"]

        # Helper to draw a single table
        def draw_table(tbl_x, start_q, end_q):
            num_rows = (end_q - start_q + 1) + 1  # +1 for header
            row_h = table_h / num_rows
            col_q_w = 46.0
            col_opt_w = (table_w - col_q_w) / 4.0

            # Outer table border (prominent for edge detector)
            c.setStrokeColor(colors.black)
            c.setLineWidth(1.5)
            c.rect(tbl_x, self._c_y(table_top_y + table_h), table_w, table_h, fill=0, stroke=1)

            # Header row
            c.setFillColor(colors.HexColor("#E2E8F0"))
            c.rect(tbl_x, self._c_y(table_top_y + row_h), table_w, row_h, fill=1, stroke=0)

            c.setStrokeColor(colors.HexColor("#334155"))
            c.setLineWidth(0.8)
            # Header bottom line
            c.line(tbl_x, self._c_y(table_top_y + row_h), tbl_x + table_w, self._c_y(table_top_y + row_h))

            # Header text
            c.setFillColor(colors.HexColor("#0F172A"))
            c.setFont("Helvetica-Bold", 8.5)
            c.drawCentredString(tbl_x + col_q_w / 2.0, self._c_y(table_top_y + row_h / 2.0 + 3), "Q.No")

            for idx, opt in enumerate(options):
                opt_cx = tbl_x + col_q_w + (idx + 0.5) * col_opt_w
                c.drawCentredString(opt_cx, self._c_y(table_top_y + row_h / 2.0 + 3), opt)

            # Column dividing lines
            c.line(tbl_x + col_q_w, self._c_y(table_top_y), tbl_x + col_q_w, self._c_y(table_top_y + table_h))
            for idx in range(1, 4):
                col_x = tbl_x + col_q_w + idx * col_opt_w
                c.line(col_x, self._c_y(table_top_y), col_x, self._c_y(table_top_y + table_h))

            # Question rows
            for i, q_num in enumerate(range(start_q, end_q + 1)):
                r_top_y = table_top_y + (i + 1) * row_h
                r_mid_y = r_top_y + row_h / 2.0

                # Row separator line
                c.setStrokeColor(colors.HexColor("#475569"))
                c.setLineWidth(0.7)
                c.line(tbl_x, self._c_y(r_top_y + row_h), tbl_x + table_w, self._c_y(r_top_y + row_h))

                # Question Number label
                c.setFont("Helvetica-Bold", 9)
                c.setFillColor(colors.HexColor("#0F172A"))
                c.drawCentredString(tbl_x + col_q_w / 2.0, self._c_y(r_mid_y + 3), f"{q_num:02d}")

                # Option bubbles
                for idx, opt in enumerate(options):
                    opt_cx = tbl_x + col_q_w + (idx + 0.5) * col_opt_w

                    c.setStrokeColor(colors.HexColor("#1E293B"))
                    c.setLineWidth(0.9)
                    c.circle(opt_cx, self._c_y(r_mid_y), q_radius, fill=0, stroke=1)

                    c.setFont("Helvetica", 7.5)
                    c.setFillColor(colors.HexColor("#475569"))
                    c.drawCentredString(opt_cx, self._c_y(r_mid_y + 2.5), opt)

        # Draw Left Table (Q1-Q13) & Right Table (Q14-Q25)
        draw_table(left_tbl_x, 1, 13)
        draw_table(right_tbl_x, 14, 25)

        # 4. Footer
        c.setFont("Helvetica-Bold", 7.5)
        c.setFillColor(colors.HexColor("#64748B"))
        c.drawCentredString(
            self.page_w / 2.0,
            self._c_y(self.page_h - 22),
            "TEMPLATE: SCHOOL-25Q-DUAL-TABLE   •   AUTOMATIC EVALUATION SYSTEM",
        )

        c.showPage()
        c.save()
        return str(out_file)

    def generate(
        self,
        output_path: str,
        exam_id: str = "EXAM-2026-001",
        exam_title: str = "Standard Assessment Examination",
        subject: str = "General Science",
        class_name: str = "Grade 10",
        exam_date: str = "2026-10-27",
    ) -> str:
        """Generates a standardized A4 OMR PDF."""
        out_file = Path(output_path).resolve()
        out_file.parent.mkdir(parents=True, exist_ok=True)

        c = canvas.Canvas(str(out_file), pagesize=(self.page_w, self.page_h))
        c.setTitle(f"OMR Sheet - {exam_id}")
        c.setAuthor("OMR Evaluation System")

        # 1. Draw Corner Alignment Markers (Solid Black Squares)
        markers = self.config["markers"]
        m_size = markers["size_pt"]
        c.setFillColor(colors.black)
        c.setStrokeColor(colors.black)

        for marker_key in ["top_left", "top_right", "bottom_left", "bottom_right"]:
            m = markers[marker_key]
            # In canvas, rect(x, y, w, h) has (x, y) at bottom-left of the rect
            c.rect(m["x_pt"], self._c_y(m["y_pt"] + m_size), m_size, m_size, fill=1, stroke=0)

        # 2. Header Title & Template Info
        title_zone = self.config["header_zones"]["title_zone"]
        c.setFont("Helvetica-Bold", 15)
        c.drawCentredString(self.page_w / 2.0, self._c_y(title_zone["y_pt"] + 16), "OMR EXAMINATION ANSWER SHEET")

        c.setFont("Helvetica", 9)
        c.setFillColor(colors.HexColor("#4B5563"))
        c.drawCentredString(self.page_w / 2.0, self._c_y(title_zone["y_pt"] + 30), "OFFICIAL STANDARDIZED EVALUATION FORM")

        # Template Version Tag
        c.setFont("Helvetica-Bold", 8)
        c.setFillColor(colors.HexColor("#1F2937"))
        version_text = f"TEMPLATE: {self.config['template_version']}"
        c.drawRightString(self.page_w - 60, self._c_y(title_zone["y_pt"] + 12), version_text)

        # 3. Exam Details Box (Left)
        exam_box = self.config["header_zones"]["exam_info_box"]
        eb_x = exam_box["x_pt"]
        eb_y = exam_box["y_pt"]
        eb_w = exam_box["width_pt"]
        eb_h = exam_box["height_pt"]

        c.setStrokeColor(colors.HexColor("#9CA3AF"))
        c.setLineWidth(1)
        c.rect(eb_x, self._c_y(eb_y + eb_h), eb_w, eb_h, fill=0, stroke=1)

        # Exam Details Header Band
        c.setFillColor(colors.HexColor("#F3F4F6"))
        c.rect(eb_x, self._c_y(eb_y + 18), eb_w, 18, fill=1, stroke=0)
        c.setFillColor(colors.HexColor("#111827"))
        c.setFont("Helvetica-Bold", 9)
        c.drawString(eb_x + 8, self._c_y(eb_y + 13), "EXAMINATION DETAILS")

        # Exam Information Fields
        c.setFont("Helvetica", 8.5)
        c.drawString(eb_x + 8, self._c_y(eb_y + 36), f"Exam ID:  {exam_id}")
        c.drawString(eb_x + 8, self._c_y(eb_y + 54), f"Title:       {exam_title[:32]}")
        c.drawString(eb_x + 8, self._c_y(eb_y + 72), f"Subject:   {subject}    |    Class: {class_name}")
        c.drawString(eb_x + 8, self._c_y(eb_y + 90), f"Date:       {exam_date}")

        # 4. Student Details Box (Right)
        stu_box = self.config["header_zones"]["student_info_box"]
        sb_x = stu_box["x_pt"]
        sb_y = stu_box["y_pt"]
        sb_w = stu_box["width_pt"]
        sb_h = stu_box["height_pt"]

        c.setStrokeColor(colors.HexColor("#9CA3AF"))
        c.setLineWidth(1)
        c.rect(sb_x, self._c_y(sb_y + sb_h), sb_w, sb_h, fill=0, stroke=1)

        # Header Band
        c.setFillColor(colors.HexColor("#F3F4F6"))
        c.rect(sb_x, self._c_y(sb_y + 18), sb_w, 18, fill=1, stroke=0)
        c.setFillColor(colors.HexColor("#111827"))
        c.setFont("Helvetica-Bold", 9)
        c.drawString(sb_x + 8, self._c_y(sb_y + 13), "CANDIDATE DETAILS")

        # Student Name field
        c.setFont("Helvetica", 8.5)
        c.drawString(sb_x + 8, self._c_y(sb_y + 35), "Candidate Name:")
        c.setStrokeColor(colors.HexColor("#9CA3AF"))
        c.line(sb_x + 85, self._c_y(sb_y + 35), sb_x + sb_w - 8, self._c_y(sb_y + 35))

        # Roll Number Boxes
        c.drawString(sb_x + 8, self._c_y(sb_y + 56), "Roll Number:")
        num_digits = stu_box.get("roll_number_digits", 10)
        box_w = 13.0
        box_h = 16.0
        start_box_x = sb_x + 85
        for d in range(num_digits):
            c.rect(start_box_x + d * (box_w + 1.5), self._c_y(sb_y + 44 + box_h), box_w, box_h, fill=0, stroke=1)

        # Signature Field
        c.drawString(sb_x + 8, self._c_y(sb_y + 88), "Signature:")
        c.line(sb_x + 65, self._c_y(sb_y + 88), sb_x + sb_w - 8, self._c_y(sb_y + 88))

        # 5. Instructions Box
        inst_box = self.config["header_zones"]["instructions_box"]
        ib_x = inst_box["x_pt"]
        ib_y = inst_box["y_pt"]
        ib_w = inst_box["width_pt"]
        ib_h = inst_box["height_pt"]

        c.setStrokeColor(colors.HexColor("#D1D5DB"))
        c.rect(ib_x, self._c_y(ib_y + ib_h), ib_w, ib_h, fill=0, stroke=1)

        c.setFont("Helvetica-Bold", 8.5)
        c.setFillColor(colors.HexColor("#DC2626"))
        c.drawString(ib_x + 10, self._c_y(ib_y + 16), "IMPORTANT INSTRUCTIONS:")

        c.setFont("Helvetica", 7.5)
        c.setFillColor(colors.HexColor("#374151"))
        c.drawString(ib_x + 10, self._c_y(ib_y + 31), "• Use BLACK or BLUE ballpoint pen or 2B pencil only. Completely fill the circular bubble corresponding to your answer.")
        c.drawString(ib_x + 10, self._c_y(ib_y + 45), "• Darken only ONE bubble per question. Multiple marks, ticks, or partial shading will be treated as invalid / ambiguous.")
        c.drawString(ib_x + 10, self._c_y(ib_y + 59), "• Do not fold, crumple, stain, or make stray markings anywhere on this sheet. Keep corner markers completely clear.")

        # Visual sample guide
        c.setFont("Helvetica-Bold", 7.5)
        c.drawString(ib_x + 10, self._c_y(ib_y + 73), "Filling Guide:  Correct: [ ● ]   Incorrect: [ ✓ ]  [ ✗ ]  [ ◐ ]  [ ⊙ ]")

        # 6. Grid Layout (2 Columns for Questions 1-30)
        c.setStrokeColor(colors.HexColor("#CBD5E1"))
        c.setLineWidth(1)
        grid = self.config["grid_layout"]
        col1 = grid["column_1_box"]
        col2 = grid["column_2_box"]

        c.rect(col1["x_pt"], self._c_y(col1["y_pt"] + col1["height_pt"]), col1["width_pt"], col1["height_pt"], fill=0, stroke=1)
        c.rect(col2["x_pt"], self._c_y(col2["y_pt"] + col2["height_pt"]), col2["width_pt"], col2["height_pt"], fill=0, stroke=1)

        # Column Header Bands
        c.setFillColor(colors.HexColor("#E5E7EB"))
        c.rect(col1["x_pt"], self._c_y(col1["y_pt"] + 20), col1["width_pt"], 20, fill=1, stroke=0)
        c.rect(col2["x_pt"], self._c_y(col2["y_pt"] + 20), col2["width_pt"], 20, fill=1, stroke=0)

        c.setFillColor(colors.HexColor("#1F2937"))
        c.setFont("Helvetica-Bold", 8)
        c.drawString(col1["x_pt"] + 12, self._c_y(col1["y_pt"] + 13), "Q.No")
        c.drawString(col2["x_pt"] + 12, self._c_y(col2["y_pt"] + 13), "Q.No")

        for opt in ["A", "B", "C", "D"]:
            c.drawCentredString(self.config["questions"][0]["bubbles"][opt]["cx_pt"], self._c_y(col1["y_pt"] + 13), opt)
            c.drawCentredString(self.config["questions"][15]["bubbles"][opt]["cx_pt"], self._c_y(col2["y_pt"] + 13), opt)

        # Questions & Bubbles
        b_radius = self.config["bubble_specs"]["radius_pt"]
        for q in self.config["questions"]:
            q_num = q["question_number"]
            y_pt = q["y_pt"]

            # Question Number
            c.setFont("Helvetica-Bold", 9)
            c.setFillColor(colors.HexColor("#1E293B"))
            c.drawCentredString(q["num_label_x_pt"], self._c_y(y_pt + 3), f"{q_num:02d}")

            # Draw Bubbles A, B, C, D
            for opt, b_info in q["bubbles"].items():
                cx = b_info["cx_pt"]
                cy = b_info["cy_pt"]

                # Outline circle
                c.setStrokeColor(colors.HexColor("#1E293B"))
                c.setLineWidth(0.9)
                c.circle(cx, self._c_y(cy), b_radius, fill=0, stroke=1)

                # Option label inside bubble
                c.setFont("Helvetica", 7.5)
                c.setFillColor(colors.HexColor("#64748B"))
                c.drawCentredString(cx, self._c_y(cy + 2.5), opt)

        # 7. Footer
        c.setFont("Helvetica", 7)
        c.setFillColor(colors.HexColor("#6B7280"))
        c.drawCentredString(
            self.page_w / 2.0,
            self._c_y(self.page_h - 18),
            "DO NOT WRITE OR FOLD OUTSIDE THE FOUR CORNER ALIGNMENT SQUARES. KEEP SHEET CLEAN AND FLAT."
        )

        c.showPage()
        c.save()
        return str(out_file)


if __name__ == "__main__":
    generator = OMRSheetGenerator()
    out = generator.generate("sample_omr_sheet.pdf")
    print(f"OMR PDF generated successfully at: {out}")
