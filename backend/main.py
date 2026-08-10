from datetime import datetime, timedelta, timezone
import os

from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from pydantic import BaseModel
from sqlalchemy import create_engine, Column, Integer, String, Text, DateTime
from sqlalchemy.orm import declarative_base, sessionmaker, Session

from passlib.context import CryptContext
import jwt


# =========================================================
# 설정
# =========================================================

SECRET_KEY = os.getenv(
    "SECRET_KEY",
    "pigsty-dev-secret-key-change-this"
)

ALGORITHM = "HS256"

ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7

DATABASE_URL = "sqlite:///./pigsty.db"


# =========================================================
# Database
# =========================================================

engine = create_engine(
    DATABASE_URL,
    connect_args={
        "check_same_thread": False
    },
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)

Base = declarative_base()


def get_db():
    db = SessionLocal()

    try:
        yield db
    finally:
        db.close()


# =========================================================
# Models
# =========================================================

class User(Base):
    __tablename__ = "users"

    id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    username = Column(
        String(50),
        unique=True,
        nullable=False,
        index=True
    )

    password_hash = Column(
        String(255),
        nullable=False
    )


class Post(Base):
    __tablename__ = "posts"

    id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    title = Column(
        String(200),
        nullable=False
    )

    content = Column(
        Text,
        nullable=False
    )

    tags = Column(
        String(500),
        default=""
    )

    author = Column(
        String(50),
        nullable=False
    )

    likes = Column(
        Integer,
        default=0
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow
    )


Base.metadata.create_all(bind=engine)


# =========================================================
# FastAPI
# =========================================================

app = FastAPI(
    title="PIGSTY API"
)


# =========================================================
# CORS
# =========================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5500",
        "http://localhost:5500",
        "https://pigsty.onrender.com",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================================================
# Password
# =========================================================

pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto"
)


def hash_password(password: str):
    return pwd_context.hash(password)


def verify_password(
    password: str,
    password_hash: str
):
    return pwd_context.verify(
        password,
        password_hash
    )


# =========================================================
# JWT
# =========================================================

security = HTTPBearer()


def create_access_token(username: str):

    expire = (
        datetime.now(timezone.utc)
        + timedelta(
            minutes=ACCESS_TOKEN_EXPIRE_MINUTES
        )
    )

    payload = {
        "sub": username,
        "exp": expire,
    }

    return jwt.encode(
        payload,
        SECRET_KEY,
        algorithm=ALGORITHM
    )


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):

    token = credentials.credentials

    try:
        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM]
        )

        username = payload.get("sub")

        if not username:
            raise HTTPException(
                status_code=401,
                detail="Invalid token"
            )

    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=401,
            detail="Token expired"
        )

    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=401,
            detail="Invalid token"
        )

    user = db.query(User).filter(
        User.username == username
    ).first()

    if not user:
        raise HTTPException(
            status_code=401,
            detail="User not found"
        )

    return user


# =========================================================
# Schemas
# =========================================================

class RegisterRequest(BaseModel):
    username: str
    password: str


class LoginRequest(BaseModel):
    username: str
    password: str


class PostCreate(BaseModel):
    title: str
    content: str
    tags: str = ""


# =========================================================
# Basic
# =========================================================

@app.get("/")
def root():
    return {
        "message": "PIGSTY API is running"
    }


# =========================================================
# Auth
# =========================================================

@app.post("/api/auth/register")
def register(
    request: RegisterRequest,
    db: Session = Depends(get_db)
):

    username = request.username.strip()
    password = request.password

    if len(username) < 2:
        raise HTTPException(
            status_code=400,
            detail="사용자 이름은 2자 이상이어야 합니다."
        )

    if len(password) < 4:
        raise HTTPException(
            status_code=400,
            detail="비밀번호는 4자 이상이어야 합니다."
        )

    existing = db.query(User).filter(
        User.username == username
    ).first()

    if existing:
        raise HTTPException(
            status_code=400,
            detail="이미 존재하는 사용자 이름입니다."
        )

    user = User(
        username=username,
        password_hash=hash_password(password)
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    return {
        "message": "회원가입 성공",
        "username": user.username
    }


@app.post("/api/auth/login")
def login(
    request: LoginRequest,
    db: Session = Depends(get_db)
):

    user = db.query(User).filter(
        User.username == request.username
    ).first()

    if not user:
        raise HTTPException(
            status_code=401,
            detail="아이디 또는 비밀번호가 올바르지 않습니다."
        )

    if not verify_password(
        request.password,
        user.password_hash
    ):
        raise HTTPException(
            status_code=401,
            detail="아이디 또는 비밀번호가 올바르지 않습니다."
        )

    token = create_access_token(
        user.username
    )

    return {
        "access_token": token,
        "token_type": "bearer"
    }


@app.get("/api/auth/me")
def me(
    current_user: User = Depends(get_current_user)
):

    return {
        "id": current_user.id,
        "username": current_user.username
    }


# =========================================================
# Posts
# =========================================================

@app.get("/api/posts")
def get_posts(
    db: Session = Depends(get_db)
):

    posts = db.query(Post).order_by(
        Post.created_at.desc()
    ).all()

    return [
        {
            "id": post.id,
            "title": post.title,
            "content": post.content,
            "tags": post.tags or "",
            "author": post.author,
            "likes": post.likes or 0,
            "created_at": (
                post.created_at.isoformat()
                if post.created_at
                else None
            ),
        }
        for post in posts
    ]


@app.post("/api/posts")
def create_post(
    request: PostCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    title = request.title.strip()
    content = request.content.strip()
    tags = request.tags.strip()

    if not title:
        raise HTTPException(
            status_code=400,
            detail="제목을 입력해주세요."
        )

    if not content:
        raise HTTPException(
            status_code=400,
            detail="내용을 입력해주세요."
        )

    post = Post(
        title=title,
        content=content,
        tags=tags,
        author=current_user.username,
        likes=0
    )

    db.add(post)
    db.commit()
    db.refresh(post)

    return {
        "id": post.id,
        "title": post.title,
        "content": post.content,
        "tags": post.tags,
        "author": post.author,
        "likes": post.likes,
        "created_at": post.created_at.isoformat()
    }


# =========================================================
# Likes
# =========================================================

@app.post("/api/posts/{post_id}/like")
def like_post(
    post_id: int,
    db: Session = Depends(get_db)
):

    post = db.query(Post).filter(
        Post.id == post_id
    ).first()

    if not post:
        raise HTTPException(
            status_code=404,
            detail="게시물을 찾을 수 없습니다."
        )

    post.likes = (
        post.likes or 0
    ) + 1

    db.commit()
    db.refresh(post)

    return {
        "id": post.id,
        "likes": post.likes
    }