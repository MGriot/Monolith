import { describe, expect, it } from 'vitest';
import { parseScene } from './sketch-thumbnail';

describe('parseScene', () => {
  it('accepts .excalidraw documents and whiteboard data', () => {
    expect(parseScene({ type: 'excalidraw', elements: [{ id: 'a' }], files: {} })?.elements).toHaveLength(1);
    expect(parseScene({ elements: [] })).toEqual({ elements: [], files: {}, appState: {} });
  });
  it('rejects anything else', () => {
    expect(parseScene(null)).toBeNull();
    expect(parseScene({ document: {} })).toBeNull();
    expect(parseScene('text')).toBeNull();
  });
});
