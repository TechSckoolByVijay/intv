from fastapi import FastAPI
from .database import engine
from .models import Base
from .auth import router as auth_router
from .interview import router as interview_router
from .logger import logger

Base.metadata.create_all(bind=engine)

app = FastAPI()

app.include_router(auth_router, prefix="/auth", tags=["auth"])
app.include_router(interview_router, prefix="/interview", tags=["interview"])

@app.get("/")
def read_root():
    return {"message": "Welcome to the AI Interviewer API"}