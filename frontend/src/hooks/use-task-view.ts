import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  filterTasks, groupTasks, parseFilters, serializeFilters, sortTasks,
  type FilterableTask, type TaskFilters, type TaskGroup,
} from '@/lib/task-filters';

/**
 * Task view state (filters, sort, group) kept in the URL query string so it is shareable and survives reload.
 * Returns the derived, ready-to-render task list alongside the setters.
 */
export function useTaskView<T extends FilterableTask>(tasks: T[]) {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => parseFilters(params), [params]);

  const setFilters = useCallback(
    (next: TaskFilters) => setParams((prev) => serializeFilters(next, prev), { replace: true }),
    [setParams],
  );

  const filtered = useMemo(() => filterTasks(tasks, filters), [tasks, filters]);
  const sorted = useMemo(() => sortTasks(filtered, filters), [filtered, filters]);
  const groups: TaskGroup<T>[] = useMemo(() => groupTasks(sorted, filters.group), [sorted, filters.group]);

  return { filters, setFilters, filtered, sorted, groups };
}
