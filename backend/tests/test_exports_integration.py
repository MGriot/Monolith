"""
CSV / Excel exports against a real PostgreSQL database (same setup as test_db_integration.py: one outer transaction,
rolled back; skipped without TEST_DATABASE_URL). They pin the columns and cell values of the three export endpoints.
"""
import csv
import io
import os
from datetime import datetime

import pytest

if not os.environ.get("TEST_DATABASE_URL"):
    pytest.skip("TEST_DATABASE_URL is not set (needs a throw-away PostgreSQL)", allow_module_level=True)

from openpyxl import load_workbook  # noqa: E402

from app.api.api_v1.endpoints import projects as projects_api, tasks as tasks_api  # noqa: E402
from app.core.enums import Priority  # noqa: E402
from app.crud import crud_project, crud_task  # noqa: E402
from app.models.user import User  # noqa: E402
from app.schemas.project import ProjectCreate  # noqa: E402
from app.schemas.task import TaskCreate, TaskShortCreate  # noqa: E402
from test_db_integration import run_in_rolled_back_db  # noqa: E402

XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


async def _body(response) -> bytes:
    chunks = [c if isinstance(c, bytes) else c.encode() async for c in response.body_iterator]
    return b"".join(chunks)


async def _csv_rows(response):
    assert response.media_type == "text/csv"
    return list(csv.reader(io.StringIO((await _body(response)).decode())))


async def _xlsx_rows(response, sheet):
    assert response.media_type == XLSX
    wb = load_workbook(io.BytesIO(await _body(response)))
    assert wb.sheetnames == [sheet]
    return [["" if v is None else v for v in row] for row in wb[sheet].iter_rows(values_only=True)]


async def _seed(db, owner_id):
    user = await db.get(User, owner_id)
    project = await crud_project.project.create_with_owner(db, obj_in=ProjectCreate(
        name="Export, Inc", description="Quarterly", start_date=datetime(2026, 1, 5), due_date=datetime(2026, 2, 27),
        tags=["ops", "q1"]), owner_id=owner_id)
    await crud_task.task.create(db, obj_in=TaskCreate(
        title="Plan", project_id=project.id, priority=Priority.HIGH,
        start_date=datetime(2026, 1, 5), due_date=datetime(2026, 1, 7), assignee_ids=[owner_id], tags=["a"],
        subtasks=[TaskShortCreate(title="Draft", assignee_ids=[owner_id])],
    ), owner_id=owner_id)
    return user, project.id


def test_project_export_details_csv_and_excel_match():
    async def scenario(db, owner_id):
        user, project_id = await _seed(db, owner_id)
        rows = await _csv_rows(await projects_api.export_project(
            project_id=project_id, mode="details", format="csv", db=db, current_user=user))
        assert rows[0] == ["WBS", "Title", "Description", "Status", "Priority", "Start Date", "Due Date", "Deadline",
                           "Completed At", "Duration (Days)", "Assignees", "Milestone", "Tags"]
        assert [r[:2] for r in rows[1:]] == [["1", "Plan"], ["1.1", "Draft"]]
        plan = dict(zip(rows[0], rows[1]))
        assert plan["Status"] == "Todo" and plan["Priority"] == "High"  # a summary task follows its subtasks
        assert (plan["Start Date"], plan["Due Date"], plan["Duration (Days)"]) == ("2026-01-05", "2026-01-07", "3")
        assert plan["Assignees"] == "Test Owner" and plan["Milestone"] == "No" and plan["Tags"] == "a"

        xlsx = await _xlsx_rows(await projects_api.export_project(
            project_id=project_id, mode="details", format="excel", db=db, current_user=user), "Tasks")
        assert [[str(v) for v in r] for r in xlsx] == rows

    run_in_rolled_back_db(scenario)


def test_project_export_summary_csv():
    async def scenario(db, owner_id):
        user, project_id = await _seed(db, owner_id)
        response = await projects_api.export_project(
            project_id=project_id, mode="summary", format="csv", db=db, current_user=user)
        rows = await _csv_rows(response)
        assert rows[0] == ["Project Name", "Description", "Status", "Progress %", "Start Date", "Due Date", "Deadline",
                           "Archived", "Owner", "Tags"]
        row = dict(zip(rows[0], rows[1]))
        assert row["Project Name"] == "Export, Inc" and row["Owner"] == "Test Owner" and row["Tags"] == "ops, q1"
        assert row["Archived"] == "No" and row["Start Date"] == "2026-01-05"
        assert "attachment" in response.headers["content-disposition"]

    run_in_rolled_back_db(scenario)


def test_all_projects_export_summary_and_details():
    async def scenario(db, owner_id):
        user, _ = await _seed(db, owner_id)
        summary = await _csv_rows(await projects_api.export_projects_multi(
            include_archived=False, mode="summary", format="csv", db=db, current_user=user))
        assert summary[0][:4] == ["Name", "Description", "Status", "Progress %"]
        assert [r[0] for r in summary[1:]] == ["Export, Inc"]

        details = await _csv_rows(await projects_api.export_projects_multi(
            include_archived=False, mode="details", format="csv", db=db, current_user=user))
        assert details[0] == ["Project", "WBS", "Title", "Status", "Priority", "Assignees", "Start Date", "Due Date",
                              "Deadline", "Progress %", "Description"]
        assert [r[1:3] for r in details[1:]] == [["", "[PROJECT ROOT]"], ["1", "Plan"], ["1.1", "Draft"]]

        xlsx = await _xlsx_rows(await projects_api.export_projects_multi(
            include_archived=False, mode="details", format="excel", db=db, current_user=user), "Projects")
        assert [[str(v) for v in r] for r in xlsx] == details

    run_in_rolled_back_db(scenario)


def test_my_tasks_export_summary_and_details():
    async def scenario(db, owner_id):
        user, _ = await _seed(db, owner_id)
        summary = await _csv_rows(await tasks_api.export_tasks(
            include_archived=False, mode="summary", format="csv", db=db, current_user=user))
        assert summary[0] == ["Project", "Parent Task", "Title", "Description", "Status", "Priority", "Start Date",
                              "Due Date", "Completed At", "Duration (Days)", "Assignees", "Milestone", "Tags"]
        assert sorted(r[2] for r in summary[1:]) == ["Draft", "Plan"]

        details = await _csv_rows(await tasks_api.export_tasks(
            include_archived=False, mode="details", format="csv", db=db, current_user=user))
        # The assigned subtask appears on its own and again under its parent.
        assert sorted((r[1], r[2]) for r in details[1:]) == [("", "Draft"), ("", "Plan"), ("Plan", "Draft")]

        xlsx = await _xlsx_rows(await tasks_api.export_tasks(
            include_archived=False, mode="summary", format="excel", db=db, current_user=user), "My Tasks")
        assert sorted(r[2] for r in xlsx[1:]) == ["Draft", "Plan"]

    run_in_rolled_back_db(scenario)
