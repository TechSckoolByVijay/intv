from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import engine
from app.models import Base
from app.auth import router as auth_router
from app.interview import router as interview_router
from . import interview, jd_resume, performance
import logging

# Create the database tables
Base.metadata.create_all(bind=engine)

# Initialize FastAPI app
app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # or ["*"] for all origins (not recommended for production)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers for authentication and interview management
app.include_router(auth_router)
app.include_router(interview_router)
app.include_router(interview.router, prefix="/api/interview", tags=["Interview"])
app.include_router(jd_resume.router, prefix="/api/files", tags=["JobDescription & Resume"])
app.include_router(performance.router, prefix="/api/performance", tags=["Performance"])

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@app.get("/")
def read_root():
    return {"message": "Welcome to the AI Interviewer API"}