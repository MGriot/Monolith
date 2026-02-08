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
- **Tech:** Python 3.12, SQLAlchemy (Async), PostgreSQL, Pandas.
- **Key Logic:** Status propagation triggers, recursive dependency validation, JWT security, automated weekly email summaries, and project data exportation (CSV/XLSX).

### 4. User Roles & Collaboration
- **Project Members:** Granular access control at the project level.
- **Decentralized Teams:** Users can form their own teams for activity tracking and collaboration.
- **Admin Oversight:** Global configuration of "Topics" and "Work Types" via a dedicated interface. Restricted management of all users and teams.
- **Security:** Implements bcrypt hashing and admin-triggered password reset flows. Implements optional OAuth2 schemes for standard user registration.

### 5. MCP Server (Model Context Protocol)
- **Role:** AI Interface.
- **Tech:** `mcp` Python library.
- **Function:** Provides a standardized interface for LLMs to read and write project data, acting as a "plugin" for AI agents.

### 5. Database (PostgreSQL)
- **Role:** Persistent storage.
- **Model:** Normalized relational schema enforcing cascading deletes and unique constraints on identifiers.
