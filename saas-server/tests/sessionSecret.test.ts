import { describe, it, expect } from 'vitest';
import { resolveSessionSecret } from '../src/app.js';

describe('resolveSessionSecret', () => {
  it('uses SESSION_SECRET when set', () => {
    expect(resolveSessionSecret({ SESSION_SECRET: 's3cret', NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toBe('s3cret');
  });
  it('refuses to start in production without it', () => {
    expect(() => resolveSessionSecret({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toThrow(/SESSION_SECRET/);
  });
  it('keeps a dev fallback outside production', () => {
    expect(resolveSessionSecret({ NODE_ENV: 'development' } as NodeJS.ProcessEnv)).toMatch(/dev-secret/);
    expect(resolveSessionSecret({} as NodeJS.ProcessEnv)).toMatch(/dev-secret/);
  });
});
