import cv2
import numpy as np
from check_bubble_x import get_best_pair, order_points

img_paths = [
    r'C:/Users/Dell/.gemini/antigravity/brain/fdd032c5-2f88-414f-a266-39479eecbe16/.user_uploaded/media_1793191352845_bbd3d927.jpg',
    r'C:/Users/Dell/.gemini/antigravity/brain/fdd032c5-2f88-414f-a266-39479eecbe16/.user_uploaded/media_1793191352846_0f6adaa2.jpg',
    r'C:/Users/Dell/.gemini/antigravity/brain/fdd032c5-2f88-414f-a266-39479eecbe16/.user_uploaded/media_1793191352868_d50858a0.jpg',
    r'C:/Users/Dell/.gemini/antigravity/brain/fdd032c5-2f88-414f-a266-39479eecbe16/.user_uploaded/media_1793191352964_d092e970.jpg'
]

target_w, target_h = 500, 1300
dst_pts = np.array([[0, 0], [target_w - 1, 0], [target_w - 1, target_h - 1], [0, target_h - 1]], dtype="float32")

opt_centers = [142, 226, 310, 394]
options = ["A", "B", "C", "D"]

for idx, p in enumerate(img_paths):
    img = cv2.imread(p)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    pair = get_best_pair(gray)
    c1, c2 = pair

    M_left = cv2.getPerspectiveTransform(order_points(c1["pts"]), dst_pts)
    warped_left = cv2.warpPerspective(gray, M_left, (target_w, target_h))

    M_right = cv2.getPerspectiveTransform(order_points(c2["pts"]), dst_pts)
    warped_right = cv2.warpPerspective(gray, M_right, (target_w, target_h))

    answers = {}
    row_h = target_h / 10.0

    # Left: Q1 to Q10
    for q in range(1, 11):
        y_c = int((q - 0.5) * row_h)
        opt_means = {}
        for opt_idx, opt in enumerate(options):
            x_c = opt_centers[opt_idx]
            patch = warped_left[y_c - 25 : y_c + 25, x_c - 25 : x_c + 25]
            opt_means[opt] = float(np.mean(patch))
        sorted_opts = sorted(opt_means.items(), key=lambda x: x[1])
        top_opt, top_val = sorted_opts[0]
        second_opt, second_val = sorted_opts[1]
        contrast = second_val - top_val
        answers[f"Q{q}"] = top_opt if contrast > 18 else (top_opt if top_val < 140 else None)

    # Right: Q11 to Q20
    for q in range(11, 21):
        y_c = int((q - 10 - 0.5) * row_h)
        opt_means = {}
        for opt_idx, opt in enumerate(options):
            x_c = opt_centers[opt_idx]
            patch = warped_right[y_c - 25 : y_c + 25, x_c - 25 : x_c + 25]
            opt_means[opt] = float(np.mean(patch))
        sorted_opts = sorted(opt_means.items(), key=lambda x: x[1])
        top_opt, top_val = sorted_opts[0]
        second_opt, second_val = sorted_opts[1]
        contrast = second_val - top_val
        answers[f"Q{q}"] = top_opt if contrast > 18 else (top_opt if top_val < 140 else None)

    print(f"\n=== Image {idx+1} Detected Answers ===")
    print(answers)
