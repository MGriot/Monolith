# Monolith Project Planner - Access Information

## 🚀 Application URLs
- **Frontend**: [http://localhost:8080](http://localhost:8080)
- **API Documentation**: [http://localhost:8080/api/docs](http://localhost:8080/api/docs)
- **MCP Module**: [http://localhost:8080/mcp](http://localhost:8080/mcp)

## 🔑 Test Credentials

### Admin User (Full Privileges)
- **Email**: `admin@admin.com`
- **Password**: `admin123`

### Standard Test User
- **Email**: `tester@example.com`
- **Password**: `testpassword123`

## 🛠️ Key Features
- **Hierarchical Management**: Projects -> Tasks -> Subtasks.
- **Visualizations**: Kanban Board, Gantt Charts, and Activity Heatmaps.
- **Dependencies**: Finish-to-Start task blocking with cycle detection.
- **Attachments**: File upload and preview support.
- **Real-time**: Notification system for assignments and unblocking.
- **Markdown**: Support for rich text descriptions.

## 📦 Deployment
The application is fully dockerized. To restart the stack:
```bash
docker-compose down
docker-compose up --build -d
```
