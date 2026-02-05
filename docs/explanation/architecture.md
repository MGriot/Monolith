# Explanation: System Architecture

Monolith is designed as a modular suite of services orchestrated via Docker.

## Component Overview

### 1. Nginx (Reverse Proxy)
- **Role:** Entry point for all traffic.
- **Function:** Routes `/api/` to the backend and all other traffic to the React frontend. Handles static file serving for uploads.

### 2. Frontend (React 19 + TypeScript)
- **Role:** Presentation layer.
- **Tech:** Vite, Tailwind CSS, Shadcn/UI.
- **Key Logic:** Real-time Gantt rendering via SVG and drag-and-drop state management via `@dnd-kit`.

### 3. Backend (FastAPI)
- **Role:** Application logic & Data persistence.
- **Tech:** Python 3.12, SQLAlchemy (Async), PostgreSQL.
- **Key Logic:** Status propagation triggers, recursive dependency validation, JWT security, and dynamic metadata management.

### 4. Admin & Security
- **Role:** System configuration and user oversight.
- **Function:** Admins can manage global "Topics" and "Work Types" via a dedicated interface. Sensitive pages like Team Management and Metadata Settings are restricted to superusers.
- **Password Safety:** Implements direct bcrypt hashing and provides admin-triggered password reset flows.

### 5. MCP Server (Model Context Protocol)
- **Role:** AI Interface.
- **Tech:** `mcp` Python library.
- **Function:** Provides a standardized interface for LLMs to read and write project data, acting as a "plugin" for AI agents.

### 5. Database (PostgreSQL)
- **Role:** Persistent storage.
- **Model:** Normalized relational schema enforcing cascading deletes and unique constraints on identifiers.
