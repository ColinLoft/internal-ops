# Messaging

Flown channels, direct messages and threads use one compact, left-aligned feed.
Messages display the sender's avatar, name and time without separate chat bubbles.
Consecutive posts by the same sender within five minutes share one header; a new
day or a different sender starts a new group. Legacy messages without a saved
creation date keep individual headers rather than inventing a date.

The formatting toolbar starts visible and can be hidden with the underlined A
button. Select text and use bold, italic,
underline, strikethrough, links, lists, quotes or code. These controls insert
plain-text formatting that renders in the posted message; there is no draft preview. Keyboard
shortcuts are Cmd/Ctrl+B, I, U and K. Enter sends, Shift+Enter inserts a new line.
HTML is displayed as text, not executed. Links support HTTP, HTTPS and email.

Attachments, mentions, a larger emoji picker, clearly labeled polls, reactions,
threads, calls and delivery errors/retry remain available. Record a voice message
with the microphone button, stop to attach it, then send. Recording is limited to
two minutes, requires microphone permission and stops when leaving the composer.
Existing location attachments remain readable, but location sharing is no longer
offered. Seen messages use a quiet dark-gray double check by the time (or grouped
message), with recipient details available on hover and to screen readers.
The list search filters loaded conversations and messages; the feed has no search,
settings or information icons. Click its conversation/channel name for settings.
The feed keeps your place when new messages arrive while you are reading above.
Use Jump to latest to return to the conversation's end.

The conversation list is narrower on desktop; phones retain the list/feed toggle.
Switching conversations resets the composer so a draft is not accidentally sent
to another recipient.

Senders can delete their own messages; the sender and timestamp remain with
"This message was deleted" instead of the original content. If deletion reports
that `public.delete_own_message(p_message_id)` is missing from the schema cache,
run the entire [standalone repair](../supabase/migrations/20261113110000_fix_message_deletion.sql)
in the Supabase SQL Editor for the project used by Flown Ops. It installs the
function, restricts execution to authenticated users, reloads the API schema
cache and returns `message_deletion_installed = true`. It is safe to re-run and
does not depend on the Wildfire bundle. Refresh the app afterward.

Pinned conversations and channels are saved in profile preferences and survive
reloads. Opening a conversation marks its message/mention/reaction notifications
read. Unread channel posts brighten the channel name; ordinary posts do not create
notifications. Only unread mentions add the red channel badge. Unread counts are
loaded from the database, refreshed by Realtime, and polled as a fallback, including
thread replies. Full staff-name mentions (including spaces) are blue and clickable
to open that person's profile.

Reacting to someone else's undeleted message notifies its original sender.
Removing a reaction or reacting to your own message does not. Reaction alerts use
the existing message notification preferences; no reaction email is sent.
Apply the complete [round 3 update](../supabase/flown_qa_round3_update_all.sql)
after round 2 for the reaction trigger, unread-count RPC, deletion repair and
member attachment policies. It does not delete messages or files.

The upper plus button opens channel creation: name/description, public or private
visibility (and selected people), then posting permissions. Admin/coordinator-only
posting creates an announcement channel; everyone can still read, react and reply
in threads. Public channels are available to all staff. Private channels include
their creator and selected staff; workspace managers retain their existing access.
The channel creator and workspace managers can edit settings; other people see
them read-only. The Direct messages plus still starts a DM. Pins are on the preview
row, separate from timestamps, and can also be changed in conversation settings.
