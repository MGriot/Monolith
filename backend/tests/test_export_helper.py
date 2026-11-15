"""core.export: CSV / Excel responses shared by the export endpoints."""
import asyncio
import io
from datetime import datetime
from urllib.parse import unquote

from openpyxl import load_workbook

from app.core.enums import Status
from app.core.export import XLSX_MEDIA_TYPE, enum_value, fmt_date, tabular_response


def _body(response) -> bytes:
    async def read():
        return b"".join([c async for c in response.body_iterator])
    return asyncio.run(read())


def test_csv_columns_follow_first_appearance_and_none_is_empty():
    rows = [{"A": 1, "B": None}, {"A": 2.5, "C": "x,y"}]
    response = tabular_response(rows, fmt="csv", sheet="S", basename="out")
    assert response.media_type == "text/csv"
    assert _body(response).decode() == 'A,B,C\n1,,\n2.5,,"x,y"\n'


def test_empty_export_is_an_empty_file():
    assert _body(tabular_response([], fmt="csv", sheet="S", basename="out")) == b""
    wb = load_workbook(io.BytesIO(_body(tabular_response([], fmt="excel", sheet="Tasks", basename="out"))))
    assert wb.sheetnames == ["Tasks"]


def test_excel_keeps_types_and_bolds_the_header():
    response = tabular_response([{"Name": "a", "Days": 3}], fmt="excel", sheet="Tasks", basename="out")
    assert response.media_type == XLSX_MEDIA_TYPE
    ws = load_workbook(io.BytesIO(_body(response)))["Tasks"]
    assert [[c.value for c in row] for row in ws.iter_rows()] == [["Name", "Days"], ["a", 3]]
    assert ws["A1"].font.bold


def test_filename_with_spaces_and_accents_survives():
    header = tabular_response([], fmt="csv", sheet="S", basename='Café "Q1" plan').headers["content-disposition"]
    assert header.startswith('attachment; filename="Caf_ _Q1_ plan.csv"; ')
    assert unquote(header.split("filename*=UTF-8''", 1)[1]) == 'Café "Q1" plan.csv'


def test_formatters():
    assert fmt_date(None) == ""
    assert fmt_date(datetime(2026, 1, 5, 9, 30)) == "2026-01-05"
    assert fmt_date(datetime(2026, 1, 5, 9, 30), "%Y-%m-%d %H:%M") == "2026-01-05 09:30"
    assert enum_value(Status.DONE) == Status.DONE.value
    assert enum_value("raw") == "raw"
