import sys, os
sys.path.insert(0, os.path.abspath('.'))
import cv2, glob
import numpy as np
import torch
from transformers import TrOCRProcessor, VisionEncoderDecoderModel
from scanner.app.services.candidate_ocr import get_ocr_engine

engine = get_ocr_engine()

# Load TrOCR small
print("Loading TrOCR...")
trocr_proc = TrOCRProcessor.from_pretrained("microsoft/trocr-small-handwritten")
trocr_model = VisionEncoderDecoderModel.from_pretrained("microsoft/trocr-small-handwritten")
trocr_model.eval()

def run_trocr(img_bgr):
    rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    pixel_values = trocr_proc(rgb, return_tensors="pt").pixel_values
    with torch.no_grad():
        generated_ids = trocr_model.generate(pixel_values, max_new_tokens=32, return_dict_in_generate=True, output_scores=True)
    text = trocr_proc.batch_decode(generated_ids.sequences, skip_special_tokens=True)[0]
    return text.strip()

for i in range(6):
    n_file = f'diagnostic_crops/clean_scan_{i}_name_crop.png'
    r_file = f'diagnostic_crops/clean_scan_{i}_roll_crop.png'
    img_n = cv2.imread(n_file)
    img_r = cv2.imread(r_file)
    
    # Run RapidOCR on name
    res_n, _ = engine(img_n)
    txt_rapid_n = " | ".join([f"{t} ({float(s):.2f})" for _, t, s in (res_n or [])])
    txt_trocr_n = run_trocr(img_n)
    
    # Run on roll
    res_r, _ = engine(img_r)
    txt_rapid_r = " | ".join([f"{t} ({float(s):.2f})" for _, t, s in (res_r or [])])
    
    print(f"\n--- SCAN {i} ---")
    print(f"  NAME Crop -> RapidOCR: '{txt_rapid_n}'")
    print(f"  NAME Crop -> TrOCR:    '{txt_trocr_n}'")
    print(f"  ROLL Crop -> RapidOCR: '{txt_rapid_r}'")
