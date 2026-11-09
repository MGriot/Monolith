"""CSV / Excel download responses for the export endpoints (rows are dicts; columns follow first appearance)."""
import csv
import io
from datetime import datetime
from typing import Any, Iterable, List
from urllib.parse import quote

from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from openpyxl.styles import Font

XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def fmt_date(value: datetime | None, pattern: str = "%Y-%m-%d") -> str:
    return value.strftime(pattern) if value else ""


def enum_value(value: Any) -> str:
    return value.value if hasattr(value, "value") else str(value)


def _columns(rows: Iterable[dict]) -> List[str]:
    columns: dict = {}
    for row in rows:
        columns.update(dict.fromkeys(row))
    return list(columns)


def _cell(value: Any) -> Any:
    return "" if value is None else value


def _content_disposition(filename: str) -> str:
    # ASCII fallback for old clients plus the RFC 5987 form, so names with spaces, quotes or accents survive.
    fallback = "".join(c if c.isascii() and c.isprintable() and c not in '"\\' else "_" for c in filename)
    return f"attachment; filename=\"{fallback}\"; filename*=UTF-8''{quote(filename)}"


def tabular_response(rows: List[dict], *, fmt: str, sheet: str, basename: str) -> StreamingResponse:
    """`fmt` is "csv" or "excel"; the file is `<basename>.csv` / `<basename>.xlsx`."""
    columns = _columns(rows)
    if fmt == "csv":
        stream = io.StringIO()
        writer = csv.writer(stream, lineterminator="\n")
        if columns:
            writer.writerow(columns)
        writer.writerows([_cell(row.get(c)) for c in columns] for row in rows)
        body, media_type, filename = stream.getvalue().encode(), "text/csv", f"{basename}.csv"
    else:
        wb = Workbook()
        ws = wb.active
        ws.title = sheet
        if columns:
            ws.append(columns)
            for cell in ws[1]:
                cell.font = Font(bold=True)
        for row in rows:
            ws.append([_cell(row.get(c)) for c in columns])
        stream = io.BytesIO()
        wb.save(stream)
        body, media_type, filename = stream.getvalue(), XLSX_MEDIA_TYPE, f"{basename}.xlsx"
    return StreamingResponse(io.BytesIO(body), media_type=media_type,
                             headers={"Content-Disposition": _content_disposition(filename)})
