// Task and project statuses and priorities exactly as the API spells them (backend app/core/enums.py).

/** Workflow order. */
export const STATUSES: readonly string[] = ['Backlog', 'Todo', 'In Progress', 'On hold', 'Review', 'Done'];

/** Lowest first. */
export const PRIORITIES: readonly string[] = ['Low', 'Medium', 'High', 'Critical'];

/** Display label for a status value ('On hold' reads as 'On Hold'). */
export const statusLabel = (status: string): string => (status === 'On hold' ? 'On Hold' : status);

/** Status comparisons are case-insensitive: some views lower-case the value. */
export const isDoneStatus = (status?: string | null): boolean => status?.toLowerCase() === 'done';
