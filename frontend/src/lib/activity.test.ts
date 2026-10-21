import { describe, expect, it } from 'vitest';
import type { Comment } from '@/types';
import { actorName, buildTimeline, dayLabel, parseUtc, type ActivityEvent } from './activity';

const comment = (id: string, at: string): Comment => ({
  id, content: 'hi', author_id: 'u1', created_at: at, updated_at: at,
});

const event = (id: string, at: string, extra: Partial<ActivityEvent> = {}): ActivityEvent => ({
  id, project_id: 'p', task_id: 't', task_title: 'Wave 1', actor: { id: 'u2', email: 'sam@example.com', full_name: 'Sam Rivera' } as never,
  actor_label: null, kind: 'status_changed', summary: 'changed status Todo → In Progress', changes: {}, created_at: at, ...extra,
});

describe('parseUtc', () => {
  it('treats naive API timestamps as UTC', () => {
    expect(parseUtc('2026-10-18T10:00:00').toISOString()).toBe('2026-10-18T10:00:00.000Z');
    expect(parseUtc('2026-10-18T10:00:00Z').toISOString()).toBe('2026-10-18T10:00:00.000Z');
  });
});

describe('buildTimeline', () => {
  const now = new Date('2026-10-20T12:00:00Z');
  const comments = [comment('c1', '2026-10-19T09:00:00'), comment('c2', '2026-10-20T09:00:00')];
  const events = [event('e1', '2026-10-19T10:00:00'), event('e2', '2026-10-20T08:00:00')];

  it('interleaves comments and changes by time with one separator per day', () => {
    const items = buildTimeline(comments, events, 'all', now);
    expect(items.map((i) => (i.type === 'day' ? i.label : i.key))).toEqual(['Yesterday', 'c-c1', 'e-e1', 'Today', 'e-e2', 'c-c2']);
  });

  it('filters to comments or changes', () => {
    expect(buildTimeline(comments, events, 'comments', now).filter((i) => i.type === 'event')).toHaveLength(0);
    expect(buildTimeline(comments, events, 'changes', now).filter((i) => i.type === 'comment')).toHaveLength(0);
  });

  it('is empty without anything to show', () => {
    expect(buildTimeline([], [], 'all', now)).toEqual([]);
  });
});

describe('actorName', () => {
  it('names people, you, and automatic changes', () => {
    expect(actorName(event('a', '2026-10-20T08:00:00'))).toBe('Sam Rivera');
    expect(actorName(event('a', '2026-10-20T08:00:00'), 'u2')).toBe('You');
    expect(actorName(event('a', '2026-10-20T08:00:00', { actor: null, actor_label: 'Automation: Notify' }))).toBe('Automation: Notify');
    expect(actorName(event('a', '2026-10-20T08:00:00', { actor: null }))).toBe('Someone');
  });
});

describe('dayLabel', () => {
  it('uses Today / Yesterday, then dates', () => {
    const now = new Date(2026, 9, 20, 12);
    expect(dayLabel(new Date(2026, 9, 20, 1), now)).toBe('Today');
    expect(dayLabel(new Date(2026, 9, 19, 23), now)).toBe('Yesterday');
    expect(dayLabel(new Date(2026, 9, 1), now)).not.toMatch(/Today|Yesterday/);
  });
});
