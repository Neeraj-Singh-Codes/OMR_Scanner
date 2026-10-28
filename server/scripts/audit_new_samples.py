import cv2, os, sys
sys.path.insert(0, os.path.abspath('.'))
from scanner.app.omr.dual_table_detector import detect_dual_tables
from scanner.app.services.candidate_ocr import warp_candidate_header, extract_candidate_info

img_paths = [
    'C:/Users/Dell/.gemini/antigravity/brain/fdd032c5-2f88-414f-a266-39479eecbe16/.user_uploaded/media_1793183800694_3c8d69fc.jpg',
    'C:/Users/Dell/.gemini/antigravity/brain/fdd032c5-2f88-414f-a266-39479eecbe16/.user_uploaded/media_1793183800706_3095b782.jpg',
    'C:/Users/Dell/.gemini/antigravity/brain/fdd032c5-2f88-414f-a266-39479eecbe16/.user_uploaded/media_1793183800718_ad547d03.jpg',
    'C:/Users/Dell/.gemini/antigravity/brain/fdd032c5-2f88-414f-a266-39479eecbe16/.user_uploaded/media_1793183800730_5f57ce32.jpg',
    'C:/Users/Dell/.gemini/antigravity/brain/fdd032c5-2f88-414f-a266-39479eecbe16/.user_uploaded/media_1793183800745_feab67d1.jpg',
]

os.makedirs('diagnostic_crops/new_samples', exist_ok=True)

for idx, p in enumerate(img_paths):
    img = cv2.imread(p)
    tables = detect_dual_tables(img)
    if tables is None:
        print(f"[{idx}] {os.path.basename(p)}: Dual tables NOT detected!")
        continue
    warped = warp_candidate_header(img, tables)
    cv2.imwrite(f'diagnostic_crops/new_samples/sample_{idx}_header.jpg', warped)
    info = extract_candidate_info(warped)
    roll = info["roll_number"]
    roll_rev = info["roll_details"]["review_required"]
    name = info["student_name"]
    name_rev = info["name_details"]["review_required"]
    raw_name = info["name_details"]["raw_ocr_text"]
    
    print(f"\n[{idx}] {os.path.basename(p)}:")
    print(f"   Roll Number: {roll} (review_required: {roll_rev})")
    print(f"   Student Name: {name} (review_required: {name_rev})")
    print(f"   Raw Name OCR: {repr(raw_name)}")
