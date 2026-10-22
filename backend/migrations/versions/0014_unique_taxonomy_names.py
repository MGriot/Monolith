"""Unique topic / work type names per scope (global, project, task)

The baseline only had UniqueConstraint(name, project_id, task_id). Postgres treats NULLs as distinct, so it never
stopped two global topics (both scope columns NULL) or two project topics (task_id NULL) with the same name. This
revision merges any duplicates that slipped in (references move to the oldest-by-id survivor) and replaces the
constraint with one partial unique index per scope - the indexes the old hand-run
fix_scoped_taxonomy_constraints.py created on databases that predate Alembic, so it is safe to run there too.

Revision ID: 0014
Revises: 0013
Create Date: 2026-10-22
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '0014'
down_revision: Union[str, None] = '0013'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# (table, old constraint, index prefix, plain FK columns, association tables as (table, owner column, ref column))
TABLES = [
    ('topics', '_topic_name_scope_uc', 'topics',
     [('projects', 'topic_id'), ('tasks', 'topic_id')],
     [('project_topics', 'project_id', 'topic_id'), ('task_topics', 'task_id', 'topic_id'),
      ('file_topics', 'file_id', 'topic_id')]),
    ('work_types', '_work_type_name_scope_uc', 'work_types',
     [('projects', 'type_id'), ('tasks', 'type_id')],
     [('project_types', 'project_id', 'type_id'), ('task_types', 'task_id', 'type_id')]),
]

# JSON columns that may hold topic / work type ids as strings (allow-lists, template task trees, automation rules).
# A merged id is rewritten there too; UUID strings cannot collide with anything else in the text.
JSON_COLUMNS = [
    ('projects', 'allowed_global_topics', 'jsonb'), ('projects', 'allowed_global_work_types', 'jsonb'),
    ('project_templates', 'tasks_json', 'json'), ('project_templates', 'allowed_global_topics', 'json'),
    ('project_templates', 'allowed_global_work_types', 'json'),
    ('automation_rules', 'conditions', 'jsonb'), ('automation_rules', 'actions', 'jsonb'),
]

# scope name -> (partition columns, row filter)
SCOPES = [
    ('global', 'name', 'project_id IS NULL AND task_id IS NULL'),
    ('project', 'name, project_id', 'project_id IS NOT NULL'),
    ('task', 'name, task_id', 'task_id IS NOT NULL'),
]


def _check_known_references(conn, table, fk_columns, assoc_tables):
    """Refuse to merge if some foreign key into `table` is not handled below (a later migration added one)."""
    known = {(t, c) for t, c in fk_columns} | {(t, c) for t, _, c in assoc_tables}
    rows = conn.execute(sa.text("""
        SELECT cl.relname, att.attname
        FROM pg_constraint con
        JOIN pg_class cl ON cl.oid = con.conrelid
        JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY (con.conkey)
        WHERE con.contype = 'f' AND con.confrelid = CAST(CAST(:t AS text) AS regclass)
    """), {"t": table}).fetchall()
    unknown = {(r[0], r[1]) for r in rows} - known
    if unknown:
        raise RuntimeError(f"0014: unhandled foreign keys into {table}: {sorted(unknown)}")


def _merge_duplicates(conn, table, fk_columns, assoc_tables):
    for _, partition, where in SCOPES:
        conn.execute(sa.text(f"""
            CREATE TEMP TABLE dup_map AS
            SELECT id AS dup_id, keeper_id FROM (
                SELECT id, first_value(id) OVER (PARTITION BY {partition} ORDER BY id::text) AS keeper_id
                FROM {table} WHERE {where}
            ) ranked
            WHERE id <> keeper_id
        """))
        for fk_table, column in fk_columns:
            conn.execute(sa.text(f"""
                UPDATE {fk_table} SET {column} = m.keeper_id FROM dup_map m WHERE {fk_table}.{column} = m.dup_id
            """))
        for assoc, owner, column in assoc_tables:
            # Move links to the survivor, skipping owners that already link to it (the pair is the primary key).
            conn.execute(sa.text(f"""
                INSERT INTO {assoc} ({owner}, {column})
                SELECT a.{owner}, m.keeper_id FROM {assoc} a JOIN dup_map m ON a.{column} = m.dup_id
                ON CONFLICT DO NOTHING
            """))
            conn.execute(sa.text(f"DELETE FROM {assoc} USING dup_map m WHERE {assoc}.{column} = m.dup_id"))
        for dup_id, keeper_id in conn.execute(sa.text("SELECT dup_id::text, keeper_id::text FROM dup_map")).fetchall():
            for json_table, column, json_type in JSON_COLUMNS:
                conn.execute(sa.text(f"""
                    UPDATE {json_table} SET {column} = CAST(replace(CAST({column} AS text), :dup, :keeper) AS {json_type})
                    WHERE strpos(CAST({column} AS text), :dup) > 0
                """), {"dup": dup_id, "keeper": keeper_id})
        conn.execute(sa.text(f"DELETE FROM {table} USING dup_map m WHERE {table}.id = m.dup_id"))
        conn.execute(sa.text("DROP TABLE dup_map"))


def upgrade() -> None:
    conn = op.get_bind()
    for table, constraint, prefix, fk_columns, assoc_tables in TABLES:
        _check_known_references(conn, table, fk_columns, assoc_tables)
        _merge_duplicates(conn, table, fk_columns, assoc_tables)
        op.execute(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS {constraint}")
        for scope, partition, where in SCOPES:
            op.execute(f"DROP INDEX IF EXISTS {prefix}_{scope}_unique_idx")
            op.execute(f"CREATE UNIQUE INDEX {prefix}_{scope}_unique_idx ON {table} ({partition}) WHERE {where}")


def downgrade() -> None:
    # Merged duplicates are not restored.
    for table, constraint, prefix, _, _ in TABLES:
        for scope, _, _ in SCOPES:
            op.execute(f"DROP INDEX IF EXISTS {prefix}_{scope}_unique_idx")
        op.create_unique_constraint(constraint, table, ['name', 'project_id', 'task_id'])
