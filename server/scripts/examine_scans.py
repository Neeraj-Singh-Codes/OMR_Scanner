import sys, os
sys.path.insert(0, os.path.abspath('.'))
import cv2, glob
import numpy as np
from scanner.app.services.candidate_ocr import get_ocr_engine

engine = get_ocr_engine()

# Examine each of the 6 scans
for i in range(6):
    hdr_path = f'diagnostic_crops/scan_{i}_*full_header.jpg'
    matches = glob.glob(hdr_path)
    if not matches:
        continue
    h_file = matches[0]
    img = cv2.imread(h_file)
    H, W = img.shape[:2]
    print(f"\n=======================================================")
    print(f"SCAN {i}: {os.path.basename(h_file)} (size={W}x{H})")
    print(f"=======================================================")
    
    # 1. Full header OCR
    res, _ = engine(img)
    print("Full Header Tokens:")
    for b, txt, sc in (res or []):
        xs = [pt[0] for pt in b]
        ys = [pt[1] for pt in b]
        print(f"   [{int(min(xs))}-{int(max(xs))}, {int(min(ys))}-{int(max(ys))}] (conf={float(sc):.2f}): '{txt}'")
