"""Unit of work: `transaction()`, `commit()` and `@atomic` (no database; the real thing runs in
backend/tests/live/smoke_transactions.py)."""
import asyncio
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.db.transaction import atomic, commit, in_transaction, transaction


def run(coro):
    return asyncio.run(coro)


@pytest.fixture
def db():
    d = MagicMock()
    d.info = {}
    d.commit, d.flush, d.rollback = AsyncMock(), AsyncMock(), AsyncMock()
    return d


class TestCommitHelper:
    def test_outside_a_transaction_it_is_a_plain_commit(self, db):
        run(commit(db))
        db.commit.assert_awaited_once()
        db.flush.assert_not_awaited()

    def test_inside_a_transaction_it_only_flushes(self, db):
        async def go():
            async with transaction(db):
                await commit(db)
                await commit(db)
                db.commit.assert_not_awaited()

        run(go())
        assert db.flush.await_count == 2
        db.commit.assert_awaited_once()          # exactly one real commit, at the end


class TestTransaction:
    def test_success_commits_once_and_clears_the_flag(self, db):
        async def go():
            assert not in_transaction(db)
            async with transaction(db):
                assert in_transaction(db)
            assert not in_transaction(db)

        run(go())
        db.commit.assert_awaited_once()
        db.rollback.assert_not_awaited()

    def test_exception_rolls_back_and_propagates(self, db):
        async def go():
            async with transaction(db):
                raise ValueError("boom")

        with pytest.raises(ValueError):
            run(go())
        db.rollback.assert_awaited_once()
        db.commit.assert_not_awaited()
        assert not in_transaction(db)

    def test_cancellation_also_rolls_back(self, db):
        async def go():
            async with transaction(db):
                raise asyncio.CancelledError()

        with pytest.raises(asyncio.CancelledError):
            run(go())
        db.rollback.assert_awaited_once()

    def test_nested_blocks_join_the_outer_one(self, db):
        async def go():
            async with transaction(db):
                async with transaction(db):
                    assert db.info["uow_depth"] == 2
                db.commit.assert_not_awaited()      # inner block did not commit
                assert in_transaction(db)
            assert not in_transaction(db)

        run(go())
        db.commit.assert_awaited_once()

    def test_an_inner_failure_rolls_back_everything_once_at_the_outer_level(self, db):
        async def go():
            async with transaction(db):
                try:
                    async with transaction(db):
                        raise RuntimeError("inner")
                except RuntimeError:
                    db.rollback.assert_not_awaited()  # not yet: the unit is still open
                    raise

        with pytest.raises(RuntimeError):
            run(go())
        db.rollback.assert_awaited_once()
        db.commit.assert_not_awaited()

    def test_swallowing_an_inner_failure_keeps_the_unit_usable(self, db):
        async def go():
            async with transaction(db):
                try:
                    async with transaction(db):
                        raise RuntimeError("inner")
                except RuntimeError:
                    pass
                await commit(db)                    # still joined to the outer unit

        run(go())
        db.commit.assert_awaited_once()

    def test_depth_is_restored_after_failures_so_the_session_is_reusable(self, db):
        async def go():
            with pytest.raises(RuntimeError):
                async with transaction(db):
                    raise RuntimeError("x")
            await commit(db)                        # a later, unrelated commit works normally

        run(go())
        db.commit.assert_awaited_once()


class TestAtomicDecorator:
    class Repo:
        def __init__(self, fail=False):
            self.fail = fail
            self.saw_transaction = None

        @atomic
        async def create(self, db, *, obj_in):
            self.saw_transaction = in_transaction(db)
            await commit(db)
            if self.fail:
                raise ValueError("nope")
            return obj_in

    def test_runs_the_method_inside_a_unit_of_work(self, db):
        repo = self.Repo()
        assert run(repo.create(db, obj_in="x")) == "x"
        assert repo.saw_transaction is True
        db.flush.assert_awaited_once()
        db.commit.assert_awaited_once()

    def test_session_may_be_passed_by_keyword(self, db):
        repo = self.Repo()
        assert run(repo.create(db=db, obj_in="y")) == "y"
        db.commit.assert_awaited_once()

    def test_failure_rolls_back(self, db):
        repo = self.Repo(fail=True)
        with pytest.raises(ValueError):
            run(repo.create(db, obj_in="z"))
        db.rollback.assert_awaited_once()
        db.commit.assert_not_awaited()

    def test_atomic_methods_calling_each_other_commit_once(self, db):
        class Outer:
            def __init__(self):
                self.inner = TestAtomicDecorator.Repo()

            @atomic
            async def make(self, db):
                await self.inner.create(db, obj_in=1)
                await self.inner.create(db, obj_in=2)

        run(Outer().make(db))
        assert db.commit.await_count == 1 and db.flush.await_count == 2

    def test_metadata_is_preserved(self):
        assert TestAtomicDecorator.Repo.create.__name__ == "create"


class TestWiring:
    def test_compound_operations_are_atomic_and_cruds_use_the_helper(self):
        """Guards against a new CRUD module quietly going back to commit()ing in the middle of a unit."""
        import glob
        import os
        import re

        crud_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "app", "crud")
        offenders = []
        for path in glob.glob(os.path.join(crud_dir, "*.py")):
            if re.search(r"^\s*await db\.commit\(\)", open(path, encoding="utf-8").read(), flags=re.M):
                offenders.append(os.path.basename(path))
        assert not offenders, f"use `await commit(db)` from app.db.transaction in: {offenders}"

        from app.crud import crud_idea, crud_project, crud_task

        for fn in (crud_task.CRUDTask.create, crud_task.CRUDTask.update, crud_task.CRUDTask.remove,
                   crud_task.CRUDTask.update_assignees, crud_project.CRUDProject.create_with_owner,
                   crud_idea.CRUDIdea.promote_to_project, crud_idea.CRUDIdea.promote_to_task):
            assert hasattr(fn, "__wrapped__"), f"{fn.__qualname__} should be @atomic"
