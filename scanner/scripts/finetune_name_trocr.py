"""
TrOCR Fine-Tuning Script for Handwritten Student Names
=====================================================
Fine-tunes 'microsoft/trocr-base-handwritten' on verified handwritten student name crops.
Designed for production domain adaptation once 100-300 verified name crops are collected
using the ScanReview interface.

Usage:
------
1. Prepare dataset in 'data/names_dataset.json' with format:
   [
     {"image_path": "crops/name_001.jpg", "text": "Aditya Virendra Singh"},
     {"image_path": "crops/name_002.jpg", "text": "Aniket A. Mall"},
     ...
   ]

2. Run fine-tuning:
   python scanner/scripts/finetune_name_trocr.py --data_path data/names_dataset.json --output_dir models/trocr_custom_names --epochs 10 --batch_size 4
"""

import os
import sys
import json
import argparse
from typing import Dict, Any, List
import cv2
import numpy as np
from PIL import Image
import torch
from torch.utils.data import Dataset
from transformers import (
    TrOCRProcessor,
    VisionEncoderDecoderModel,
    Seq2SeqTrainer,
    Seq2SeqTrainingArguments,
    default_data_collator,
)


class HandwrittenNameDataset(Dataset):
    """
    PyTorch Dataset for handwritten student name crops with TrOCR preprocessing.
    """
    def __init__(self, samples: List[Dict[str, str]], processor: TrOCRProcessor, max_target_length: int = 32):
        self.samples = samples
        self.processor = processor
        self.max_target_length = max_target_length

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, idx: int) -> Dict[str, torch.Tensor]:
        item = self.samples[idx]
        img_path = item["image_path"]
        text = item["text"]

        image = cv2.imread(img_path)
        if image is None:
            # Fallback for missing images
            image = np.ones((60, 240, 3), dtype=np.uint8) * 255

        # Standard margin padding for TrOCR line-level recognition
        padded = cv2.copyMakeBorder(image, 12, 12, 16, 16, cv2.BORDER_CONSTANT, value=[255, 255, 255])
        rgb = cv2.cvtColor(padded, cv2.COLOR_BGR2RGB)
        pil_img = Image.fromarray(rgb)

        pixel_values = self.processor(pil_img, return_tensors="pt").pixel_values.squeeze(0)
        labels = self.processor.tokenizer(
            text,
            padding="max_length",
            max_length=self.max_target_length,
            truncation=True,
            return_tensors="pt",
        ).input_ids.squeeze(0)

        # Replace padding token id's with -100 so they are ignored by PyTorch CrossEntropyLoss
        labels[labels == self.processor.tokenizer.pad_token_id] = -100

        return {"pixel_values": pixel_values, "labels": labels}


def compute_cer(predictions: List[str], references: List[str]) -> float:
    """Computes Character Error Rate (CER) using Levenshtein distance."""
    total_dist = 0
    total_len = 0
    for pred, ref in zip(predictions, references):
        m, n = len(ref), len(pred)
        dp = [[0] * (n + 1) for _ in range(m + 1)]
        for i in range(m + 1):
            dp[i][0] = i
        for j in range(n + 1):
            dp[0][j] = j
        for i in range(1, m + 1):
            for j in range(1, n + 1):
                if ref[i - 1].lower() == pred[j - 1].lower():
                    dp[i][j] = dp[i - 1][j - 1]
                else:
                    dp[i][j] = 1 + min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
        total_dist += dp[m][n]
        total_len += max(m, 1)
    return (total_dist / max(total_len, 1)) * 100.0


def main():
    parser = argparse.ArgumentParser(description="Fine-tune TrOCR-base on handwritten student names")
    parser.add_argument("--data_path", type=str, default="data/names_dataset.json", help="Path to JSON dataset manifest")
    parser.add_argument("--base_model", type=str, default="microsoft/trocr-base-handwritten", help="Base pretrained TrOCR model")
    parser.add_argument("--output_dir", type=str, default="models/trocr_custom_names", help="Output directory for saved weights")
    parser.add_argument("--epochs", type=int, default=10, help="Number of training epochs")
    parser.add_argument("--batch_size", type=int, default=4, help="Batch size per device")
    parser.add_argument("--learning_rate", type=float, default=5e-5, help="Learning rate")
    args = parser.parse_args()

    if not os.path.exists(args.data_path):
        print(f"Dataset manifest '{args.data_path}' not found.")
        print("Template dataset format:")
        print('[{"image_path": "path/to/crop.jpg", "text": "Student Name"}]')
        sys.exit(1)

    with open(args.data_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    # 85/15 train/val split
    np.random.seed(42)
    np.random.shuffle(data)
    split_idx = int(len(data) * 0.85)
    train_data = data[:split_idx]
    val_data = data[split_idx:]

    print(f"Loaded {len(data)} total samples: {len(train_data)} train, {len(val_data)} validation.")

    processor = TrOCRProcessor.from_pretrained(args.base_model)
    model = VisionEncoderDecoderModel.from_pretrained(args.base_model)

    # Configure generation parameters
    model.config.decoder_start_token_id = processor.tokenizer.cls_token_id
    model.config.pad_token_id = processor.tokenizer.pad_token_id
    model.config.vocab_size = model.config.decoder.vocab_size

    train_dataset = HandwrittenNameDataset(train_data, processor)
    val_dataset = HandwrittenNameDataset(val_data, processor)

    training_args = Seq2SeqTrainingArguments(
        output_dir=args.output_dir,
        predict_with_generate=True,
        evaluation_strategy="epoch",
        save_strategy="epoch",
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=args.batch_size,
        learning_rate=args.learning_rate,
        weight_decay=0.01,
        num_train_epochs=args.epochs,
        warmup_ratio=0.1,
        logging_dir=os.path.join(args.output_dir, "logs"),
        logging_steps=10,
        save_total_limit=2,
        load_best_model_at_end=True,
        fp16=torch.cuda.is_available(),
        dataloader_num_workers=0,
    )

    def compute_metrics(eval_pred):
        pred_ids = eval_pred.predictions
        label_ids = eval_pred.label_ids
        pred_str = processor.batch_decode(pred_ids, skip_special_tokens=True)
        label_ids[label_ids == -100] = processor.tokenizer.pad_token_id
        label_str = processor.batch_decode(label_ids, skip_special_tokens=True)
        cer = compute_cer(pred_str, label_str)
        return {"cer": cer}

    trainer = Seq2SeqTrainer(
        model=model,
        args=training_args,
        compute_metrics=compute_metrics,
        train_dataset=train_dataset,
        eval_dataset=val_dataset,
        data_collator=default_data_collator,
        tokenizer=processor.feature_extractor,
    )

    print("Starting fine-tuning...")
    trainer.train()

    print(f"Saving fine-tuned model checkpoint to {args.output_dir}...")
    trainer.save_model(args.output_dir)
    processor.save_pretrained(args.output_dir)
    print("Fine-tuning complete!")


if __name__ == '__main__':
    main()
