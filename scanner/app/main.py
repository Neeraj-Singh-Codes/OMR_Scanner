"""
FastAPI Entry Point for the OMR Computer Vision Service.
"""

import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from scanner.app.routes.scan import router as scan_router

app = FastAPI(
    title="OMR Computer Vision Microservice",
    version="1.0.0",
    description="Dedicated OpenCV image-processing microservice for standardized OMR sheet detection, perspective correction, and bubble recognition.",
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Internal service, open to Express backend and dev tools
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(scan_router)


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("OMR_VISION_PORT", 8000))
    uvicorn.run("scanner.app.main:app", host="0.0.0.0", port=port, reload=False)
