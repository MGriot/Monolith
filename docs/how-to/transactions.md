# Transactions: one unit of work per operation

CRUD methods used to `commit()` after every step. A failure half-way through a compound operation - a task update that cascades to the parent status
and the project dates, a project created from a template, an idea promoted to a task - left partial data behind (and some of those flows committed
the first half before raising a 400 to the caller).

`app/db/transaction.py` fixes that without changing how simple CRUD calls behave:

| Piece | What it does |
|---|---|
| `commit(db)` | what the CRUD modules call instead of `db.commit()`. Outside a unit of work: a normal commit (unchanged). Inside one: only `flush()` (ids and defaults are available), the outermost block owns the commit. |
| `async with transaction(db):` | groups any number of CRUD calls; commits once at the end, rolls everything back if anything raised (including cancellation). Blocks nest and join the outer one. |
| `@atomic` | the same, as a decorator for a CRUD method (`db` is the first argument after `self`). Applied to task `create/update/remove/update_assignees`, project `create/create_with_owner` (template instantiation) and idea `promote_to_project/promote_to_task`. |

## Rules

* In `app/crud/*` never call `db.commit()`; `await commit(db)` (a unit test fails the build if someone does).
* Best-effort side effects inside a unit (queueing an e-mail, ...) use a SAVEPOINT: `async with db.begin_nested(): ...`. A session-wide `db.rollback()` would throw
  the whole unit away.
* Endpoints that do several CRUD calls which must succeed together wrap them: `async with transaction(db): ...`.
* Things that react to a commit (websocket pushes of a new notification) currently fire before the final commit when they run inside a unit; clients that refetch
  immediately can race by a few milliseconds. Move such side effects after the block if that ever matters.

## Verified

`tests/test_transactions.py` (nesting, rollback on errors/cancellation, decorator, "no raw commit in crud"), and `tests/live/smoke_transactions.py` against Postgres:
failures injected in the last step of `create`, `update` and `remove` leave no half-written task, a block of two creates followed by an error persists neither,
and 12 concurrent atomic creates all land.
