import sys, os
sys.path.insert(0, os.path.abspath('.'))
import cv2

for i in [2, 4]:
    img = cv2.imread(f'diagnostic_crops/gt_scan_{i}_roll.png')
    hw_zone = img[:, 80:]
    cv2.imwrite(f'diagnostic_crops/scan_{i}_roll_hw_zone.png', hw_zone)
    print(f"Saved scan_{i}_roll_hw_zone.png")
