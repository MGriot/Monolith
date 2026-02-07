export const STATUS_COLORS: Record<string, { bg: string, border: string, text: string, bar: string }> = {
    'Backlog': { bg: 'bg-slate-100', border: 'border-slate-200', text: 'text-slate-600', bar: 'bg-slate-400' },
    'Todo': { bg: 'bg-white', border: 'border-slate-200', text: 'text-slate-600', bar: 'bg-slate-500' },
    'In Progress': { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', bar: 'bg-blue-500' },
    'On hold': { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', bar: 'bg-amber-500' },
    'Review': { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', bar: 'bg-purple-500' },
    'Done': { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', bar: 'bg-emerald-500' },
};

export const PRIORITY_COLORS: Record<string, { bg: string, border: string, text: string, marker: string, barBorder: string }> = {
    'Low': { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-600', marker: 'bg-blue-500', barBorder: 'border-blue-600' },
    'Medium': { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-600', marker: 'bg-amber-500', barBorder: 'border-amber-600' },
    'High': { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-600', marker: 'bg-orange-500', barBorder: 'border-orange-600' },
    'Critical': { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-600', marker: 'bg-red-500', barBorder: 'border-red-600' },
};

export const getStatusColors = (status: string) => {
    // Handle both capitalized and lowercase
    const formatted = status.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
    return STATUS_COLORS[formatted] || STATUS_COLORS['Todo'];
};

export const getPriorityColors = (priority: string) => {
    const formatted = priority.charAt(0).toUpperCase() + priority.slice(1).toLowerCase();
    return PRIORITY_COLORS[formatted] || PRIORITY_COLORS['Medium'];
};

export const getGanttBarColor = (item: any) => {
    const statusColors = getStatusColors(item.status);
    const priorityColors = getPriorityColors(item.priority || 'Medium');

    // Status Fill + Priority Border (Thick)
    return `${statusColors.bar} border-2 ${priorityColors.barBorder}`;
};
