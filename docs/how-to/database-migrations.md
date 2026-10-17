# Database migrations (Alembic)

The schema is managed by Alembic (`backend/migrations`). The old `metadata.create_all()` at start-up is gone.

| Revision | What |
|---|---|
| `0001` baseline | The schema exactly as `create_all()` produced it (constraint and index names identical, checked against a live database). Foreign keys are added after the tables because `projects`/`topics`/`work_types`/`tasks` reference each other. |
| `0002` indexes | FK lookups, task tree, dependency graph, notification bell, association tables by user, and `pg_trgm` GIN indexes for the `ILIKE '%q%'` global search. |
| `0003` time tracking + custom fields | `time_entries` (partial unique index: one running timer per user), `custom_field_defs` (unique name per project), `tasks.custom_values JSONB` + GIN index. |

## What happens at start-up (`AUTO_MIGRATE=true`, default)

* **Empty database** → `upgrade head` creates everything.
* **Database created by an older version** (tables but no `alembic_version`) → stamped at `0001`, then upgraded, so only new migrations run. Nothing is dropped or rewritten.
* **Already versioned** → normal `upgrade head`.

A Postgres advisory lock serialises concurrent start-ups. Set `AUTO_MIGRATE=false` to run migrations yourself.

## Everyday commands

```bash
# inside the backend container (or any environment with DATABASE_URL set)
podman exec monolith_backend alembic -c /app/alembic.ini current
podman exec monolith_backend alembic -c /app/alembic.ini upgrade head
podman exec monolith_backend alembic -c /app/alembic.ini downgrade -1
```

## Changing the schema

1. Edit the model (or `app/models/indexes.py` for indexes).
2. Generate against a throw-away empty database so the diff is clean:
   ```bash
   podman exec monolith_db psql -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE alembic_gen"
   podman exec -e DATABASE_URL=postgresql+asyncpg://USER:PASS@db:5432/alembic_gen monolith_backend \
       sh -c 'alembic upgrade head && alembic revision --autogenerate -m "describe change" --rev-id 0003'
   ```
3. Read the generated file, fix anything Alembic cannot infer (data migrations, enum changes, extensions), and add a `downgrade`.
4. `alembic check` must report *No new upgrade operations detected* after upgrading.
5. `backend/tests/test_db_tier1.py` fails if an index declared in `app/models/indexes.py` is missing from every migration.

## Performance notes

* Task trees (`crud_task.get`, `get_multi_by_project`) are loaded with **one recursive CTE plus one query per relation** (8 queries for any size or depth) and assembled in memory. Previously ~30 queries for 155 tasks, and an HTTP 500 for trees deeper than four levels.
* `CREATE INDEX` in `0002` takes a short write lock per table; on a large production table create them with `CONCURRENTLY` by hand before upgrading.
* `0002` runs `CREATE EXTENSION IF NOT EXISTS pg_trgm`; managed databases may need that enabled by an administrator first.
