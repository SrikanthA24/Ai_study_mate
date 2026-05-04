from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship
from app.db import Base

class Syllabus(Base):
    __tablename__ = "syllabus"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String)
    user_id = Column(Integer)

class Topic(Base):
    __tablename__ = "topics"

    id = Column(Integer, primary_key=True)
    name = Column(String)
    syllabus_id = Column(Integer, ForeignKey("syllabus.id"))