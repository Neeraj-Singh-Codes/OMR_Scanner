import sys, os
sys.path.insert(0, os.path.abspath('.'))
import cv2
import numpy as np

for i in [2, 4]:
    img = cv2.imread(f'diagnostic_crops/gt_scan_{i}_roll.png')
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    bg = float(np.median(gray))
    ink = (gray < (bg - 25)).astype(np.uint8) * 255
    # The printed text is on the left (x < 100), handwriting would be on the right (x > 100)
    hw_zone = gray[:, 100:]
    hw_bg = float(np.median(hw_zone))
    hw_ink = (hw_zone < (hw_bg - 25)).astype(np.uint8) * 255
    print(f"Scan {i} Roll HW zone (x > 100): shape={hw_zone.shape}, ink_pixels={np.sum(hw_ink > 0)}, min_val={np.min(hw_zone)}, median_val={hw_bg}")
