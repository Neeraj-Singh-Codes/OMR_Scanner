import cv2, os, sys
sys.path.insert(0, os.path.abspath('.'))
from scanner.app.services.name_recognition import recognize_name_with_trocr_base

test_crops = [
    ('sample_1 (Aniket A. Mall)', 'diagnostic_crops/new_samples/sample_1_name_crop.jpg'),
    ('sample_0 (Jagdish Nandar)', 'diagnostic_crops/new_samples/sample_0_name_crop.jpg'),
    ('sample_3 (Soham S. Virjare)', 'diagnostic_crops/new_samples/sample_3_name_crop.jpg'),
    ('sample_4 (Ayush V Pandey)', 'diagnostic_crops/new_samples/sample_4_name_crop.jpg'),
    ('clean_scan_3 (Aniket A. Mall)', 'diagnostic_crops/clean_scan_3_name_crop.png'),
]

for label, path in test_crops:
    if not os.path.exists(path):
        continue
    img = cv2.imread(path)
    best_text, best_conf, raw_preds = recognize_name_with_trocr_base(img)
    print(f"\n{label}:")
    print(f"   Best Text: {best_text} (conf: {best_conf}%)")
    for p in raw_preds:
        engine = p["engine"]
        txt = p["text"]
        conf = p["confidence"]
        print(f"      [{engine}]: {repr(txt)} (conf: {conf}%)")
