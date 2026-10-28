import os
import sys
import time
import cv2
import numpy as np

sys.path.insert(0, os.path.abspath('.'))

from scanner.app.omr.dual_table_detector import detect_dual_tables
from scanner.app.services.candidate_ocr import warp_candidate_header, extract_candidate_info


def calculate_levenshtein(s1: str, s2: str) -> int:
    m, n = len(s1), len(s2)
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(m + 1):
        dp[i][0] = i
    for j in range(n + 1):
        dp[0][j] = j
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if s1[i - 1].lower() == s2[j - 1].lower():
                dp[i][j] = dp[i - 1][j - 1]
            else:
                dp[i][j] = 1 + min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    return dp[m][n]


def calculate_wer(s1: str, s2: str) -> float:
    w1, w2 = s1.lower().split(), s2.lower().split()
    m, n = len(w1), len(w2)
    if m == 0 and n == 0:
        return 0.0
    if m == 0 or n == 0:
        return 1.0
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(m + 1):
        dp[i][0] = i
    for j in range(n + 1):
        dp[0][j] = j
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if w1[i - 1] == w2[j - 1]:
                dp[i][j] = dp[i - 1][j - 1]
            else:
                dp[i][j] = 1 + min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    return dp[m][n] / max(m, 1)


DATASET = [
    {
        "id": "scan_01_aditya",
        "path": "C:/Users/Dell/.gemini/antigravity/brain/fdd032c5-2f88-414f-a266-39479eecbe16/.user_uploaded/media_1793084190331_4d4630eb.png",
        "expected_name": "Aditya Virendra Singh",
        "expected_roll": "52",
    },
    {
        "id": "scan_02_empty",
        "path": "C:/Users/Dell/.gemini/antigravity/brain/fdd032c5-2f88-414f-a266-39479eecbe16/.user_uploaded/media_1793084201496_c0ce671d.png",
        "expected_name": "Unassigned Student",
        "expected_roll": "UNASSIGNED",
    },
    {
        "id": "scan_03_jagdish",
        "path": "C:/Users/Dell/.gemini/antigravity/brain/fdd032c5-2f88-414f-a266-39479eecbe16/.user_uploaded/media_1793183800694_3c8d69fc.jpg",
        "expected_name": "Jagdish Nandar",
        "expected_roll": "23",
    },
    {
        "id": "scan_04_aniket",
        "path": "C:/Users/Dell/.gemini/antigravity/brain/fdd032c5-2f88-414f-a266-39479eecbe16/.user_uploaded/media_1793183800706_3095b782.jpg",
        "expected_name": "Aniket A. Mall",
        "expected_roll": "20",
    },
    {
        "id": "scan_05_soham",
        "path": "C:/Users/Dell/.gemini/antigravity/brain/fdd032c5-2f88-414f-a266-39479eecbe16/.user_uploaded/media_1793183800730_5f57ce32.jpg",
        "expected_name": "Soham S. Virjare",
        "expected_roll": "11",
    },
    {
        "id": "scan_06_ayush",
        "path": "C:/Users/Dell/.gemini/antigravity/brain/fdd032c5-2f88-414f-a266-39479eecbe16/.user_uploaded/media_1793183800745_feab67d1.jpg",
        "expected_name": "Ayush V Pandey",
        "expected_roll": "UNASSIGNED",
    },
]


def run_evaluation():
    print("=" * 80)
    print("ACCURATE FULL-NAME & ROLL-NUMBER EXTRACTION: QUANTITATIVE EVALUATION BENCHMARK")
    print("=" * 80)

    total = len(DATASET)
    name_exact = 0
    roll_exact = 0
    total_name_chars = 0
    total_name_dist = 0
    total_wer = 0.0
    flagged_for_review = 0
    total_lat_ms = 0.0

    results = []

    for item in DATASET:
        p = item["path"]
        if not os.path.exists(p):
            print(f"Skipping missing sample: {p}")
            continue

        img = cv2.imread(p)
        t0 = time.perf_counter()
        tables = detect_dual_tables(img)
        if not tables:
            print(f"Sample {item['id']}: Dual table detection failed!")
            continue

        hdr = warp_candidate_header(img, tables)
        info = extract_candidate_info(hdr)
        lat_ms = (time.perf_counter() - t0) * 1000.0
        total_lat_ms += lat_ms

        pred_name = info["student_name"] or ""
        pred_roll = info["roll_number"] or ""
        exp_name = item["expected_name"]
        exp_roll = item["expected_roll"]

        n_dist = calculate_levenshtein(pred_name, exp_name)
        total_name_dist += n_dist
        total_name_chars += max(len(exp_name), 1)

        wer = calculate_wer(pred_name, exp_name)
        total_wer += wer

        is_name_match = (pred_name.strip().lower() == exp_name.strip().lower())
        is_roll_match = (pred_roll.strip() == exp_roll.strip())

        if is_name_match:
            name_exact += 1
        if is_roll_match:
            roll_exact += 1

        rev_req = info["name_details"]["review_required"] or info["roll_details"]["review_required"]
        if rev_req:
            flagged_for_review += 1

        results.append({
            "id": item["id"],
            "exp_name": exp_name,
            "pred_name": pred_name,
            "name_conf": info["name_details"]["confidence"],
            "exp_roll": exp_roll,
            "pred_roll": pred_roll,
            "roll_conf": info["roll_details"]["confidence"],
            "name_match": is_name_match,
            "roll_match": is_roll_match,
            "review": rev_req,
            "reasons": info["name_details"]["review_reasons"] + info["roll_details"]["review_reasons"],
            "latency_ms": round(lat_ms, 1),
        })

    print(f"\n{'ID':<16} | {'PREDICTED NAME':<24} | {'EXP ROLL':<8} | {'PRED ROLL':<9} | {'NAME CONF':<9} | {'REVIEW'}")
    print("-" * 80)
    for r in results:
        status = "NEEDS_REVIEW" if r["review"] else "VERIFIED"
        print(f"{r['id']:<16} | {r['pred_name']:<24} | {r['exp_roll']:<8} | {r['pred_roll']:<9} | {r['name_conf']:<9.1f} | {status}")
        if r["reasons"]:
            print(f"   -> Reasons: {'; '.join(r['reasons'])}")

    cer = (total_name_dist / max(total_name_chars, 1)) * 100.0
    avg_wer = (total_wer / max(len(results), 1)) * 100.0
    exact_name_pct = (name_exact / max(len(results), 1)) * 100.0
    exact_roll_pct = (roll_exact / max(len(results), 1)) * 100.0
    review_pct = (flagged_for_review / max(len(results), 1)) * 100.0
    avg_latency = total_lat_ms / max(len(results), 1)

    print("\n" + "=" * 80)
    print("FINAL SUMMARY METRICS")
    print("=" * 80)
    print(f"Total Evaluated Scans:         {len(results)}")
    print(f"Exact Roll Match Rate:         {exact_roll_pct:.1f}%")
    print(f"Exact Name Match Rate:         {exact_name_pct:.1f}%")
    print(f"Character Error Rate (CER):    {cer:.2f}%")
    print(f"Word Error Rate (WER):         {avg_wer:.2f}%")
    print(f"Review Flag Rate:              {review_pct:.1f}%")
    print(f"Average Pipeline Latency:      {avg_latency:.1f} ms/sheet")
    print("=" * 80)


if __name__ == '__main__':
    run_evaluation()
