from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from . import models, schemas
from .database import SessionLocal
from typing import List
from .logger import logger
import os

router = APIRouter()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Dummy questions for demonstration
QUESTION_BANK = [
    {"question_id": 1, "question_text": "Tell me about yourself."},
    {"question_id": 2, "question_text": "What are your strengths?"},
    {"question_id": 3, "question_text": "Describe a challenge you faced."},
]

@router.post("/interview")
def create_interview(interview: schemas.InterviewCreate, db: Session = Depends(get_db)):
    db_interview = models.Interview(interview_name=interview.interview_name)
    db.add(db_interview)
    db.commit()
    db.refresh(db_interview)
    return db_interview

@router.post("/start_interview", response_model=List[schemas.QuestionAnswerOut])
def start_interview(payload: schemas.QuestionAnswerCreate, db: Session = Depends(get_db)):
    # Pick 3 new questions (could be random or sequential)
    selected_questions = QUESTION_BANK[:3]
    created = []
    for q in selected_questions:
        qa = models.QuestionAnswer(
            user_id=payload.user_id,
            interview_id=payload.interview_id,
            question_id=q["question_id"],
            question_text=q["question_text"],
            status="NEW"
        )
        db.add(qa)
        db.commit()
        db.refresh(qa)
        created.append(qa)
        logger.info(f"Inserted question {q['question_id']} for user {payload.user_id} interview {payload.interview_id}")
    return created

@router.get("/questions/{user_id}/{interview_id}", response_model=List[schemas.QuestionAnswerOut])
def get_questions(user_id: int, interview_id: int, db: Session = Depends(get_db)):
    questions = db.query(models.QuestionAnswer).filter_by(user_id=user_id, interview_id=interview_id).all()
    return questions

@router.patch("/question/{qa_id}", response_model=schemas.QuestionAnswerOut)
def update_question_answer(qa_id: int, update: schemas.QuestionAnswerUpdate, db: Session = Depends(get_db)):
    qa = db.query(models.QuestionAnswer).filter_by(id=qa_id).first()
    if not qa:
        raise HTTPException(status_code=404, detail="QuestionAnswer not found")
    for field, value in update.dict(exclude_unset=True).items():
        setattr(qa, field, value)
    db.commit()
    db.refresh(qa)
    logger.info(f"Updated QuestionAnswer {qa_id} with {update.dict(exclude_unset=True)}")
    return qa

@router.post("/more_questions", response_model=List[schemas.QuestionAnswerOut])
def more_questions(payload: schemas.QuestionAnswerCreate, db: Session = Depends(get_db)):
    # Find how many questions already assigned
    existing_qids = {qa.question_id for qa in db.query(models.QuestionAnswer).filter_by(user_id=payload.user_id, interview_id=payload.interview_id)}
    # Pick next 3 not already assigned
    new_questions = [q for q in QUESTION_BANK if q["question_id"] not in existing_qids][:3]
    created = []
    for q in new_questions:
        qa = models.QuestionAnswer(
            user_id=payload.user_id,
            interview_id=payload.interview_id,
            question_id=q["question_id"],
            question_text=q["question_text"],
            status="NEW"
        )
        db.add(qa)
        db.commit()
        db.refresh(qa)
        created.append(qa)
        logger.info(f"Inserted more question {q['question_id']} for user {payload.user_id} interview {payload.interview_id}")
    return created

@router.post("/upload_answer/{user_id}/{interview_id}/{question_id}")
def upload_answer_recording(
    user_id: int,
    interview_id: int,
    question_id: int,
    file: UploadFile = File(...)
):
    upload_dir = f"uploads/{user_id}/{interview_id}"
    os.makedirs(upload_dir, exist_ok=True)
    file_path = f"{upload_dir}/{question_id}_{file.filename}"
    with open(file_path, "wb") as buffer:
        buffer.write(file.file.read())
    logger.info(f"Saved answer recording at {os.path.abspath(file_path)}")
    return {"path": file_path}

@router.post("/upload_answer/{user_id}/{interview_id}/{question_id}/{recording_type}")
def upload_answer_recording(
    user_id: int,
    interview_id: int,
    question_id: int,
    recording_type: str,  # e.g., "audio", "camera", "screen", "combined"
    file: UploadFile = File(...)
):
    allowed_types = {"audio", "camera", "screen", "combined"}
    if recording_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Invalid recording type")
    upload_dir = f"uploads/{user_id}/{interview_id}"
    os.makedirs(upload_dir, exist_ok=True)
    file_path = f"{upload_dir}/{question_id}_{recording_type}_{file.filename}"
    with open(file_path, "wb") as buffer:
        buffer.write(file.file.read())
    logger.info(f"Saved {recording_type} recording at {os.path.abspath(file_path)}")
    return {"path": file_path}