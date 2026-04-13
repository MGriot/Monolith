from typing import List, Optional
from uuid import UUID
from pydantic import BaseModel

class ProjectHealth(BaseModel):
    id: UUID
    name: str
    progress: float
    status: str
    health_score: float # 0 to 100
    overdue_tasks: int
    critical_path_tasks: int
    risk_level: str # "Low", "Medium", "High"
    variance_days: int # Planned vs Actual/Current

class PortfolioHealthResponse(BaseModel):
    projects: List[ProjectHealth]
    total_active: int
    average_progress: float
    critical_projects: int
