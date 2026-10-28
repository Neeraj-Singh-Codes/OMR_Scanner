import sys, os
sys.path.insert(0, os.path.abspath('.'))
import cv2
import numpy as np

for i in [1, 2, 4]:
    img = cv2.imread(f'diagnostic_crops/gt_scan_{i}_name.png')
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    bg = float(np.median(gray))
    dark = (gray < (bg - 25))
    
    # Downsample for terminal visualization
    small = cv2.resize(dark.astype(np.uint8), (80, 24), interpolation=cv2.INTER_NEAREST)
    print(f"\n--- SCAN {i} NAME VISUALIZATION (80x24) ---")
    for r in range(small.shape[0]):
        row_str = "".join(["#" if small[r, c] else " " for c in range(small.shape[1])])
        if "#" in row_str:
            print(f"{r:02d}: {row_str}")
