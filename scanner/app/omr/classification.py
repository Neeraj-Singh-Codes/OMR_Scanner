"""
OMR Answer Classification Engine.
Evaluates multi-factor bubble metrics against configurable thresholds,
distinguishing confident fills, blank questions, multiple marks,
light shading, and erasures, enforcing strict uncertainty flags.
"""

from typing import Dict, Any, List, Optional, Tuple


class BubbleClassifier:
    def __init__(
        self,
        blank_threshold: float = 0.16,
        filled_threshold: float = 0.40,
        light_threshold: float = 0.24,
        ambiguous_delta: float = 0.12,
        erasure_clearance_delta: float = 0.25,
    ):
        self.blank_threshold = blank_threshold
        self.filled_threshold = filled_threshold
        self.light_threshold = light_threshold
        self.ambiguous_delta = ambiguous_delta
        self.erasure_clearance_delta = erasure_clearance_delta

    def classify_question(self, question_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Classifies a single question's responses.
        Returns:
            {
                "question_number": int,
                "selected_option": Optional[str],
                "status": "CONFIDENT" | "BLANK" | "MULTIPLE_MARKED" | "AMBIGUOUS",
                "review_required": bool,
                "confidence": float,
                "reason": str,
                "options": Dict[str, Dict[str, Any]]
            }
        """
        q_num = question_data["question_number"]
        options = question_data["options"]

        # Sort options descending by composite score
        sorted_opts = sorted(
            options.items(),
            key=lambda item: item[1]["composite_score"],
            reverse=True
        )

        top1_opt, top1_data = sorted_opts[0]
        top2_opt, top2_data = sorted_opts[1]
        top3_opt, top3_data = sorted_opts[2]
        top4_opt, top4_data = sorted_opts[3]

        s1 = top1_data["composite_score"]
        s2 = top2_data["composite_score"]
        delta = s1 - s2

        # Build options metadata with boolean marked flag
        options_result = {}
        for opt, data in options.items():
            is_marked = data["composite_score"] >= self.blank_threshold
            options_result[opt] = {
                "fill_ratio": data["fill_ratio"],
                "relative_darkness": data["relative_darkness"],
                "composite_score": data["composite_score"],
                "is_marked": is_marked,
            }

        # Case 1: ALL options are blank (top score below blank threshold)
        if s1 < self.blank_threshold:
            return {
                "question_number": q_num,
                "selected_option": None,
                "status": "BLANK",
                "review_required": False,
                "confidence": round(max(0.5, 1.0 - s1), 2),
                "reason": "No bubbles marked.",
                "options": options_result,
            }

        # Case 2: Multiple answers marked (both top1 and top2 exceed filled threshold)
        if s1 >= self.filled_threshold and s2 >= self.filled_threshold:
            marked_list = [opt for opt, d in options.items() if d["composite_score"] >= self.filled_threshold]
            return {
                "question_number": q_num,
                "selected_option": None,
                "marked_options": marked_list,
                "status": "MULTIPLE_MARKED",
                "review_required": True,
                "confidence": 0.0,
                "reason": f"Multiple bubbles clearly filled: {', '.join(marked_list)}.",
                "options": options_result,
            }

        # Case 3: Top answer is clearly filled (s1 >= filled_threshold)
        if s1 >= self.filled_threshold:
            if s2 < self.blank_threshold and delta >= self.ambiguous_delta:
                # High-confidence clean fill
                confidence = round(min(0.99, max(0.80, s1 - s2 + 0.4)), 2)
                return {
                    "question_number": q_num,
                    "selected_option": top1_opt,
                    "status": "CONFIDENT",
                    "review_required": False,
                    "confidence": confidence,
                    "reason": f"Clearly filled bubble {top1_opt}.",
                    "options": options_result,
                }
            elif delta >= self.erasure_clearance_delta:
                # Top answer is solid, second is a light erasure smudge well below top answer
                confidence = round(min(0.92, max(0.70, delta)), 2)
                return {
                    "question_number": q_num,
                    "selected_option": top1_opt,
                    "status": "CONFIDENT",
                    "review_required": False,
                    "confidence": confidence,
                    "reason": f"Filled bubble {top1_opt} (faint mark on {top2_opt} identified as erasure).",
                    "options": options_result,
                }
            else:
                # Top answer filled, but second answer is close enough to cause ambiguity
                return {
                    "question_number": q_num,
                    "selected_option": top1_opt,
                    "status": "AMBIGUOUS",
                    "review_required": True,
                    "confidence": round(max(0.2, delta), 2),
                    "reason": f"Ambiguous between {top1_opt} ({s1:.2f}) and {top2_opt} ({s2:.2f}).",
                    "options": options_result,
                }

        # Case 4: Lightly shaded or ambiguous mark (s1 >= blank_threshold but < filled_threshold)
        # Any mark above blank threshold that is not confidently filled MUST require review
        return {
            "question_number": q_num,
            "selected_option": top1_opt,
            "status": "AMBIGUOUS",
            "review_required": True,
            "confidence": round(max(0.2, s1), 2),
            "reason": f"Bubble {top1_opt} is lightly shaded or uncertain ({s1:.2f}) and requires manual verification.",
            "options": options_result,
        }

    def classify_all(self, measured_questions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Classifies all 30 questions."""
        return [self.classify_question(q) for q in measured_questions]
