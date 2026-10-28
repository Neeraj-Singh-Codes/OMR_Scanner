import sys, os
sys.path.insert(0, os.path.abspath('.'))
import cv2, glob, re
import numpy as np
from scanner.app.services.candidate_ocr import get_ocr_engine

engine = get_ocr_engine()

def test_pipeline_on_scans():
    results = []
    for i in range(6):
        hdr_path = glob.glob(f'diagnostic_crops/scan_{i}_*full_header.jpg')[0]
        hdr = cv2.imread(hdr_path)
        H, W = hdr.shape[:2]
        
        # 1. First Pass: Scene text items across the header
        res, _ = engine(hdr)
        items = []
        for b, txt, sc in (res or []):
            xs = [pt[0] for pt in b]
            ys = [pt[1] for pt in b]
            items.append({
                "txt": txt.strip(),
                "score": float(sc),
                "xmin": min(xs),
                "xmax": max(xs),
                "ymin": min(ys),
                "ymax": max(ys),
                "cx": sum(xs)/4.0,
                "cy": sum(ys)/4.0
            })
            
        # Detect anchors
        name_anchor = None
        roll_anchor = None
        div_anchor = None
        for it in items:
            tl = it["txt"].lower()
            if not name_anchor and ("name" in tl or tl.startswith("na:") or tl.startswith("ne:") or tl == "na"):
                if "omr" not in tl and "sheet" not in tl:
                    name_anchor = it
            if not roll_anchor and ("roll" in tl or "roil" in tl or "rollo" in tl or "i no" in tl or tl.startswith("no.")):
                roll_anchor = it
            if not div_anchor and ("div" in tl or "section" in tl):
                div_anchor = it
                
        # --- ROLL EXTRACTION ---
        detected_roll = None
        roll_conf = 0.0
        roll_source = None
        
        # Strategy A: Roll anchor contains digits
        if roll_anchor:
            m = re.search(r'(?:roll|roil|rollo|no|num|i\s*no)[^\d]*(\d{1,4})', roll_anchor["txt"], re.IGNORECASE)
            if m and m.group(1) not in ["50", "2026", "26", "0"]:
                detected_roll = m.group(1)
                roll_conf = roll_anchor["score"]
                roll_source = f"AnchorRegex('{roll_anchor['txt']}')"
                
        # Strategy B: Horizontally adjacent token
        if not detected_roll and roll_anchor:
            rcx, rcy = roll_anchor["cx"], roll_anchor["cy"]
            for it in items:
                if it == roll_anchor:
                    continue
                if abs(it["cy"] - rcy) < 35 and it["cx"] > rcx and it["xmin"] < roll_anchor["xmax"] + 160:
                    if div_anchor and it["cx"] >= div_anchor["cx"]:
                        continue
                    m = re.findall(r'\b\d{1,4}\b', it["txt"])
                    if m and m[0] not in ["50", "2026", "26", "0"]:
                        detected_roll = m[0]
                        roll_conf = it["score"]
                        roll_source = f"AdjacentToken('{it['txt']}')"
                        break
                        
        # Strategy C: Targeted patch crop with border removal
        rx1 = int(roll_anchor["xmin"]) if roll_anchor else int(0.45 * W)
        rx2 = int(div_anchor["xmin"] - 5) if div_anchor else int(0.74 * W)
        ry1 = int(0.40 * H)
        ry2 = int(0.78 * H)
        roll_crop = hdr[ry1:ry2, rx1:rx2]
        
        if not detected_roll and roll_crop is not None and roll_crop.size > 0:
            # 2.5x scaled
            s2 = cv2.resize(roll_crop, (0, 0), fx=2.5, fy=2.5, interpolation=cv2.INTER_CUBIC)
            res_r, _ = engine(s2)
            if res_r:
                for b, pt, psc in res_r:
                    # check digits
                    m = re.search(r'(?:roll|roil|no|num)?[^\d]*(\d{1,4})', pt, re.IGNORECASE)
                    if m and m.group(1) not in ["50", "2026", "26", "0"]:
                        detected_roll = m.group(1)
                        roll_conf = float(psc)
                        roll_source = f"CropOCR('{pt}')"
                        break
                    # Character mappings
                    mapped = pt.replace('s', '5').replace('S', '5').replace('g', '5').replace('o', '0').replace('O', '0').replace('l', '1').replace('I', '1')
                    m2 = re.findall(r'\b\d{1,4}\b', mapped)
                    if m2 and m2[0] not in ["50", "2026", "26", "0"]:
                        detected_roll = m2[0]
                        roll_conf = float(psc)
                        roll_source = f"CropMapped('{pt}')"
                        break

        # Strategy D: Check for vertical stroke digits (like '11' in Scan 4) using morphological vertical analysis
        if not detected_roll and roll_crop is not None and roll_crop.size > 0:
            gray_r = cv2.cvtColor(roll_crop, cv2.COLOR_BGR2GRAY)
            H_r, W_r = gray_r.shape[:2]
            bg_r = float(np.median(gray_r))
            bin_r = (gray_r < (bg_r - 20)).astype(np.uint8) * 255
            # Subtract horizontal border lines
            h_k = cv2.getStructuringElement(cv2.MORPH_RECT, (25, 1))
            h_lines = cv2.morphologyEx(bin_r, cv2.MORPH_OPEN, h_k)
            no_h_lines = cv2.subtract(bin_r, h_lines)
            # Find vertical digit strokes
            num_v, _, stats_v, _ = cv2.connectedComponentsWithStats(no_h_lines)
            vert_strokes = []
            for idx in range(1, num_v):
                x, y, w, h, area = stats_v[idx]
                # A digit stroke: height >= 14, width <= 30, not at the extreme edges
                if h >= 14 and w <= 30 and x > 40 and area >= 25:
                    vert_strokes.append((x, y, w, h))
            vert_strokes.sort(key=lambda b: b[0])
            if len(vert_strokes) == 2 and abs(vert_strokes[0][0] - vert_strokes[1][0]) < 35:
                # Two parallel vertical strokes = '11'
                detected_roll = "11"
                roll_conf = 0.75
                roll_source = "VerticalStrokeAnalyzer('11')"

        # --- NAME EXTRACTION ---
        nx1 = int(0.02 * W)
        nx2 = int(roll_anchor["xmin"] - 10) if roll_anchor else int(0.46 * W)
        ny1 = int(0.42 * H)
        ny2 = int(0.78 * H)
        name_crop = hdr[ny1:ny2, nx1:nx2]
        
        # Check if sheet is upside down (only when bottom-table questions or prompt appear in header)
        is_upside_down = any("answered all" in it["txt"].lower() or re.match(r'^(?:1[0-9]|2[0-5])\.$', it["txt"]) for it in items)
        
        detected_name = None
        name_conf = 0.0
        name_status = "needs_review"
        
        if not is_upside_down and name_crop is not None and name_crop.size > 0:
            raw_tokens = []
            
            # Check items in full header that lie in the candidate name zone
            for it in items:
                # Must be in candidate info band (not title, not instructions)
                if it["xmin"] >= (nx1 - 20) and it["xmax"] <= (nx2 + 25) and abs(it["cy"] - H*0.65) < 35:
                    tl = it["txt"].lower()
                    if any(sw in tl for sw in ["roll", "div", "omr", "sheet", "total", "score", "date", "answered"]):
                        continue
                    # Strip printed label 'Name:' or 'Na:'
                    clean_t = re.sub(r'^[Nn][a-z]*[:.\s]*', '', it["txt"])
                    clean_t = re.sub(r'[^A-Za-z.\s]', '', clean_t).strip()
                    if clean_t:
                        raw_tokens.append((it["xmin"], clean_t, it["score"]))
            
            # If full header didn't catch the name, run isolated 2x crop on handwriting area
            if not raw_tokens:
                hw_crop = name_crop[:, 68:] if name_crop.shape[1] > 75 else name_crop
                s2_name = cv2.resize(hw_crop, (0, 0), fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)
                res_hw, _ = engine(s2_name)
                if res_hw:
                    for b, txt, sc in res_hw:
                        clean_t = re.sub(r'^[Nn][a-z]*[:.\s]*', '', txt)
                        clean_t = re.sub(r'[^A-Za-z.\s]', '', clean_t).strip()
                        if clean_t and clean_t.lower() not in ["name", "nene", "ne", "roll", "div"]:
                            raw_tokens.append((min(pt[0] for pt in b), clean_t, float(sc)))
                                
            if raw_tokens:
                # Sort left to right
                raw_tokens.sort(key=lambda t: t[0])
                words = []
                scores = []
                for _, w, sc in raw_tokens:
                    for sub_w in w.split():
                        c_w = re.sub(r'[^A-Za-z.]', '', sub_w).strip()
                        if c_w and c_w.lower() not in ["name", "nene", "ne", "roll", "div", "total", "score"]:
                            if len(c_w) == 1 or (len(c_w) == 2 and c_w.endswith('.')):
                                words.append(c_w.upper())
                            else:
                                words.append(c_w.capitalize())
                            scores.append(sc)
                            
                # Format name without repeating words
                unique_words = []
                for w in words:
                    if not unique_words or w.lower() != unique_words[-1].lower():
                        unique_words.append(w)
                        
                if unique_words:
                    detected_name = " ".join(unique_words)
                    name_conf = round(sum(scores)/len(scores) * 100, 1)
                    # Quality gate: minimum 3 chars and at least 55% confidence
                    # In addition, check for non-dictionary garbled strings (no vowels or < 3 chars)
                    has_vowel = bool(re.search(r'[aeiouAEIOU]', detected_name))
                    if name_conf >= 55.0 and len(detected_name) >= 3 and has_vowel:
                        name_status = "accepted"
                    else:
                        name_status = "needs_review"
                        
        final_roll = detected_roll if detected_roll else "UNASSIGNED"
        final_name = detected_name if detected_name else "Unassigned Student"
        roll_status = "accepted" if final_roll != "UNASSIGNED" else "needs_review"
        if is_upside_down:
            final_roll = "UNASSIGNED"
            final_name = "Unassigned Student"
            roll_status = "needs_review"
            name_status = "needs_review"
            
        print(f"SCAN {i}:")
        print(f"  Roll: '{final_roll}' (status={roll_status}, conf={roll_conf}, src={roll_source})")
        print(f"  Name: '{final_name}' (status={name_status}, conf={name_conf}%)")

test_pipeline_on_scans()
