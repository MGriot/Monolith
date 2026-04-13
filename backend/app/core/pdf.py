import io
import logging
from typing import Dict, Any
from xhtml2pdf import pisa
from jinja2 import Environment, FileSystemLoader, select_autoescape
import os

logger = logging.getLogger(__name__)

class PDFService:
    def __init__(self, templates_dir: str = "app/templates"):
        self.templates_dir = templates_dir
        # Ensure templates directory exists
        if not os.path.exists(self.templates_dir):
            os.makedirs(self.templates_dir, exist_ok=True)
            
        self.jinja_env = Environment(
            loader=FileSystemLoader(self.templates_dir),
            autoescape=select_autoescape(['html', 'xml'])
        )

    def render_template_to_pdf(self, template_name: str, context: Dict[str, Any]) -> io.BytesIO:
        """
        Renders a Jinja2 template with the given context and converts it to a PDF.
        """
        try:
            template = self.jinja_env.get_template(template_name)
            html_content = template.render(context)
            
            pdf_buffer = io.BytesIO()
            pisa_status = pisa.CreatePDF(
                html_content,
                dest=pdf_buffer
            )
            
            if pisa_status.err:
                logger.error(f"PDF generation error: {pisa_status.err}")
                return None
                
            pdf_buffer.seek(0)
            return pdf_buffer
        except Exception as e:
            logger.error(f"Error rendering PDF template {template_name}: {e}")
            return None

    def create_pdf_from_html(self, html_content: str) -> io.BytesIO:
        """
        Converts raw HTML content to a PDF buffer.
        """
        try:
            pdf_buffer = io.BytesIO()
            pisa_status = pisa.CreatePDF(
                html_content,
                dest=pdf_buffer
            )
            
            if pisa_status.err:
                logger.error(f"PDF generation error: {pisa_status.err}")
                return None
                
            pdf_buffer.seek(0)
            return pdf_buffer
        except Exception as e:
            logger.error(f"Error creating PDF from HTML: {e}")
            return None

pdf_service = PDFService()
