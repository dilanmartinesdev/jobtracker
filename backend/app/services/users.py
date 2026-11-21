"""Account logic: registration, authentication and deletion."""

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.errors import EmailAlreadyRegisteredError
from app.models import User
from app.security import DUMMY_HASH, hash_password, needs_rehash, verify_password


def normalize_email(email: str) -> str:
    return email.strip().lower()


def get_by_email(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(User.email == normalize_email(email)))


def create_user(db: Session, email: str, password: str) -> User:
    if get_by_email(db, email) is not None:
        raise EmailAlreadyRegisteredError(email)
    user = User(email=normalize_email(email), hashed_password=hash_password(password))
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        # Two sign-ups with the same email racing each other: the unique index decides.
        db.rollback()
        raise EmailAlreadyRegisteredError(email) from None
    db.refresh(user)
    return user


def authenticate(db: Session, email: str, password: str) -> User | None:
    """Return the user when the credentials are right, otherwise None."""
    user = get_by_email(db, email)
    # Always run exactly one hash verification, even for unknown emails.
    is_valid = verify_password(password, user.hashed_password if user else DUMMY_HASH)
    if user is None or not is_valid:
        return None
    if needs_rehash(user.hashed_password):
        user.hashed_password = hash_password(password)
        db.commit()
    return user


def delete_user(db: Session, user: User) -> None:
    """Delete the account; the database cascades to its applications and history."""
    db.delete(user)
    db.commit()
