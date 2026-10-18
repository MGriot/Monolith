import { describe, expect, it } from 'vitest';
import { filterTaxonomy, groupTaxonomy, scopeOf } from './taxonomy';

const items = [
  { id: '1', name: 'frontend', is_active: true },
  { id: '2', name: 'Backend', is_active: true },
  { id: '3', name: 'SEO', is_active: true, project_id: 'p1' },
  { id: '4', name: 'Legacy', is_active: false },
  { id: '5', name: 'Copy', is_active: true, project_id: 'p2' },
  { id: '6', name: 'One-off', is_active: true, project_id: 'p1', task_id: 't1' },
];

describe('scopeOf', () => {
  it('prefers task over project over global', () => {
    expect(scopeOf(items[0])).toBe('global');
    expect(scopeOf(items[2])).toBe('project');
    expect(scopeOf(items[5])).toBe('task');
  });
});

describe('filterTaxonomy', () => {
  it('hides inactive items unless asked', () => {
    expect(filterTaxonomy(items, { search: '', scope: 'all', showInactive: false }).map(i => i.id)).not.toContain('4');
    expect(filterTaxonomy(items, { search: '', scope: 'all', showInactive: true }).map(i => i.id)).toContain('4');
  });

  it('filters by scope and case-insensitive name', () => {
    expect(filterTaxonomy(items, { search: 'END', scope: 'all', showInactive: true }).map(i => i.id)).toEqual(['1', '2']);
    expect(filterTaxonomy(items, { search: '', scope: 'project', showInactive: true }).map(i => i.id)).toEqual(['3', '5']);
  });
});

describe('groupTaxonomy', () => {
  it('orders global, projects by name, then single tasks', () => {
    const names = new Map([['p1', 'Website'], ['p2', 'App']]);
    const groups = groupTaxonomy(items, names);
    expect(groups.map(g => g.label)).toEqual(['Global', 'App', 'Website', 'Single tasks']);
    expect(groups[0].items.map(i => i.name)).toEqual(['Backend', 'frontend', 'Legacy']);
  });

  it('labels projects it cannot name', () => {
    expect(groupTaxonomy([items[2]], new Map())[0].label).toBe('Unknown project');
  });
});
