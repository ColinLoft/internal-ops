export function userFacingError(error: unknown, fallback = 'This action could not be completed. Retry, or contact an administrator if it keeps happening.'): string {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error
    : error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' ? error.message : '';
  if (/Could not record audio/i.test(message)) return 'Could not record audio. Allow microphone access in your browser settings, then try again.';
  if (/(?:Flown )?Systems is available to active staff only/i.test(message)) return 'Systems is available to active staff only. Ask an administrator to check your account.';
  if (/row.level security|permission denied|not authorized|access denied|access required|insufficient privilege/i.test(message)) {
    return 'You do not have permission to make this change. Ask an administrator to check your access.';
  }
  if (/duplicate key|unique constraint/i.test(message)) return 'A record with these details already exists. Open the existing record or change the duplicated value.';
  if (/foreign key/i.test(message)) return 'A linked record is no longer available. Refresh the page, choose an available record, and retry.';
  if (/check constraint|not-null constraint|null value in column/i.test(message)) return 'Some required details are missing or invalid. Review the form and retry.';
  if (/schema cache|does not exist|could not find.*(?:table|function|column)|PGRST|SQLSTATE|migration|relation .*|column .*|constraint|violates|invalid input syntax/i.test(message)) {
    return 'This feature needs a workspace update. Ask an administrator to apply the latest database update, then retry.';
  }
  if (/failed to fetch|failed to send.*request|network|timeout|timed out|load failed/i.test(message)) {
    return 'The service could not be reached. Check your connection, then check whether your change was saved before retrying.';
  }
  if (/jwt|token.*expired|unauthenticated|not authenticated|session.*expired/i.test(message)) {
    return 'Your session has expired. Sign in again, then retry.';
  }
  if (/invalid login credentials|invalid email or password/i.test(message)) return 'The email or password is incorrect. Check both and try again.';
  if (/connection lost/i.test(message)) return 'Connection lost. Check your connection, then retry.';
  if (/^(This question is required\.|This form is no longer accepting responses\.|This quote expired|The quote could not be loaded|Flown Systems is available to active staff only\.|Recording failed\.|Audio recording is not supported|Microphone|Use (?:a |an |\d)|The passwords do not match\.|The end time must be after|Add your name|Channel images must be|Clipboard access failed)/.test(message) && !/[{}]|https?:\/\/|public\./i.test(message)) return message;
  // Only deliberate input guidance is safe to show verbatim; backend details are not.
  if (/^(Choose |Select |Add at least |Click at least |Enter |Latitude |Longitude |Coordinates |No location matched|Address lookup |Map tiles |Equipment position could not be saved|Site saved, but |You do not have permission|This feature needs|The service could not be reached|Your session has expired|This action could not be completed)/.test(message) && !/[{}]|https?:\/\/|public\./i.test(message)) return message;
  return fallback;
}
