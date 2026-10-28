import sys, os
sys.path.insert(0, os.path.abspath('.'))
import cv2, glob

for i in range(6):
    hdr_path = glob.glob(f'diagnostic_crops/scan_{i}_*full_header.jpg')[0]
    img = cv2.imread(hdr_path)
    H, W = img.shape[:2]
    
    # Save isolated Name field and isolated Roll field
    # Template: Name is roughly y:140-220, x:80-450; Roll is y:140-220, x:460-700
    name_crop = img[int(H*0.48):int(H*0.78), int(W*0.08):int(W*0.48)]
    roll_crop = img[int(H*0.48):int(H*0.78), int(W*0.46):int(W*0.72)]
    
    cv2.imwrite(f'diagnostic_crops/clean_scan_{i}_name_crop.png', name_crop)
    cv2.imwrite(f'diagnostic_crops/clean_scan_{i}_roll_crop.png', roll_crop)
    print(f"Scan {i}: Name crop={name_crop.shape}, Roll crop={roll_crop.shape}")
