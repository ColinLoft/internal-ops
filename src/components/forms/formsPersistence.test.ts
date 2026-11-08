import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  getUser: vi.fn(), from: vi.fn(), insert: vi.fn(), select: vi.fn(), single: vi.fn(),
}));
vi.mock('../../lib/supabase', () => ({
  supabase: { auth: { getUser: mock.getUser }, from: mock.from },
}));
import { createCompanyForm } from './formsPersistence';

describe('Company Forms creation identity', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mock.getUser.mockResolvedValue({ data: { user: { id: 'staff-1' } }, error: null });
    mock.from.mockReturnValue({ insert: mock.insert });
    mock.insert.mockReturnValue({ select: mock.select });
    mock.select.mockReturnValue({ single: mock.single });
    mock.single.mockResolvedValue({ data: { id: 'form-1', owner_id: 'staff-1' }, error: null });
  });

  it('inserts as the verified auth user and returns the owner-visible row', async () => {
    await expect(createCompanyForm('staff-1')).resolves.toEqual({ id: 'form-1', owner_id: 'staff-1' });
    expect(mock.from).toHaveBeenCalledWith('company_forms');
    expect(mock.insert).toHaveBeenCalledWith({
      owner_id: 'staff-1', name: 'Untitled form',
      content: { title: 'Untitled form', description: '', questions: [], settings: { acceptingResponses: true } },
    });
    expect(mock.select).toHaveBeenCalledWith('id,owner_id,name,content,updated_at');
  });

  it.each([
    { data: { user: null }, error: null },
    { data: { user: { id: 'another-account' } }, error: null },
    { data: { user: null }, error: { message: 'expired' } },
  ])('never inserts with an absent, expired, or mismatched session: %j', async (result) => {
    mock.getUser.mockResolvedValue(result);
    await expect(createCompanyForm('staff-1')).rejects.toThrow('Sign in again');
    expect(mock.from).not.toHaveBeenCalled();
  });

  it('surfaces policy failures without bypassing RLS or retrying as another owner', async () => {
    mock.single.mockResolvedValue({ data: null, error: { message: 'new row violates row-level security policy' } });
    await expect(createCompanyForm('staff-1')).rejects.toThrow('row-level security');
    expect(mock.insert).toHaveBeenCalledOnce();
  });

  it('requires server confirmation rather than claiming a successful creation', async () => {
    mock.single.mockResolvedValue({ data: null, error: null });
    await expect(createCompanyForm('staff-1')).rejects.toThrow('did not confirm');
  });
});
