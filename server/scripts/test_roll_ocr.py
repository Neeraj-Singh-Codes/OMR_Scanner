import sys, os
sys.path.insert(0, os.path.abspath('.'))
import cv2
import numpy as np
from scanner.app.services.candidate_ocr import get_ocr_engine

engine = get_ocr_engine()

for i in [2, 4]:
    img = cv2.imread(f'diagnostic_crops/scan_{i}_roll_hw_zone.png')
    print(f"\n=== SCAN {i} ROLL HW ZONE (shape={img.shape}) ===")
    
    # 1. Raw
    res, _ = engine(img)
    print("  RAW: ", [(t, round(float(s), 2)) for _, t, s in (res or [])])
    
    # 2. 2.5x cubic
    s2 = cv2.resize(img, (0, 0), fx=2.5, fy=2.5, interpolation=cv2.INTER_CUBIC)
    res, _ = engine(s2)
    print("  2.5x: ", [(t, round(float(s), 2)) for _, t, s in (res or [])])
    
    # 3. 3x cubic with unsharp mask
    s3 = cv2.resize(img, (0, 0), fx=3.0, fy=3.0, interpolation=cv2.INTER_CUBIC)
    gaussian = cv2.GaussianBlur(s3, (0, 0), 2.0)
    unsharp = cv2.addWeighted(s3, 1.8, gaussian, -0.8, 0)
    res, _ = engine(unsharp)
    print("  3x unsharp: ", [(t, round(float(s), 2)) for _, t, s in (res or [])])
    
    # 4. Otsu binarization
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    _, otsu = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    otsu_bgr = cv2.cvtColor(otsu, cv2.COLOR_GRAY2BGR)
    s_otsu = cv2.resize(otsu_bgr, (0, 0), fx=2.5, fy=2.5, interpolation=cv2.INTER_CUBIC)
    res, _ = engine(s_otsu)
    print("  Otsu: ", [(t, round(float(s), 2)) for _, t, s in (res or [])])
