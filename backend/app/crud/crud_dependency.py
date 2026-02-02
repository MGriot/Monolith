from typing import List, Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.crud.base import CRUDBase
from app.models.dependency import Dependency
from app.schemas.task import DependencyCreate
from app.core.dependencies import has_cycle

class CRUDDependency(CRUDBase[Dependency, DependencyCreate, DependencyCreate]):
    async def create(self, db: AsyncSession, *, obj_in: DependencyCreate) -> Dependency:
        # 1. Check for self-reference
        if obj_in.successor_id == obj_in.predecessor_id:
            raise ValueError("Item cannot block itself")

        # 2. Check for circular dependency
        # We need the full graph to check. 
        # For simplicity, we fetch all dependencies related to these items or just the whole project?
        # A more robust check fetches the dependency map.
        
        # Build dependency map (Predecessor -> List of Successors)
        # Actually, has_cycle expects Successor -> List of Predecessors (blockers)
        all_deps_res = await db.execute(select(Dependency))
        all_deps = all_deps_res.scalars().all()
        
        dep_map = {}
        for d in all_deps:
            if d.successor_id not in dep_map:
                dep_map[d.successor_id] = []
            dep_map[d.successor_id].append(d.predecessor_id)
            
        # Add the candidate dependency
        if obj_in.successor_id not in dep_map:
            dep_map[obj_in.successor_id] = []
        dep_map[obj_in.successor_id].append(obj_in.predecessor_id)
        
        if has_cycle(obj_in.successor_id, dep_map):
            raise ValueError("Circular dependency detected")

        return await super().create(db, obj_in=obj_in)

    async def get_by_successor(self, db: AsyncSession, successor_id: UUID) -> List[Dependency]:
        result = await db.execute(select(self.model).filter(self.model.successor_id == successor_id))
        return result.scalars().all()

    async def get_by_predecessor(self, db: AsyncSession, predecessor_id: UUID) -> List[Dependency]:
        result = await db.execute(select(self.model).filter(self.model.predecessor_id == predecessor_id))
        return result.scalars().all()

dependency = CRUDDependency(Dependency)
