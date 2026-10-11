from datetime import datetime, timedelta, timezone

from fastapi import FastAPI, Depends, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from pydantic import BaseModel

from sqlalchemy import (
    create_engine,
    Column,
    Integer,
    String,
    Text,
    DateTime,
    text,
)

from sqlalchemy.orm import declarative_base, sessionmaker, Session

from passlib.context import CryptContext

import jwt
import os
import secrets
import httpx


# =========================================================
# 설정
# =========================================================

SECRET_KEY = os.getenv("PIGSTY_SECRET_KEY", "pigsty-dev-secret-key-change-this")

ALGORITHM = "HS256"

ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7

DATABASE_URL = "sqlite:///./pigsty.db"
ONEID_API_URL = os.getenv("ONEID_API_URL", "https://oneid-icvq.onrender.com").rstrip("/")


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

    is_admin = Column(
        Integer,
        default=0,
        nullable=False
    )


class OneIDLink(Base):
    __tablename__ = "oneid_links"
    id = Column(Integer, primary_key=True, index=True)
    oneid_user_id = Column(String(64), unique=True, nullable=False, index=True)
    user_id = Column(Integer, unique=True, nullable=False, index=True)


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


# =========================================================
# Database 생성
# =========================================================

Base.metadata.create_all(
    bind=engine
)
with engine.begin() as conn:
    try:
        conn.execute(text("ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0"))
    except Exception:
        pass
    try:
        conn.execute(text("ALTER TABLE users ADD COLUMN is_banned INTEGER NOT NULL DEFAULT 0"))
    except Exception:
        pass



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
        "http://127.0.0.1:5502",
        "http://localhost:5502",
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

    return pwd_context.hash(
        password
    )


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


def create_access_token(
    username: str
):

    expire = (
        datetime.now(timezone.utc)
        + timedelta(
            minutes=ACCESS_TOKEN_EXPIRE_MINUTES
        )
    )

    payload = {
        "sub": username,
        "mode": "oneid",
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

        if payload.get("mode") != "oneid":
            raise HTTPException(status_code=401, detail="ONEID로 다시 로그인해 주세요.")

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
# Admin 확인
# =========================================================

def get_admin_user(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    oneid_authorization: str | None = Header(default=None, alias="X-ONEID-Authorization"),
):
    link = db.query(OneIDLink).filter(OneIDLink.user_id == current_user.id).first()
    if link:
        oneid_user = verify_oneid_access_token(oneid_authorization)
        if str(oneid_user.get("id")) != link.oneid_user_id or not oneid_user.get("is_admin"):
            raise HTTPException(status_code=403, detail="ONEID 관리자 권한이 필요합니다.")
        return current_user
    raise HTTPException(status_code=403, detail="ONEID에 연결된 계정에 관리자 권한이 필요합니다.")


# =========================================================
# Schemas
# =========================================================

class OneIDCompleteRequest(BaseModel):
    legacy_username: str | None = None
    legacy_password: str | None = None
    create_new: bool = False


def verify_oneid_access_token(authorization: str | None) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="ONEID 로그인이 필요합니다.")
    if not ONEID_API_URL.startswith("https://") and not ONEID_API_URL.startswith(("http://127.0.0.1", "http://localhost", "http://[::1]")):
        raise HTTPException(status_code=500, detail="ONEID_API_URL은 HTTPS 주소여야 합니다.")
    try:
        response = httpx.get(f"{ONEID_API_URL}/api/auth/me", headers={"Authorization": authorization}, timeout=5, follow_redirects=False)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail="ONEID 계정을 확인할 수 없습니다.") from exc
    if response.is_redirect:
        raise HTTPException(status_code=502, detail="ONEID API가 예상하지 않은 리디렉션을 반환했습니다.")
    if response.status_code != 200:
        raise HTTPException(status_code=401, detail="ONEID 로그인이 만료되었습니다.")
    return response.json()

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
# Auth - Register
# =========================================================

@app.post(
    "/api/auth/register"
)
def register(
    request: RegisterRequest,
    db: Session = Depends(get_db)
):
    raise HTTPException(status_code=410, detail="ONEID 로그인으로 통합되었습니다.")

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
        password_hash=hash_password(
            password
        ),
        is_admin=0
    )


    db.add(user)

    db.commit()

    db.refresh(user)


    return {
        "message": "회원가입 성공",
        "username": user.username
    }


# =========================================================
# Auth - Login
# =========================================================

@app.post(
    "/api/auth/login"
)
def login(
    request: LoginRequest,
    db: Session = Depends(get_db)
):
    raise HTTPException(status_code=410, detail="ONEID 로그인으로 통합되었습니다.")

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


# =========================================================
# Auth - Me
# =========================================================

@app.post("/api/auth/oneid/complete")
def complete_oneid_login(
    request: OneIDCompleteRequest = OneIDCompleteRequest(),
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    oneid_user = verify_oneid_access_token(authorization)
    oneid_user_id = str(oneid_user.get("id") or "")
    nickname = str(oneid_user.get("nickname") or "").strip()
    if not oneid_user_id or not nickname:
        raise HTTPException(status_code=400, detail="ONEID 계정 정보를 확인할 수 없습니다.")

    link = db.query(OneIDLink).filter(OneIDLink.oneid_user_id == oneid_user_id).first()
    user = None
    if link:
        user = db.query(User).filter(User.id == link.user_id).first()

    # 기존 계정 명시적 연결 요청인 경우
    if not user and request.legacy_username and request.legacy_password:
        user = db.query(User).filter(User.username == request.legacy_username.strip()).first()
        if not user or not verify_password(request.legacy_password, user.password_hash):
            raise HTTPException(status_code=401, detail="기존 PIGSTY 아이디 또는 비밀번호가 올바르지 않습니다.")
        old_username = user.username
        user.username = nickname
        db.query(Post).filter(Post.author == old_username).update({Post.author: nickname}, synchronize_session=False)
        db.add(OneIDLink(oneid_user_id=oneid_user_id, user_id=user.id))

    # 아직 연결되지 않은 경우: FAKEPRESS처럼 자동 매핑 또는 자동 생성 (원클릭 SSO)
    if not user:
        existing_user = db.query(User).filter(User.username == nickname).first()
        if existing_user and not db.query(OneIDLink).filter(OneIDLink.user_id == existing_user.id).first():
            user = existing_user
            db.add(OneIDLink(oneid_user_id=oneid_user_id, user_id=user.id))
        else:
            candidate = nickname[:30]
            while db.query(User).filter(User.username == candidate).first():
                suffix = "_" + secrets.token_hex(3)
                candidate = nickname[:30 - len(suffix)] + suffix

            user = User(
                username=candidate,
                password_hash=hash_password(secrets.token_urlsafe(48)),
                is_admin=1 if oneid_user.get("is_admin") else 0,
                is_banned=0,
            )
            db.add(user)
            db.flush()
            db.add(OneIDLink(oneid_user_id=oneid_user_id, user_id=user.id))

    user.is_admin = 1 if oneid_user.get("is_admin") else 0
    db.commit()
    db.refresh(user)
    return {"access_token": create_access_token(user.username), "token_type": "bearer", "user": {"id": user.id, "username": user.username, "is_admin": user.is_admin}}

@app.get(
    "/api/auth/me"
)
def me(
    current_user: User = Depends(get_current_user)
):

    return {
        "id": current_user.id,
        "username": current_user.username,
        "is_admin": current_user.is_admin
    }


# =========================================================
# 임시 관리자 지정
# =========================================================

@app.post(
    "/api/admin/make-admin/{username}"
)
def make_admin(
    username: str,
    db: Session = Depends(get_db)
):
    raise HTTPException(status_code=410, detail="전체 관리자 권한은 ONEID에서 관리합니다.")

    user = db.query(User).filter(
        User.username == username
    ).first()


    if not user:

        raise HTTPException(
            status_code=404,
            detail="사용자를 찾을 수 없습니다."
        )


    user.is_admin = 1

    db.commit()

    db.refresh(user)


    return {
        "message": "관리자로 지정되었습니다.",
        "username": user.username,
        "is_admin": user.is_admin
    }


# =========================================================
# Posts - Get
# =========================================================

@app.get(
    "/api/posts"
)
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
            "created_at":
                post.created_at.isoformat()
                if post.created_at
                else None,
        }

        for post in posts

    ]


# =========================================================
# Posts - Create
# =========================================================

@app.post(
    "/api/posts"
)
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
        "created_at":
            post.created_at.isoformat()
    }


# =========================================================
# Posts - Delete
# =========================================================

@app.delete(
    "/api/posts/{post_id}"
)
def delete_post(
    post_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    if current_user.is_admin != 1:

        raise HTTPException(
            status_code=403,
            detail="관리자만 게시글을 삭제할 수 있습니다."
        )


    post = db.query(Post).filter(
        Post.id == post_id
    ).first()


    if not post:

        raise HTTPException(
            status_code=404,
            detail="게시물을 찾을 수 없습니다."
        )


    db.delete(post)

    db.commit()


    return {
        "message": "게시글이 삭제되었습니다."
    }


# =========================================================
# Likes
# =========================================================

@app.post(
    "/api/posts/{post_id}/like"
)
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


# =========================================================
# Admin - Delete All Posts
# =========================================================

@app.delete(
    "/api/admin/posts"
)
def delete_all_posts(
    current_admin: User =
        Depends(get_admin_user),

    db: Session =
        Depends(get_db)
):

    posts = db.query(Post).all()

    for post in posts:
        db.delete(post)

    db.commit()

    return {
        "message": "모든 게시물이 삭제되었습니다.",
        "deleted_count": len(posts)
    }