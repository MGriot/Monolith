export const STATUS_COLORS: Record<string, { bg: string, border: string, text: string, bar: string, hex: string }> = {
    'Backlog': { bg: 'bg-muted', border: 'border-border', text: 'text-fg-soft', bar: 'bg-fg-faint', hex: '#94a3b8' },
    'Todo': { bg: 'bg-background', border: 'border-border', text: 'text-fg-soft', bar: 'bg-muted-foreground', hex: '#64748b' },
    'In Progress': { bg: 'bg-blue-50 dark:bg-blue-500/10', border: 'border-blue-200 dark:border-blue-500/30', text: 'text-blue-700 dark:text-blue-300', bar: 'bg-blue-500', hex: '#3b82f6' },
    'On Hold': { bg: 'bg-amber-50 dark:bg-amber-500/10', border: 'border-amber-200 dark:border-amber-500/30', text: 'text-amber-700 dark:text-amber-300', bar: 'bg-amber-500', hex: '#f59e0b' },
    'Review': { bg: 'bg-purple-50 dark:bg-purple-500/10', border: 'border-purple-200 dark:border-purple-500/30', text: 'text-purple-700 dark:text-purple-300', bar: 'bg-purple-500', hex: '#a855f7' },
    'Done': { bg: 'bg-emerald-50 dark:bg-emerald-500/10', border: 'border-emerald-200 dark:border-emerald-500/30', text: 'text-emerald-700 dark:text-emerald-300', bar: 'bg-emerald-500', hex: '#10b981' },
};

export const PRIORITY_COLORS: Record<string, { bg: string, border: string, text: string, marker: string, barBorder: string, hex: string }> = {
    'Low': { bg: 'bg-blue-50 dark:bg-blue-500/10', border: 'border-blue-200 dark:border-blue-500/30', text: 'text-blue-600 dark:text-blue-400', marker: 'bg-blue-500', barBorder: 'border-blue-600', hex: '#2563eb' },
    'Medium': { bg: 'bg-amber-50 dark:bg-amber-500/10', border: 'border-amber-200 dark:border-amber-500/30', text: 'text-amber-600 dark:text-amber-400', marker: 'bg-amber-500', barBorder: 'border-amber-600', hex: '#d97706' },
    'High': { bg: 'bg-orange-50 dark:bg-orange-500/10', border: 'border-orange-200 dark:border-orange-500/30', text: 'text-orange-600 dark:text-orange-400', marker: 'bg-orange-500', barBorder: 'border-orange-600', hex: '#ea580c' },
    'Critical': { bg: 'bg-red-50 dark:bg-red-500/10', border: 'border-red-200 dark:border-red-500/30', text: 'text-red-600 dark:text-red-400', marker: 'bg-red-500', barBorder: 'border-red-600', hex: '#dc2626' },
};

export const getStatusColors = (status: string) => {
    // Handle both capitalized and lowercase
    const formatted = status.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
    return STATUS_COLORS[formatted] || STATUS_COLORS['Todo'];
};

export const getStatusHex = (status: string) => {
    return getStatusColors(status).hex;
};

export const getPriorityColors = (priority: string) => {
    const formatted = priority.charAt(0).toUpperCase() + priority.slice(1).toLowerCase();
    return PRIORITY_COLORS[formatted] || PRIORITY_COLORS['Medium'];
};

export const getPriorityHex = (priority: string) => {
    return getPriorityColors(priority).hex;
};

export const getPriorityBorderClass = (priority?: string) => {
    return getPriorityColors(priority || 'Medium').barBorder;
};

export const getGanttBarColor = (item: any) => {
    const statusColors = getStatusColors(item.status);
    const priorityColors = getPriorityColors(item.priority || 'Medium');

    // Status Fill + Priority Border (Thick)
    return `${statusColors.bar} border-2 ${priorityColors.barBorder}`;
};
