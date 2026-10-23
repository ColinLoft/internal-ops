import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://rquiihdtxelqkgnzisek.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJxdWlpaGR0eGVscWtnbnppc2VrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2MjU2MDMsImV4cCI6MjEwODIwMTYwM30.fgaIMhMlmn1KUawm1ZAy01Wd2h42ZS06c5quUjmX3Qg';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

/**
 * Upload an avatar image file to Supabase Storage ('avatars' bucket)
 * Returns the public URL, with intelligent fallback to Base64 data URL
 */
export const uploadAvatarToSupabase = async (file: File, userId: string): Promise<string> => {
  try {
    const fileExt = file.name.split('.').pop() || 'png';
    const fileName = `${userId}-${Date.now()}.${fileExt}`;
    const filePath = `avatars/${fileName}`;

    // Upload to Supabase Storage bucket 'avatars'
    const { error } = await supabase.storage
      .from('avatars')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: true,
      });

    if (error) {
      console.warn('Supabase storage upload error, falling back to local Base64:', error.message);
      return await fileToBase64(file);
    }

    // Get public URL from Supabase
    const { data: publicUrlData } = supabase.storage
      .from('avatars')
      .getPublicUrl(filePath);

    if (publicUrlData && publicUrlData.publicUrl) {
      return publicUrlData.publicUrl;
    }

    return await fileToBase64(file);
  } catch (err) {
    console.warn('Storage operation exception, using Base64 preview:', err);
    return await fileToBase64(file);
  }
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
