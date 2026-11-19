from datetime import datetime, timedelta, timezone

from fastapi import FastAPI, Depends, HTTPException, Header, Request, BackgroundTasks
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
    ForeignKey,
    func,
    text,
)

from sqlalchemy.orm import declarative_base, sessionmaker, Session

from passlib.context import CryptContext

import jwt
import os
import re
import secrets
import signal
import threading
import httpx
from censor import inspect_content


# =========================================================
# 설정
# =========================================================

SECRET_KEY = os.getenv("PIGSTY_SECRET_KEY", "pigsty-dev-secret-key-change-this")

ALGORITHM = "HS256"

ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./pigsty.db")
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
ONEID_API_URL = os.getenv("ONEID_API_URL", "https://oneid-ruddy.vercel.app").rstrip("/")


# =========================================================
# Database
# =========================================================

if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},
    )
else:
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,
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

    is_banned = Column(
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

    status = Column(
        String(20),
        default="active",
        nullable=False
    )

    censored_reason = Column(
        String(200),
        nullable=True
    )

    censored_at = Column(
        DateTime,
        nullable=True
    )

    gallery_slug = Column(
        String(60),
        default="free",
        nullable=False,
        index=True
    )

    views = Column(
        Integer,
        default=0,
        nullable=False
    )

    is_fixed = Column(
        Integer,
        default=1,
        nullable=False
    )

    ip_prefix = Column(
        String(40),
        default="",
        nullable=False
    )

    guest_password_hash = Column(
        String(255),
        nullable=True
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow
    )


class Gallery(Base):

    __tablename__ = "galleries"

    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String(60), unique=True, nullable=False, index=True)
    name = Column(String(80), nullable=False)
    description = Column(String(200), default="", nullable=False)
    category = Column(String(40), default="메이저", nullable=False)
    creator = Column(String(50), default="system", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class Comment(Base):

    __tablename__ = "comments"

    id = Column(Integer, primary_key=True, index=True)
    post_id = Column(Integer, ForeignKey("posts.id", ondelete="CASCADE"), nullable=False, index=True)
    author = Column(String(50), nullable=False)
    content = Column(Text, nullable=False)
    is_fixed = Column(Integer, default=1, nullable=False)
    ip_prefix = Column(String(40), default="", nullable=False)
    guest_password_hash = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


# =========================================================
# Database 생성 및 기존 게시물 소급 검열 (Backfill)
# =========================================================

Base.metadata.create_all(
    bind=engine
)
for _stmt in (
    "ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE users ADD COLUMN is_banned INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE posts ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'active'",
    "ALTER TABLE posts ADD COLUMN censored_reason VARCHAR(200)",
    "ALTER TABLE posts ADD COLUMN censored_at TIMESTAMP",
    "ALTER TABLE posts ADD COLUMN gallery_slug VARCHAR(60) NOT NULL DEFAULT 'free'",
    "ALTER TABLE posts ADD COLUMN views INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE posts ADD COLUMN is_fixed INTEGER NOT NULL DEFAULT 1",
    "ALTER TABLE posts ADD COLUMN ip_prefix VARCHAR(40) NOT NULL DEFAULT ''",
    "ALTER TABLE posts ADD COLUMN guest_password_hash VARCHAR(255)",
    "ALTER TABLE comments ADD COLUMN is_fixed INTEGER NOT NULL DEFAULT 1",
    "ALTER TABLE comments ADD COLUMN ip_prefix VARCHAR(40) NOT NULL DEFAULT ''",
    "ALTER TABLE comments ADD COLUMN guest_password_hash VARCHAR(255)",
):
    try:
        with engine.begin() as conn:
            conn.execute(text(_stmt))
    except Exception:
        pass


DEFAULT_GALLERIES = [
    ("free", "자유", "아무 주제나 자유롭게 이야기하는 기본 갤러리", "메이저"),
    ("humor", "유머", "웃긴 짤, 드립, 유머 이야기를 나누는 갤러리", "메이저"),
    ("game", "게임", "PC, 콘솔, 모바일 등 각종 게임 이야기", "메이저"),
    ("music", "음악", "플레이리스트, 밴드, 힙합, 인디 음악 공유", "메이저"),
    ("dev", "IT/개발", "코딩, AI, 하드웨어, 기술 잡담 갤러리", "메이저"),
    ("fashion", "패션", "코디, 신발, 스트릿, 빈티지 취향 공유", "메이저"),
]


def seed_default_galleries(db: Session) -> None:
    existing = {g.slug for g in db.query(Gallery).all()}
    added = False
    for slug, name, desc, cat in DEFAULT_GALLERIES:
        if slug not in existing:
            db.add(Gallery(slug=slug, name=name, description=desc, category=cat, creator="system"))
            added = True
    if added:
        db.commit()


try:
    with SessionLocal() as _db:
        seed_default_galleries(_db)
except Exception as _e:
    print(f"[GALLERY SEED] 기본 갤러리 초기화 오류: {_e}")


def retro_censor_posts(db: Session) -> int:
    """기존에 등록되었던 모든 활성 게시물을 전수 검사하여 소급 격리합니다."""
    active_posts = db.query(Post).filter(Post.status != "censored").all()
    count = 0
    now = datetime.utcnow()
    for p in active_posts:
        violated, reason, kw = inspect_content(p.title or "", p.content or "", p.tags or "")
        if violated:
            p.status = "censored"
            p.censored_reason = f"{reason} ({kw})"
            p.censored_at = p.censored_at or now
            count += 1
    if count > 0:
        db.commit()
    return count


# 서버 부팅 시 즉시 1회 소급 검열 실행
try:
    with SessionLocal() as _db:
        _censored_cnt = retro_censor_posts(_db)
        if _censored_cnt > 0:
            print(f"[CENSOR BOT] 기존 게시물 {_censored_cnt}건 소급 격리 완료")
except Exception as _e:
    print(f"[CENSOR BOT] 소급 검열 초기화 오류: {_e}")



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


optional_security = HTTPBearer(auto_error=False)


def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(optional_security),
    db: Session = Depends(get_db),
) -> User | None:
    if not credentials:
        return None
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("mode") != "oneid":
            return None
        username = payload.get("sub")
        if not username:
            return None
        return db.query(User).filter(User.username == username).first()
    except Exception:
        return None


def _client_ip_prefix(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "")
    raw_ip = fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "127.0.0.1")
    parts = raw_ip.split(".")
    if len(parts) >= 2 and parts[0].isdigit() and parts[1].isdigit():
        return f"{parts[0]}.{parts[1]}"
    return raw_ip[:12] or "127.0"


# =========================================================
# Admin 확인
# =========================================================

def get_admin_user(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    oneid_authorization: str | None = Header(default=None, alias="X-ONEID-Authorization"),
):
    if current_user.is_admin != 1:
        raise HTTPException(status_code=403, detail="관리자 권한이 필요합니다.")

    if oneid_authorization and oneid_authorization.lower().startswith("bearer "):
        link = db.query(OneIDLink).filter(OneIDLink.user_id == current_user.id).first()
        if link:
            try:
                oneid_user = verify_oneid_access_token(oneid_authorization)
                if str(oneid_user.get("id")) != link.oneid_user_id or not oneid_user.get("is_admin"):
                    current_user.is_admin = 1 if oneid_user.get("is_admin") else 0
                    db.commit()
                    if current_user.is_admin != 1:
                        raise HTTPException(status_code=403, detail="ONEID 관리자 권한이 필요합니다.")
            except HTTPException as exc:
                # 만료된 보조 ONEID 토큰으로 인해 유효한 관리자 JWT가 차단되지 않도록 403 권한 박탈만 반영
                if exc.status_code == 403:
                    raise

    return current_user


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


CONCEPT_LIKE_THRESHOLD = 20


class PostCreate(BaseModel):

    title: str
    content: str
    tags: str = ""
    gallery_slug: str = "free"
    nickname: str | None = None
    password: str | None = None


class GalleryCreate(BaseModel):

    name: str
    slug: str | None = None
    description: str = ""


class CommentCreate(BaseModel):

    content: str
    nickname: str | None = None
    password: str | None = None


class DeleteWithPasswordRequest(BaseModel):

    password: str | None = None


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
# Galleries (DCInside Style)
# =========================================================

def _gallery_map(db: Session) -> dict[str, str]:
    return {g.slug: g.name for g in db.query(Gallery).all()}


def _comment_counts(db: Session) -> dict[int, int]:
    rows = db.query(Comment.post_id, func.count(Comment.id)).group_by(Comment.post_id).all()
    return {post_id: cnt for post_id, cnt in rows}


def _serialize_post(post: Post, g_map: dict[str, str], c_counts: dict[int, int]) -> dict:
    slug = post.gallery_slug or "free"
    likes = post.likes or 0
    return {
        "id": post.id,
        "title": post.title,
        "content": post.content,
        "tags": post.tags or "",
        "author": post.author,
        "is_fixed": bool(post.is_fixed if post.is_fixed is not None else 1),
        "ip_prefix": post.ip_prefix or "",
        "likes": likes,
        "views": post.views or 0,
        "comment_count": c_counts.get(post.id, 0),
        "gallery_slug": slug,
        "gallery_name": g_map.get(slug, slug),
        "is_concept": likes >= CONCEPT_LIKE_THRESHOLD,
        "status": post.status or "active",
        "censored_reason": post.censored_reason,
        "censored_at": post.censored_at.isoformat() if post.censored_at else None,
        "created_at": post.created_at.isoformat() if post.created_at else None,
    }


@app.get("/api/galleries")
def get_galleries(db: Session = Depends(get_db)):
    seed_default_galleries(db)
    galleries = db.query(Gallery).order_by(Gallery.id.asc()).all()

    post_counts = dict(
        db.query(Post.gallery_slug, func.count(Post.id))
        .filter(Post.status != "censored")
        .group_by(Post.gallery_slug)
        .all()
    )
    concept_counts = dict(
        db.query(Post.gallery_slug, func.count(Post.id))
        .filter(Post.status != "censored", Post.likes >= CONCEPT_LIKE_THRESHOLD)
        .group_by(Post.gallery_slug)
        .all()
    )

    return [
        {
            "id": g.id,
            "slug": g.slug,
            "name": g.name,
            "description": g.description,
            "category": g.category,
            "creator": g.creator,
            "post_count": post_counts.get(g.slug, 0),
            "concept_count": concept_counts.get(g.slug, 0),
            "created_at": g.created_at.isoformat() if g.created_at else None,
        }
        for g in galleries
    ]


@app.post("/api/galleries")
def create_gallery(
    request: GalleryCreate,
    req: Request,
    current_user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    name = request.name.strip()
    if name.endswith("갤러리") and len(name) > 3:
        name = name[:-3].strip()
    if len(name) < 1 or len(name) > 30:
        raise HTTPException(status_code=400, detail="갤러리 이름은 1~30자로 입력해주세요.")

    description = (request.description or "").strip()[:200]
    violated, reason, matched_kw = inspect_content(name, description, "")
    if violated:
        raise HTTPException(status_code=400, detail=f"부적절한 표현이 포함되어 개설할 수 없습니다: {reason} ({matched_kw})")

    raw_slug = (request.slug or "").strip().lower()
    raw_slug = re.sub(r"[^a-z0-9_-]+", "-", raw_slug).strip("-")
    if not raw_slug:
        ascii_only = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
        raw_slug = ascii_only or f"minor-{secrets.token_hex(3)}"

    if raw_slug in ("all", "best", "concept") or db.query(Gallery).filter(Gallery.slug == raw_slug).first():
        raw_slug = f"{raw_slug[:40]}-{secrets.token_hex(2)}"

    if db.query(Gallery).filter(Gallery.name == name).first():
        raise HTTPException(status_code=409, detail="이미 같은 이름의 갤러리가 존재합니다.")

    creator_label = current_user.username if current_user else f"ㅇㅇ({_client_ip_prefix(req)})"
    gallery = Gallery(
        slug=raw_slug[:60],
        name=name,
        description=description or f"{name} 주제로 이야기하는 마이너 갤러리",
        category="마이너",
        creator=creator_label,
        created_at=datetime.utcnow(),
    )
    db.add(gallery)
    db.commit()
    db.refresh(gallery)

    return {
        "id": gallery.id,
        "slug": gallery.slug,
        "name": gallery.name,
        "description": gallery.description,
        "category": gallery.category,
        "creator": gallery.creator,
        "post_count": 0,
        "concept_count": 0,
        "created_at": gallery.created_at.isoformat() if gallery.created_at else None,
    }


# =========================================================
# Posts - Get (with Dynamic Retro-Censorship)
# =========================================================

@app.get("/api/posts")
def get_posts(
    include_censored: int = 0,
    gallery: str | None = None,
    concept: int = 0,
    q: str | None = None,
    db: Session = Depends(get_db)
):
    # 최신 금칙어 기준으로 기존 글 소급 격리 처리
    retro_censor_posts(db)

    query = db.query(Post)
    if not include_censored:
        query = query.filter(Post.status != "censored")
    if gallery and gallery != "all":
        query = query.filter(Post.gallery_slug == gallery)
    if concept:
        query = query.filter(Post.likes >= CONCEPT_LIKE_THRESHOLD)

    posts = query.order_by(Post.created_at.desc()).all()

    if q and q.strip():
        needle = q.strip().lower()
        posts = [
            p for p in posts
            if needle in (p.title or "").lower()
            or needle in (p.content or "").lower()
            or needle in (p.tags or "").lower()
            or needle in (p.author or "").lower()
        ]

    g_map = _gallery_map(db)
    c_counts = _comment_counts(db)
    return [_serialize_post(post, g_map, c_counts) for post in posts]


@app.get("/api/posts/{post_id}")
def get_post_detail(
    post_id: int,
    db: Session = Depends(get_db),
):
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post or post.status == "censored":
        raise HTTPException(status_code=404, detail="게시물을 찾을 수 없습니다.")

    post.views = (post.views or 0) + 1
    db.commit()
    db.refresh(post)

    comments = (
        db.query(Comment)
        .filter(Comment.post_id == post_id)
        .order_by(Comment.created_at.asc())
        .all()
    )
    g_map = _gallery_map(db)
    c_counts = {post.id: len(comments)}
    data = _serialize_post(post, g_map, c_counts)
    data["comments"] = [
        {
            "id": c.id,
            "post_id": c.post_id,
            "author": c.author,
            "is_fixed": bool(c.is_fixed if c.is_fixed is not None else 1),
            "ip_prefix": c.ip_prefix or "",
            "content": c.content,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        }
        for c in comments
    ]
    return data


@app.post("/api/posts/{post_id}/comments")
def create_comment(
    post_id: int,
    request: CommentCreate,
    req: Request,
    current_user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post or post.status == "censored":
        raise HTTPException(status_code=404, detail="게시물을 찾을 수 없습니다.")

    content = request.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="댓글 내용을 입력해주세요.")
    if len(content) > 1000:
        raise HTTPException(status_code=400, detail="댓글은 1000자 이하로 입력해주세요.")

    nick_raw = (request.nickname or "").strip() if not current_user else ""
    violated, reason, matched_kw = inspect_content("", content, nick_raw)
    if violated:
        raise HTTPException(
            status_code=400,
            detail=f"🤖 [피그스티 검열봇] 댓글에서 '{reason} ({matched_kw})'이(가) 감지되어 등록이 차단되었습니다.",
        )

    if current_user:
        author = current_user.username
        is_fixed = 1
        ip_prefix = ""
        pw_hash = None
    else:
        nick = (request.nickname or "").strip()[:20] or "ㅇㅇ"
        author = nick
        is_fixed = 0
        ip_prefix = _client_ip_prefix(req)
        pw = (request.password or "").strip()
        pw_hash = hash_password(pw) if pw else None

    comment = Comment(
        post_id=post_id,
        author=author,
        content=content,
        is_fixed=is_fixed,
        ip_prefix=ip_prefix,
        guest_password_hash=pw_hash,
        created_at=datetime.utcnow(),
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)

    return {
        "id": comment.id,
        "post_id": comment.post_id,
        "author": comment.author,
        "is_fixed": bool(comment.is_fixed),
        "ip_prefix": comment.ip_prefix or "",
        "content": comment.content,
        "created_at": comment.created_at.isoformat() if comment.created_at else None,
    }


@app.post("/api/comments/{comment_id}/delete")
def delete_comment_with_password(
    comment_id: int,
    request: DeleteWithPasswordRequest,
    current_user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    comment = db.query(Comment).filter(Comment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="댓글을 찾을 수 없습니다.")

    allowed = False
    if current_user and (current_user.is_admin == 1 or (comment.is_fixed == 1 and comment.author == current_user.username)):
        allowed = True
    elif comment.guest_password_hash and request.password and verify_password(request.password, comment.guest_password_hash):
        allowed = True

    if not allowed:
        raise HTTPException(status_code=403, detail="비밀번호가 일치하지 않거나 삭제 권한이 없습니다.")

    db.delete(comment)
    db.commit()
    return {"message": "댓글이 삭제되었습니다."}


# =========================================================
# Posts - Create (with Real-time Censor Bot Auto-Inspection)
# =========================================================

@app.post("/api/posts")
def create_post(
    request: PostCreate,
    req: Request,
    current_user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db)
):
    title = request.title.strip()
    content = request.content.strip()
    tags = request.tags.strip()
    gallery_slug = (request.gallery_slug or "free").strip() or "free"

    if not title:
        raise HTTPException(status_code=400, detail="제목을 입력해주세요.")
    if not content:
        raise HTTPException(status_code=400, detail="내용을 입력해주세요.")

    if not db.query(Gallery).filter(Gallery.slug == gallery_slug).first():
        gallery_slug = "free"

    # 검열봇 실시간 감지 검사
    nick_raw = (request.nickname or "").strip() if not current_user else ""
    violated, reason, matched_kw = inspect_content(title, content, f"{tags} {nick_raw}".strip())

    now = datetime.utcnow()
    initial_status = "censored" if violated else "active"
    censored_reason_text = f"{reason} ({matched_kw})" if violated else None
    censored_at_time = now if violated else None

    if current_user:
        author = current_user.username
        is_fixed = 1
        ip_prefix = ""
        pw_hash = None
    else:
        nick = (request.nickname or "").strip()[:20] or "ㅇㅇ"
        author = nick
        is_fixed = 0
        ip_prefix = _client_ip_prefix(req)
        pw = (request.password or "").strip()
        pw_hash = hash_password(pw) if pw else None

    post = Post(
        title=title,
        content=content,
        tags=tags,
        author=author,
        is_fixed=is_fixed,
        ip_prefix=ip_prefix,
        guest_password_hash=pw_hash,
        likes=0,
        views=0,
        gallery_slug=gallery_slug,
        status=initial_status,
        censored_reason=censored_reason_text,
        censored_at=censored_at_time,
        created_at=now,
    )

    db.add(post)
    db.commit()
    db.refresh(post)

    dark_transferred = False
    if violated:
        try:
            dark_url = os.getenv("DARK_PIGSTY_API_URL", "https://pigsty-dark.onrender.com").rstrip("/")
            dark_resp = httpx.post(
                f"{dark_url}/api/posts",
                json={
                    "title": title,
                    "content": content,
                    "tags": tags,
                    "gallery_slug": gallery_slug,
                    "nickname": author,
                    "password": (request.password or "").strip() or None,
                },
                timeout=8.0,
            )
            dark_transferred = dark_resp.status_code in (200, 201)
        except Exception as _dark_err:
            print(f"[DARKNET TRANSFER] 다크 피그스티 이관 오류: {_dark_err}")

    g_map = _gallery_map(db)
    result = _serialize_post(post, g_map, {post.id: 0})
    result["censored"] = violated
    result["dark_transferred"] = dark_transferred
    result["censored_message"] = (
        f"🤖 [피그스티 검열봇 알림] 게시물에서 '{censored_reason_text}'이(가) 감지되어 일반 피그스티에서 격리되고 다크 피그스티(PIGSTY // DARKNET)로 자동 이관되었습니다."
        if violated else None
    )
    return result


@app.post("/api/posts/{post_id}/delete")
def delete_post_with_password(
    post_id: int,
    request: DeleteWithPasswordRequest,
    current_user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="게시물을 찾을 수 없습니다.")

    allowed = False
    if current_user and (current_user.is_admin == 1 or (post.is_fixed == 1 and post.author == current_user.username)):
        allowed = True
    elif post.guest_password_hash and request.password and verify_password(request.password, post.guest_password_hash):
        allowed = True

    if not allowed:
        raise HTTPException(status_code=403, detail="비밀번호가 일치하지 않거나 삭제 권한이 없습니다.")

    db.delete(post)
    db.commit()
    return {"message": "게시글이 삭제되었습니다."}


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


# =========================================================
# Censor Bot - Quarantine Logs & Stats
# =========================================================

@app.get(
    "/api/censor/logs"
)
def get_censor_logs(
    db: Session = Depends(get_db)
):
    # 최신 금칙어로 즉시 소급 검열 동기화
    retro_censor_posts(db)

    censored_posts = (
        db.query(Post)
        .filter(Post.status == "censored")
        .order_by(Post.censored_at.desc())
        .limit(50)
        .all()
    )

    total_censored = db.query(Post).filter(Post.status == "censored").count()

    return {
        "total_censored": total_censored,
        "bot_name": "피그스티 검열봇 (PIGSTY CENSOR BOT)",
        "logs": [
            {
                "id": p.id,
                "author": p.author,
                "title": p.title,
                "censored_reason": p.censored_reason,
                "censored_at": p.censored_at.isoformat() if p.censored_at else None,
            }
            for p in censored_posts
        ],
    }


# =========================================================
# Admin Management Console Endpoints
# =========================================================

class RebootRequest(BaseModel):
    mode: str = "soft"


def _delayed_process_exit():
    import time
    time.sleep(0.6)
    try:
        os.kill(os.getpid(), signal.SIGTERM)
    except Exception:
        os._exit(0)


@app.get("/api/admin/overview")
def admin_overview(
    current_admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    posts = db.query(Post).order_by(Post.created_at.desc(), Post.id.desc()).limit(200).all()
    galleries = db.query(Gallery).order_by(Gallery.id.asc()).all()
    g_map = {g.slug: g.name for g in galleries}
    c_counts = _comment_counts(db)

    post_counts = {
        slug: cnt
        for slug, cnt in db.query(Post.gallery_slug, func.count(Post.id)).group_by(Post.gallery_slug).all()
    }
    total_posts = db.query(Post).count()
    censored_count = db.query(Post).filter(Post.status == "censored").count()

    return {
        "admin": current_admin.username,
        "stats": {
            "total_posts": total_posts,
            "active_posts": total_posts - censored_count,
            "censored_posts": censored_count,
            "total_galleries": len(galleries),
        },
        "galleries": [
            {
                "id": g.id,
                "slug": g.slug,
                "name": g.name,
                "category": g.category or "메이저",
                "creator": g.creator,
                "post_count": post_counts.get(g.slug, 0),
                "protected": g.slug == "free",
            }
            for g in galleries
        ],
        "posts": [
            {
                "id": p.id,
                "title": p.title,
                "author": p.author,
                "gallery_slug": p.gallery_slug or "free",
                "gallery_name": g_map.get(p.gallery_slug or "free", p.gallery_slug or "free"),
                "status": p.status or "active",
                "censored_reason": p.censored_reason,
                "likes": p.likes or 0,
                "views": p.views or 0,
                "comment_count": c_counts.get(p.id, 0),
                "created_at": p.created_at.isoformat() if p.created_at else None,
            }
            for p in posts
        ],
    }


@app.delete("/api/admin/posts/{post_id}")
def admin_delete_post(
    post_id: int,
    current_admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="게시물을 찾을 수 없습니다.")
    db.delete(post)
    db.commit()
    return {"message": "게시글이 삭제되었습니다.", "deleted_id": post_id}


@app.delete("/api/admin/galleries/{slug}")
def admin_delete_gallery(
    slug: str,
    delete_posts: bool = True,
    current_admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    clean_slug = (slug or "").strip().lower()
    if clean_slug == "free":
        raise HTTPException(status_code=400, detail="기본 자유 갤러리는 삭제할 수 없습니다.")

    gallery = db.query(Gallery).filter(Gallery.slug == clean_slug).first()
    if not gallery:
        raise HTTPException(status_code=404, detail="갤러리를 찾을 수 없습니다.")

    posts_in_gallery = db.query(Post).filter(Post.gallery_slug == clean_slug).all()
    affected_posts = len(posts_in_gallery)

    if delete_posts:
        for post in posts_in_gallery:
            db.delete(post)
    else:
        for post in posts_in_gallery:
            post.gallery_slug = "free"

    db.delete(gallery)
    db.commit()
    return {
        "message": f"'{gallery.name}' 갤러리가 삭제되었습니다.",
        "deleted_slug": clean_slug,
        "affected_posts": affected_posts,
        "posts_deleted": delete_posts,
    }


@app.post("/api/admin/reboot")
def admin_reboot(
    request: RebootRequest,
    background_tasks: BackgroundTasks,
    current_admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    mode = (request.mode or "soft").strip().lower()
    seed_default_galleries(db)
    censored = retro_censor_posts(db)

    if mode == "hard":
        threading.Thread(target=_delayed_process_exit, daemon=True).start()
        return {
            "mode": "hard",
            "message": "서버 프로세스 리부트를 요청했습니다. 잠시 후 자동으로 다시 시작됩니다.",
            "newly_censored": censored,
        }

    return {
        "mode": "soft",
        "message": f"시스템 재동기화(소프트 리부트) 완료 · 신규 격리 {censored}건",
        "newly_censored": censored,
    }