import sys
import os
# Add the backend directory to sys.path
sys.path.append(os.path.join(os.getcwd(), "backend"))

from app.core.dependencies import has_cycle, find_cycle
import uuid

def test_cycle_detection():
    # Setup IDs
    a = uuid.uuid4()
    b = uuid.uuid4()
    c = uuid.uuid4()
    d = uuid.uuid4()

    # Case 1: No cycle
    # a -> b -> c
    # a blocked by b, b blocked by c
    graph1 = {
        a: [b],
        b: [c],
        c: []
    }
    assert has_cycle(a, graph1) is False
    print("Case 1 passed (No cycle)")

    # Case 2: Direct cycle
    # a -> b -> a
    graph2 = {
        a: [b],
        b: [a]
    }
    assert has_cycle(a, graph2) is True
    print("Case 2 passed (Direct cycle)")

    # Case 3: Complex cycle
    # a -> b -> c -> a
    graph3 = {
        a: [b],
        b: [c],
        c: [a]
    }
    assert has_cycle(a, graph3) is True
    print("Case 3 passed (Complex cycle)")

    # Case 4: Branching no cycle
    # a -> b, a -> c, b -> d, c -> d
    graph4 = {
        a: [b, c],
        b: [d],
        c: [d],
        d: []
    }
    assert has_cycle(a, graph4) is False
    print("Case 4 passed (Branching no cycle)")

    # Case 5: Path return
    cycle_path = find_cycle(a, lambda x: graph3.get(x, []))
    assert cycle_path is not None
    assert len(cycle_path) == 4
    assert cycle_path[0] == cycle_path[-1]
    print("Case 5 passed (Path return)")

if __name__ == "__main__":
    try:
        test_cycle_detection()
        print("All cycle detection tests passed.")
    except Exception as e:
        print(f"Cycle detection tests failed: {e}")
        sys.exit(1)
