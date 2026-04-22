import { describe, it, expect } from 'vitest';
import { createZeussit, createModeratorGuard, ZeussitError } from '../src/index.js';

describe('public API', () => {
  it('exports the expected symbols', () => {
    expect(typeof createZeussit).toBe('function');
    expect(typeof createModeratorGuard).toBe('function');
    expect(typeof ZeussitError).toBe('function');
  });
});
