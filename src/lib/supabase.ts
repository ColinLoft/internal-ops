import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = createClient(
  supabaseUrl || 'https://supabase-config-missing.invalid',
  supabaseAnonKey || 'supabase-config-missing',
  {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  },
);

const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

/**
 * Upload an image to the public 'avatars' bucket under the signed-in user's folder and return its URL.
 * Throws a readable error instead of saving oversized data URLs into the profile.
 */
export const uploadAvatarToSupabase = async (file: File, userId: string, label = 'avatar'): Promise<string> => {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file (PNG, JPG, WebP or GIF).');
  if (file.size > AVATAR_MAX_BYTES) throw new Error('That image is larger than 5 MB. Choose a smaller photo.');
  const fileExt = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
  const filePath = `${userId}/${label}-${Date.now()}.${fileExt}`;

  const { error } = await supabase.storage
    .from('avatars')
    .upload(filePath, file, { cacheControl: '3600', upsert: true, contentType: file.type });
  if (error) throw new Error(`The photo could not be uploaded: ${error.message}`);

  const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
  if (!data?.publicUrl) throw new Error('The photo uploaded, but its link could not be created.');
  return data.publicUrl;
};

/**
 * Convert File to Base64 String for persistent preview fallback
 */
export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });
};

/**
 * Test connectivity to Supabase instance
 */
export const testSupabaseConnection = async (): Promise<{ success: boolean; message: string }> => {
  try {
    const { error } = await supabase.from('profiles').select('id').limit(1);
    if (error && error.code !== 'PGRST116') {
      if (
        error.code === 'PGRST205'
        || error.message.includes("Could not find the table 'public.profiles'")
        || error.message.includes('relation')
        || error.message.includes('does not exist')
      ) {
        return {
          success: false,
          message: 'Connected to Supabase, but the required tables are missing. Run supabase_schema.sql in the Supabase SQL Editor.',
        };
      }
      return { success: false, message: error.message };
    }
    return { success: true, message: 'Connected to Supabase backend!' };
  } catch (err: unknown) {
    return { success: false, message: (err as Error).message || 'Connection failed' };
  }
};
