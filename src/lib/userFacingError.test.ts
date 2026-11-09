import { describe, expect, it } from 'vitest';
import { userFacingError } from './userFacingError';
describe('safe actionable errors', () => {
  it.each([
    ['new row violates row-level security policy for table secret_table', 'permission'],
    ["Could not find the function public.private_rpc in the schema cache", 'workspace update'],
    ['column private_name does not exist', 'workspace update'],
    ['Failed to send a request to the Edge Function', 'connection'],
    ['JWT expired', 'Sign in again'],
    ['duplicate key value violates unique constraint private_key', 'already exists'],
    ['violates foreign key constraint private_fk', 'linked record'],
  ])('does not expose backend internals: %s', (message, action) => {
    const result = userFacingError({ message });
    expect(result).toContain(action);
    expect(result).not.toMatch(/secret_table|private_name|private_rpc|schema cache|JWT|Edge Function/);
  });
  it('preserves deliberate input guidance and hides unknown backend details', () => {
    expect(userFacingError(new Error('Choose a prospect first.'))).toBe('Choose a prospect first.');
    expect(userFacingError(new Error('secret backend implementation detail'), 'Retry this action.')).toBe('Retry this action.');
  });
});
