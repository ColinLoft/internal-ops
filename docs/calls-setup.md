# Voice and video calls

Calls use Supabase for invitations and LiveKit for real-time audio, video, and screen sharing. Both services must be configured; a working chat connection alone does not provide call media.

## Required deployment

1. Apply `supabase/migrations/20261023000000_add_call_sessions.sql` to the workspace database. It creates participant-scoped call sessions and enables Supabase Realtime for invitations.
2. Create a LiveKit Cloud project, then add these values under the Supabase project's Edge Function secrets. Do not put the API secret in browser variables, source control, or chat:
   - `LIVEKIT_URL`: the project's secure WebSocket URL (`wss://...`)
   - `LIVEKIT_API_KEY`
   - `LIVEKIT_API_SECRET`
3. Deploy the token function from the repository root:

   ```sh
   supabase functions deploy livekit-token
   ```

4. Confirm the function is deployed and check its logs for configuration or token errors.
5. Test from two signed-in browsers on separate devices or networks. Allow microphone access in both browsers. For video, allow camera access as well.

Calls support up to eight participants. The UI can recover invitations if Supabase Realtime briefly drops, and offers reconnect and audio-playback recovery controls. It cannot replace a configured LiveKit service or browser microphone permission.

## Troubleshooting

- **Call service is not configured:** check the three LiveKit secrets and redeploy `livekit-token`.
- **Call cannot connect:** inspect the function logs and verify `LIVEKIT_URL` is the secure WebSocket URL for the same project as the key and secret.
- **You cannot be heard:** check browser microphone permission and the microphone selection under Settings. The call stays connected if microphone setup fails and offers a retry control.
- **You cannot hear others:** use **Turn on audio** in the call if the browser blocks playback; check the device's output volume and the browser's tab audio setting.
- **Invitations do not appear immediately:** verify `call_sessions` is included in Supabase Realtime and inspect the browser console for Realtime errors. The app polls for invitations as a fallback.
