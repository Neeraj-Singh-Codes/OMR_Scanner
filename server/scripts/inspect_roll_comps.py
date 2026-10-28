import sys, os
sys.path.insert(0, os.path.abspath('.'))
import cv2
import numpy as np

for i in [2, 4]:
    img = cv2.imread(f'diagnostic_crops/true_roll_{i}.png')
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    bg = float(np.median(gray))
    # Count dark pixels
    dark = (gray < (bg - 25))
    print(f"Scan {i} shape={img.shape}, bg={bg:.1f}, dark_px={np.sum(dark)}")
    # Find components
    num, _, stats, _ = cv2.connectedComponentsWithStats(dark.astype(np.uint8))
    print(f"  Connected components ({num-1}):")
    for idx in range(1, num):
        x, y, w, h, a = stats[idx]
        print(f"    comp {idx}: x={x}, y={y}, w={w}, h={h}, area={a}")
