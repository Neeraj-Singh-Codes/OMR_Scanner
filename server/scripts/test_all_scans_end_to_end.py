import sys, os
sys.path.insert(0, os.path.abspath('.'))
import cv2, glob
from scanner.app.services.candidate_ocr import extract_candidate_info

print("=========================================================================")
print("EVALUATING PIPELINE ON REAL SCANS (GROUND TRUTH AUDIT)")
print("=========================================================================")

for i in range(6):
    hdr_path = glob.glob(f'diagnostic_crops/scan_{i}_*full_header.jpg')[0]
    hdr = cv2.imread(hdr_path)
    res = extract_candidate_info(hdr)
    
    roll = res["roll_number"]
    roll_status = res["rollNumber"]["status"]
    roll_reasons = res["rollNumber"]["reviewReasons"]
    
    name = res["student_name"]
    name_status = res["studentName"]["status"]
    name_reasons = res["studentName"]["reviewReasons"]
    
    print(f"\n[SCAN {i}]: {os.path.basename(hdr_path)}")
    print(f"  Roll:  '{roll}' (status: {roll_status}) {roll_reasons if roll_reasons else ''}")
    print(f"  Name:  '{name}' (status: {name_status}) {name_reasons if name_reasons else ''}")
    print(f"  Total Identity Status: '{res['identityStatus']}'")
