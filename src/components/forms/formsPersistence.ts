import { supabase } from '../../lib/supabase';

export const createCompanyForm = async (expectedUserId: string) => {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user || user.id !== expectedUserId) {
    throw new Error('Your sign-in session changed or expired. Sign in again before creating a form.');
  }
  const title = 'Untitled form';
  const { data, error } = await supabase.from('company_forms')
    .insert({
      owner_id: user.id,
      name: title,
      content: { title, description: '', questions: [], settings: { acceptingResponses: true } },
    })
    .select('id,owner_id,name,content,updated_at')
    .single();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('The server did not confirm creation.');
  return data;
};
