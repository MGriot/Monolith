export const STATUS_COLORS: Record<string, { bg: string, border: string, text: string, bar: string, hex: string }> = {
    'Backlog': { bg: 'bg-slate-100', border: 'border-slate-200', text: 'text-slate-600', bar: 'bg-slate-400', hex: '#94a3b8' },
    'Todo': { bg: 'bg-white', border: 'border-slate-200', text: 'text-slate-600', bar: 'bg-slate-500', hex: '#64748b' },
    'In Progress': { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', bar: 'bg-blue-500', hex: '#3b82f6' },
    'On Hold': { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', bar: 'bg-amber-500', hex: '#f59e0b' },
    'Review': { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', bar: 'bg-purple-500', hex: '#a855f7' },
    'Done': { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', bar: 'bg-emerald-500', hex: '#10b981' },
};

export const PRIORITY_COLORS: Record<string, { bg: string, border: string, text: string, marker: string, barBorder: string, hex: string }> = {
    'Low': { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-600', marker: 'bg-blue-500', barBorder: 'border-blue-600', hex: '#2563eb' },
    'Medium': { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-600', marker: 'bg-amber-500', barBorder: 'border-amber-600', hex: '#d97706' },
    'High': { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-600', marker: 'bg-orange-500', barBorder: 'border-orange-600', hex: '#ea580c' },
    'Critical': { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-600', marker: 'bg-red-500', barBorder: 'border-red-600', hex: '#dc2626' },
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
