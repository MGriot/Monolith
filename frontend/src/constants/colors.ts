// Classes come from the semantic tokens in index.css (info / warning / review / success / danger), so light and dark stay in step.
export const STATUS_COLORS: Record<string, { bg: string, border: string, text: string, bar: string, hex: string }> = {
    'Backlog': { bg: 'bg-muted', border: 'border-border', text: 'text-fg-soft', bar: 'bg-fg-faint', hex: '#94a3b8' },
    'Todo': { bg: 'bg-background', border: 'border-border', text: 'text-fg-soft', bar: 'bg-muted-foreground', hex: '#64748b' },
    'In Progress': { bg: 'bg-info-soft', border: 'border-info/30', text: 'text-info', bar: 'bg-info', hex: '#3b82f6' },
    'On Hold': { bg: 'bg-warning-soft', border: 'border-warning/30', text: 'text-warning', bar: 'bg-warning', hex: '#f59e0b' },
    'Review': { bg: 'bg-review-soft', border: 'border-review/30', text: 'text-review', bar: 'bg-review', hex: '#a855f7' },
    'Done': { bg: 'bg-success-soft', border: 'border-success/30', text: 'text-success', bar: 'bg-success', hex: '#10b981' },
};

export const PRIORITY_COLORS: Record<string, { bg: string, border: string, text: string, marker: string, barBorder: string, hex: string }> = {
    'Low': { bg: 'bg-info-soft', border: 'border-info/30', text: 'text-info', marker: 'bg-info', barBorder: 'border-blue-600', hex: '#2563eb' },
    'Medium': { bg: 'bg-warning-soft', border: 'border-warning/30', text: 'text-warning', marker: 'bg-warning', barBorder: 'border-amber-600', hex: '#d97706' },
    'High': { bg: 'bg-orange-50 dark:bg-orange-500/10', border: 'border-orange-200 dark:border-orange-500/30', text: 'text-orange-600 dark:text-orange-400', marker: 'bg-orange-500', barBorder: 'border-orange-600', hex: '#ea580c' },
    'Critical': { bg: 'bg-danger-soft', border: 'border-danger/30', text: 'text-danger', marker: 'bg-danger', barBorder: 'border-red-600', hex: '#dc2626' },
};

/** Swatches offered by every colour picker (topics, work types, Gantt bars). */
export const COLOR_PRESETS: { name: string; value: string }[] = [
    { name: 'Blue', value: '#3b82f6' },
    { name: 'Indigo', value: '#6366f1' },
    { name: 'Purple', value: '#a855f7' },
    { name: 'Rose', value: '#f43f5e' },
    { name: 'Orange', value: '#f97316' },
    { name: 'Amber', value: '#f59e0b' },
    { name: 'Emerald', value: '#10b981' },
    { name: 'Teal', value: '#14b8a6' },
    { name: 'Slate', value: '#64748b' },
];

/** First preset not already in use, so quick-add rows get distinct colours. */
export const nextPresetColor = (used: readonly string[]) => {
    const taken = new Set(used.map(c => c.toLowerCase()));
    return (COLOR_PRESETS.find(p => !taken.has(p.value)) ?? COLOR_PRESETS[used.length % COLOR_PRESETS.length]).value;
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
