import sys, os
sys.path.insert(0, os.path.abspath('.'))
import cv2, glob
import numpy as np

for i in range(6):
    hdr = glob.glob(f'diagnostic_crops/scan_{i}_*full_header.jpg')[0]
    img = cv2.imread(hdr)
    H, W = img.shape[:2]
    # Name region: y: 150-215, x: 80-450
    # Roll region: y: 150-215, x: 460-650
    name_box = img[150:215, 80:450]
    roll_box = img[150:215, 460:650]
    cv2.imwrite(f'diagnostic_crops/gt_scan_{i}_name.png', name_box)
    cv2.imwrite(f'diagnostic_crops/gt_scan_{i}_roll.png', roll_box)
    print(f"Saved gt_scan_{i}_name.png and gt_scan_{i}_roll.png")
