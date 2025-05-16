from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from . import models, schemas
from .database import SessionLocal
from .logger import logger

router = APIRouter()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.post("/signup", response_model=schemas.UserCreate)
def signup(user: schemas.UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.username == user.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    
    hashed_password = user.password  # Assuming password is already hashed
    new_user = models.User(
        username=user.username,
        password=hashed_password,
        user_type=user.user_type,
        jd_path="",
        resume_path=""
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    logger.info(f"User created: {new_user.username}")
    return new_user

@router.post("/login")
def login(user: schemas.UserLogin, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.username == user.username).first()
    if not db_user or db_user.password != user.password:
        logger.warning(f"Failed login attempt for user: {user.username}")
        raise HTTPException(status_code=400, detail="Invalid credentials")
    
    logger.info(f"User logged in: {db_user.username}")
    user_data = {
        "id": db_user.id,
        "username": db_user.username,
        "user_type": db_user.user_type,
        "jd_path": db_user.jd_path or "",
        "resume_path": db_user.resume_path or ""
    }
    return {"message": "Login successful", "user_data": user_data}

@router.post("/interview")
def create_interview(interview: schemas.InterviewCreate, db: Session = Depends(get_db)):
    db_interview = models.Interview(interview_name=interview.interview_name)
    db.add(db_interview)
    db.commit()
    db.refresh(db_interview)
    logger.info(f"Interview created: {db_interview.interview_name}")
    return db_interview