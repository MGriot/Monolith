from typing import List, Dict, Set, Optional
from uuid import UUID

def has_cycle(
    target_id: UUID,
    blocked_by_map: Dict[UUID, List[UUID]]
) -> bool:
    """
    Detects if adding a dependency (Successor -> Predecessor) creates a cycle.
    In our model:
    - Successor is blocked by Predecessor.
    - target_id is the Successor.
    - blocked_by_map is a dictionary where keys are items and values are lists of items they are blocked by.
    
    This uses a Depth First Search (DFS) to find if the target_id can reach itself
    by following the 'blocked_by' links.
    """
    visited = set()
    stack = set()

    def dfs(current_id: UUID) -> bool:
        visited.add(current_id)
        stack.add(current_id)
        
        predecessors = blocked_by_map.get(current_id, [])
        for pred_id in predecessors:
            if pred_id not in visited:
                if dfs(pred_id):
                    return True
            elif pred_id in stack:
                return True
        
        stack.remove(current_id)
        return False

    return dfs(target_id)

def find_cycle(
    start_node: UUID,
    neighbors_func
) -> Optional[List[UUID]]:
    """
    A more generic cycle detection that returns the path if a cycle is found.
     neighbors_func: lambda uuid: List[UUID] (returns predecessors/blockers)
    """
    visited = set()
    path = []

    def visit(u: UUID):
        if u in path:
            # Cycle found! Return the slice from first occurrence to end
            return path[path.index(u):] + [u]
        
        if u in visited:
            return None
            
        visited.add(u)
        path.append(u)
        
        for v in neighbors_func(u):
            res = visit(v)
            if res:
                return res
                
        path.pop()
        return None

    return visit(start_node)
