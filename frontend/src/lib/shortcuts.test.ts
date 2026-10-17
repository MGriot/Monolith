import { describe, expect, it } from 'vitest';
import { CHORD_TIMEOUT_MS, INITIAL_CHORD, isPaletteShortcut, isTypingTarget, stepShortcut, type ChordState } from './shortcuts';

const body = { tagName: 'BODY' };
const press = (state: ChordState, key: string, target = body, now = 0, mods: Record<string, boolean> = {}) =>
  stepShortcut(state, { key, ...mods }, target, now);

describe('isTypingTarget', () => {
  it('detects inputs, textareas, selects, contenteditable and widget roles', () => {
    expect(isTypingTarget({ tagName: 'INPUT' })).toBe(true);
    expect(isTypingTarget({ tagName: 'textarea' })).toBe(true);
    expect(isTypingTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true);
    expect(isTypingTarget({ tagName: 'DIV', getAttribute: (n) => (n === 'role' ? 'combobox' : null) })).toBe(true);
    expect(isTypingTarget(body)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe('isPaletteShortcut', () => {
  it('needs ctrl or cmd with k and nothing else', () => {
    expect(isPaletteShortcut({ key: 'k', ctrlKey: true })).toBe(true);
    expect(isPaletteShortcut({ key: 'K', metaKey: true })).toBe(true);
    expect(isPaletteShortcut({ key: 'k' })).toBe(false);
    expect(isPaletteShortcut({ key: 'k', ctrlKey: true, shiftKey: true })).toBe(false);
  });
});

describe('stepShortcut', () => {
  it('c creates a task and ? opens help', () => {
    expect(press(INITIAL_CHORD, 'c').action).toEqual({ type: 'create-task' });
    expect(press(INITIAL_CHORD, '?').action).toEqual({ type: 'show-help' });
  });

  it('g then p/t/d navigates', () => {
    const { state } = press(INITIAL_CHORD, 'g', body, 100);
    expect(state.goAt).toBe(100);
    expect(press(state, 'p', body, 200).action).toEqual({ type: 'go', to: '/projects' });
    expect(press(state, 't', body, 200).action).toEqual({ type: 'go', to: '/tasks' });
    expect(press(state, 'd', body, 200).action).toEqual({ type: 'go', to: '/' });
  });

  it('the chord expires and resets on other keys', () => {
    const { state } = press(INITIAL_CHORD, 'g', body, 0);
    expect(press(state, 'p', body, CHORD_TIMEOUT_MS + 1).action).toBeNull();
    expect(press(state, 'x', body, 10).state).toEqual(INITIAL_CHORD);
  });

  it('never fires while typing or with modifiers', () => {
    expect(press(INITIAL_CHORD, 'c', { tagName: 'INPUT' }).action).toBeNull();
    expect(press(INITIAL_CHORD, 'g', { tagName: 'TEXTAREA' }).state).toEqual(INITIAL_CHORD);
    expect(press(INITIAL_CHORD, 'c', body, 0, { ctrlKey: true }).action).toBeNull();
    expect(press(INITIAL_CHORD, 'c', body, 0, { metaKey: true }).action).toBeNull();
    expect(press(INITIAL_CHORD, 'c', body, 0, { defaultPrevented: true }).action).toBeNull();
  });
});
