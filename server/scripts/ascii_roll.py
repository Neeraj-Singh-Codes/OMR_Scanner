import sys, os
sys.path.insert(0, os.path.abspath('.'))
import cv2
import numpy as np

for i in [2, 4]:
    img = cv2.imread(f'diagnostic_crops/true_roll_{i}.png')
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    bg = float(np.median(gray))
    dark = (gray < (bg - 25))
    
    # Downsample by 2 for terminal visualization
    small = cv2.resize(dark.astype(np.uint8), (75, 32), interpolation=cv2.INTER_NEAREST)
    print(f"\n--- SCAN {i} ROLL VISUALIZATION (75x32) ---")
    for r in range(small.shape[0]):
        row_str = "".join(["#" if small[r, c] else " " for c in range(small.shape[1])])
        if "#" in row_str:
            print(f"{r:02d}: {row_str}")
