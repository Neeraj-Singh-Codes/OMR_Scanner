import sys, os
sys.path.insert(0, os.path.abspath('.'))
import cv2, glob
from scanner.app.services.candidate_ocr import get_ocr_engine

engine = get_ocr_engine()

for i in range(6):
    n_img = cv2.imread(f'diagnostic_crops/gt_scan_{i}_name.png')
    r_img = cv2.imread(f'diagnostic_crops/gt_scan_{i}_roll.png')
    
    # Name tests
    res_n_raw, _ = engine(n_img)
    # CLAHE
    gray = cv2.cvtColor(n_img, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8))
    enhanced = clahe.apply(gray)
    enhanced_bgr = cv2.cvtColor(enhanced, cv2.COLOR_GRAY2BGR)
    res_n_clahe, _ = engine(enhanced_bgr)
    
    # 2x scaled
    s2 = cv2.resize(n_img, (0, 0), fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)
    res_n_2x, _ = engine(s2)
    
    # Roll tests
    res_r_raw, _ = engine(r_img)
    s2_r = cv2.resize(r_img, (0, 0), fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)
    res_r_2x, _ = engine(s2_r)
    
    print(f"\n=================== SCAN {i} ===================")
    print("NAME RAW:   ", [(t, round(float(s), 2)) for _, t, s in (res_n_raw or [])])
    print("NAME CLAHE: ", [(t, round(float(s), 2)) for _, t, s in (res_n_clahe or [])])
    print("NAME 2X:    ", [(t, round(float(s), 2)) for _, t, s in (res_n_2x or [])])
    print("ROLL RAW:   ", [(t, round(float(s), 2)) for _, t, s in (res_r_raw or [])])
    print("ROLL 2X:    ", [(t, round(float(s), 2)) for _, t, s in (res_r_2x or [])])
