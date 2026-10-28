import sys, os
sys.path.insert(0, os.path.abspath('.'))
import cv2, glob
from scanner.app.services.candidate_ocr import get_ocr_engine

engine = get_ocr_engine()
for h_file in sorted(glob.glob('diagnostic_crops/*_full_header.jpg')):
    img = cv2.imread(h_file)
    res, _ = engine(img)
    base = os.path.basename(h_file)
    print(f'=== {base} ===')
    for b, txt, sc in (res or []):
        xs = [pt[0] for pt in b]
        ys = [pt[1] for pt in b]
        print(f'  txt="{txt}" sc={float(sc):.2f} box=[x:{min(xs):.0f}-{max(xs):.0f}, y:{min(ys):.0f}-{max(ys):.0f}]')
