"""Unit of work for compound operations.

CRUD methods used to `commit()` after every step, so a failure half-way through a cascade (task update -> parent
status -> project sync -> shifting successors) or a template instantiation left partial data behind. They now call
`commit(db)`: outside a transaction that is a plain commit (behaviour unchanged); inside `transaction(db)` it only
flushes, and the outermost block commits once - or rolls everything back if anything raised.

    async with transaction(db):
        await crud_task.task.create(db, obj_in=a)     # flushed, not committed
        await crud_task.task.create(db, obj_in=b)     # raises -> `a` is rolled back too

Blocks nest: inner ones join the outer one. For best-effort side effects inside a transaction (e.g. queueing an
e-mail) use `async with db.begin_nested():` (a SAVEPOINT), never `db.rollback()`, which would discard the whole unit.
"""
import functools
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator, Callable

from sqlalchemy.ext.asyncio import AsyncSession

_DEPTH_KEY = "uow_depth"


def in_transaction(db: AsyncSession) -> bool:
    return db.info.get(_DEPTH_KEY, 0) > 0


async def commit(db: AsyncSession) -> None:
    """Commit, unless a surrounding `transaction()` owns the commit - then just flush (IDs/defaults are available)."""
    if in_transaction(db):
        await db.flush()
    else:
        await db.commit()


@asynccontextmanager
async def transaction(db: AsyncSession) -> AsyncIterator[None]:
    depth = db.info.get(_DEPTH_KEY, 0)
    db.info[_DEPTH_KEY] = depth + 1
    try:
        yield
        if depth == 0:
            await db.commit()
    except BaseException:
        if depth == 0:
            await db.rollback()
        raise
    finally:
        db.info[_DEPTH_KEY] = depth


def atomic(fn: Callable[..., Any]) -> Callable[..., Any]:
    """Run a CRUD method (first argument after `self` is the session) as one unit of work."""

    @functools.wraps(fn)
    async def wrapper(self, *args: Any, **kwargs: Any) -> Any:
        db = args[0] if args else kwargs["db"]
        async with transaction(db):
            return await fn(self, *args, **kwargs)

    return wrapper
