import sys, os
sys.path.insert(0, os.path.abspath('.'))
import cv2
from scanner.app.services.candidate_ocr import get_ocr_engine

engine = get_ocr_engine()

for i in range(6):
    hdr = cv2.imread(f'diagnostic_crops/scan_{i}_roll_UNASSIGNED_full_header.jpg' if i in [0, 2, 4] else f'diagnostic_crops/scan_{i}_roll_{12 if i==1 else (20 if i==3 else 23)}_full_header.jpg')
    # Exact box between Roll No.: label and Division: label
    # From OCR boxes: Roll No label is around x:460-530, Division label is around x:670-740
    roll_field = hdr[160:225, 520:670]
    cv2.imwrite(f'diagnostic_crops/true_roll_{i}.png', roll_field)
    
    # Run OCR on true_roll
    s2 = cv2.resize(roll_field, (0, 0), fx=2.5, fy=2.5, interpolation=cv2.INTER_CUBIC)
    res, _ = engine(s2)
    print(f"Scan {i} True Roll Field (520-670):", [(t, round(float(s), 2)) for _, t, s in (res or [])])
