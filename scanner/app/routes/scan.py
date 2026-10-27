"""
FastAPI Routes for OMR Scanning and Template Management.
"""

import io
import tempfile
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, File, UploadFile, Query, HTTPException, status
from fastapi.responses import JSONResponse, FileResponse

from scanner.app.services.omr_processor import OMRProcessor
from scanner.app.services.pdf_generator import OMRSheetGenerator
from scanner.app.services.template_config import load_template_config
from scanner.app.omr.preprocessing import PreprocessingError
from scanner.app.omr.marker_detection import MarkerDetectionError

router = APIRouter(prefix="", tags=["OMR Scanning"])

processor = OMRProcessor()
pdf_generator = OMRSheetGenerator()


@router.get("/health")
def health_check():
    """Health check endpoint for internal service orchestration."""
    return {
        "status": "healthy",
        "service": "omr-vision-service",
        "template_version": processor.config.get("template_version", "OMR-V1.0"),
        "version": "1.0.0",
    }


@router.get("/template")
def get_template():
    """Returns the standardized geometric template configuration."""
    return load_template_config()


@router.get("/template/pdf")
def download_template_pdf(
    exam_id: str = Query("EXAM-2026-001", description="Unique Exam Identifier"),
    exam_title: str = Query("Standard Assessment Examination", description="Exam Title"),
    subject: str = Query("General Science", description="Subject Name"),
    class_name: str = Query("Grade 10", description="Class or Section"),
    exam_date: str = Query("2026-10-27", description="Date of Exam"),
    template_type: Optional[str] = Query(None, description="Template format: STANDARD_30Q or SCHOOL_25Q"),
    total_questions: Optional[int] = Query(None, description="Total questions for automatic template selection"),
):
    """Generates and serves a printable A4 OMR PDF with specific exam metadata."""
    temp_dir = Path(tempfile.gettempdir()) / "omr_templates"
    temp_dir.mkdir(parents=True, exist_ok=True)
    pdf_path = temp_dir / f"omr_sheet_{exam_id}.pdf"

    use_school_25q = False
    if template_type:
        use_school_25q = ("25" in template_type or "SCHOOL" in template_type.upper())
    elif total_questions is not None and total_questions <= 25:
        use_school_25q = True

    if use_school_25q:
        pdf_generator.generate_school_25q(
            output_path=str(pdf_path),
            exam_id=exam_id,
            exam_title=exam_title,
            subject=subject,
            class_name=class_name,
            exam_date=exam_date,
        )
    else:
        pdf_generator.generate(
            output_path=str(pdf_path),
            exam_id=exam_id,
            exam_title=exam_title,
            subject=subject,
            class_name=class_name,
            exam_date=exam_date,
        )

    return FileResponse(
        path=str(pdf_path),
        filename=f"omr_sheet_{exam_id}.pdf",
        media_type="application/pdf",
    )


@router.post("/scan")
async def scan_omr_sheet(
    file: UploadFile = File(..., description="Uploaded photograph or camera capture"),
    return_annotated: bool = Query(True, description="Whether to include base64 annotated image"),
    check_blur: bool = Query(True, description="Whether to reject blurry images"),
):
    """
    Scans an uploaded OMR sheet image, locates corner alignment markers,
    corrects perspective, measures bubble fill ratios, and returns detected answers.
    """
    allowed_content_types = ["image/jpeg", "image/png", "image/webp", "image/bmp"]
    if file.content_type and file.content_type.lower() not in allowed_content_types:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported file type '{file.content_type}'. Must be JPEG or PNG.",
        )

    try:
        contents = await file.read()
        result = processor.process_image(
            image_input=contents,
            generate_annotated=return_annotated,
            check_blur=check_blur,
        )
        return JSONResponse(status_code=status.HTTP_200_OK, content=result)

    except (MarkerDetectionError, PreprocessingError) as cv_err:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "success": False,
                "error_code": cv_err.code,
                "message": cv_err.message,
                "details": cv_err.details,
            },
        )
    except Exception as e:
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "success": False,
                "error_code": "INTERNAL_SCAN_ERROR",
                "message": f"An unexpected error occurred during scan processing: {str(e)}",
            },
        )
