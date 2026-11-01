from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker, scoped_session
from sqlalchemy.pool import NullPool
from app.config import Config

Base = declarative_base()
engine = None
SessionLocal = None

def init_db(database_url: str = None):
    """Initializes SQLite/Postgres database engine and creates all tables."""
    global engine, SessionLocal
    url = database_url or Config.DATABASE_URL

    connect_args = {"check_same_thread": False} if url.startswith("sqlite") else {}
    poolclass = NullPool if url.startswith("sqlite") else None

    if poolclass:
        engine = create_engine(url, connect_args=connect_args, poolclass=poolclass, echo=False)
    else:
        engine = create_engine(url, connect_args=connect_args, pool_size=20, max_overflow=30, echo=False)

    SessionLocal = scoped_session(sessionmaker(autocommit=False, autoflush=False, bind=engine))

    # Import models so Base registers them
    import app.models  # noqa: F401
    Base.metadata.create_all(bind=engine)
    return engine

def get_db():
    """Generator dependency for route database sessions."""
    if SessionLocal is None:
        init_db()
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
