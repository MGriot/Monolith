FROM python:3.12-slim

WORKDIR /app

# Install system dependencies (for psycopg2)
RUN apt-get update && apt-get install -y gcc libpq-dev && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN pip install --no-cache-dir mcp[cli]

# Copy the backend app code to preserve imports
COPY backend/app /app/app

# Copy the MCP entrypoint
COPY mcp/main.py /app/main.py

# Set python path
ENV PYTHONPATH=/app

CMD ["tail", "-f", "/dev/null"]
