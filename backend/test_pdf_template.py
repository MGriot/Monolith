import sys
import os
import asyncio
from datetime import datetime
from uuid import uuid4

# Setup path and dummy env
sys.path.append(os.getcwd())
os.environ["DATABASE_URL"] = "postgresql+asyncpg://user:pass@localhost/db"
os.environ["SECRET_KEY"] = "testing_secret"

from app.core.pdf import PDFService

async def test_pdf_template():
    print("Testing PDF Template Rendering...")
    
    # Initialize service pointing to the templates dir relative to backend root
    service = PDFService(templates_dir="app/templates")
    
    # Dummy context
    context = {
        "report_date": datetime.now().strftime('%b %d, %Y %I:%M %p'),
        "project": {
            "name": "Project Alpha",
            "description": "A high-stakes mission to the edge of the galaxy.",
            "progress_percent": 65,
            "tasks_done": 12,
            "status": "In Progress",
            "owner": {"full_name": "John Doe", "email": "john@example.com"},
            "gantt_regions": [
                {"name": "Design Phase", "start_date": "2026-01-01", "end_date": "2026-02-01"}
            ]
        },
        "tasks": [
            {
                "wbs_code": "1",
                "title": "Initial Scoping",
                "description": "Identify all key stakeholders.",
                "level": 0,
                "assignees": [{"full_name": "Alice Smith"}],
                "due_date": datetime.now(),
                "priority": "High",
                "status": "Done"
            },
            {
                "wbs_code": "1.1",
                "title": "Stakeholder Interviews",
                "description": "Gather requirements.",
                "level": 1,
                "assignees": [{"full_name": "Bob Jones"}],
                "due_date": datetime.now(),
                "priority": "Medium",
                "status": "In Progress"
            }
        ]
    }
    
    pdf_buffer = service.render_template_to_pdf("reports/project_status.html", context)
    
    if pdf_buffer:
        size = len(pdf_buffer.getvalue())
        print(f"PASS: PDF generated successfully. Size: {size} bytes")
        # Save for manual verification if possible, but PASS is enough for automation
        # with open("test_report.pdf", "wb") as f:
        #     f.write(pdf_buffer.getvalue())
    else:
        print("FAIL: PDF generation failed.")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(test_pdf_template())
