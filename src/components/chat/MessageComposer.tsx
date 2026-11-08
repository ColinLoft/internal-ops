import React, { useState, useRef, useEffect } from 'react';
import {
  Mic,
  MicOff,
  Paperclip,
  Smile,
  ListChecks,
  Send,
  X,
  FileText,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Link,
  List,
  ListOrdered,
  Quote,
  Code,
  SquareCode,
  AtSign,
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { Attachment } from '../../types';
import { formatSelection, type MessageFormat } from './messageLayout';
import { AnimatePresence, motion } from 'framer-motion';

interface MessageComposerProps {
  onSendMessage: (text: string, attachments?: Attachment[]) => void | Promise<void>;
  placeholder?: string;
  isAnnouncementRestricted?: boolean;
}

export const MessageComposer: React.FC<MessageComposerProps> = ({
  onSendMessage,
  placeholder = 'Type your message...',
  isAnnouncementRestricted = false,
}) => {
  const {
    users,
    setIsCreatePollOpen,
  } = useWorkspace();

  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [sendError, setSendError] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [showFormatting, setShowFormatting] = useState(true);
  const [startingRecording, setStartingRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const emojiRef = useRef<HTMLDivElement>(null);
  const mentionRange = useRef({ start: 0, end: 0 });
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mountedRef = useRef(true);
  const draftUrlsRef = useRef(new Set<string>());
  const formatting: { format: MessageFormat; label: string; icon: typeof Bold }[] = [
    { format: 'bold', label: 'Bold', icon: Bold }, { format: 'italic', label: 'Italic', icon: Italic },
    { format: 'underline', label: 'Underline', icon: Underline }, { format: 'strike', label: 'Strikethrough', icon: Strikethrough },
    { format: 'link', label: 'Insert link', icon: Link }, { format: 'numbered', label: 'Numbered list', icon: ListOrdered },
    { format: 'bullets', label: 'Bulleted list', icon: List }, { format: 'quote', label: 'Quote', icon: Quote },
    { format: 'code', label: 'Inline code', icon: Code }, { format: 'codeBlock', label: 'Code block', icon: SquareCode },
  ];
  const applyFormat = (format: MessageFormat) => {
    const area = textareaRef.current;
    if (!area) return;
    const result = formatSelection(text, area.selectionStart, area.selectionEnd, format);
    setText(result.text);
    window.requestAnimationFrame(() => { area.focus(); area.setSelectionRange(result.start, result.end); });
  };
  const insertText = (value: string) => {
    const area = textareaRef.current;
    const start = area?.selectionStart ?? text.length;
    const end = area?.selectionEnd ?? text.length;
    setText(text.slice(0, start) + value + text.slice(end));
    window.requestAnimationFrame(() => { textareaRef.current?.focus(); textareaRef.current?.setSelectionRange(start + value.length, start + value.length); });
  };
  useEffect(() => {
    const area = textareaRef.current;
    if (!area) return;
    area.style.height = 'auto';
    area.style.height = `${Math.min(128, Math.max(44, area.scrollHeight))}px`;
  }, [text]);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const recorder = recorderRef.current;
      if (recorder) { recorder.onstop = null; recorder.ondataavailable = null; if (recorder.state !== 'inactive') recorder.stop(); }
      streamRef.current?.getTracks().forEach(track => track.stop());
      draftUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
    };
  }, []);
  useEffect(() => {
    if (!isRecording) return;
    const timer = window.setInterval(() => setRecordingSeconds(seconds => seconds + 1), 1000);
    return () => window.clearInterval(timer);
  }, [isRecording]);
  useEffect(() => {
    if (isRecording && recordingSeconds >= 120) recorderRef.current?.stop();
  }, [isRecording, recordingSeconds]);

  // Common reactions
  const emojiCategories = [
    '😊', '👍', '❤️', '🎉', '🔥', '🙌', '✨', '🌟', 
    '🤝', '💡', '📋', '📢', '🍁', '🌱', '🕊️', '💼',
    '😀', '😄', '😁', '😂', '🥹', '😍', '😎', '🤔',
    '😅', '😭', '😮', '😴', '👋', '👏', '👌', '✅',
    '💙', '💚', '💜', '🤍', '💪', '🙏', '👀', '🚀',
    '✈️', '🛠️', '📅', '📌', '🎯', '🏆', '⭐', '⚡',
    '☕', '🎂', '🥳', '🤩', '🫡', '🙃', '😬', '🤞',
  ];

  const handleToggleRecording = async () => {
    if (isRecording) {
      recorderRef.current?.stop();
      return;
    }
    if (startingRecording) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setSendError('Audio recording is not supported by this browser.');
      return;
    }
    setStartingRecording(true); setSendError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mountedRef.current) { stream.getTracks().forEach(track => track.stop()); return; }
      streamRef.current = stream;
      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find(type => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      const chunks: Blob[] = [];
      let failed = false;
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => {
        failed = true;
        setSendError('Recording failed. Check your microphone and try again.');
        if (recorder.state !== 'inactive') recorder.stop();
        stream.getTracks().forEach(track => track.stop());
        setIsRecording(false);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop());
        streamRef.current = null; recorderRef.current = null;
        if (!mountedRef.current) return;
        setIsRecording(false);
        if (failed) return;
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        if (!blob.size) { setSendError('No audio was recorded. Try again.'); return; }
        const extension = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm';
        const url = URL.createObjectURL(blob);
        draftUrlsRef.current.add(url);
        setAttachments(previous => [...previous, { id: `audio-${Date.now()}`, name: `Voice message.${extension}`, type: 'audio', size: `${(blob.size / 1024).toFixed(1)} KB`, url }]);
      };
      recorder.start();
      setRecordingSeconds(0); setIsRecording(true);
    } catch (error) {
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      if (mountedRef.current) setSendError(error instanceof Error ? `Could not record audio: ${error.message}` : 'Could not record audio. Allow microphone access and try again.');
    } finally { if (mountedRef.current) setStartingRecording(false); }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      const isImg = file.type.startsWith('image/');
      const newAtt: Attachment = {
        id: `att-${Date.now()}-${Math.random()}`,
        name: file.name,
        size: `${(file.size / 1024).toFixed(1)} KB`,
        type: isImg ? 'image' : file.type.startsWith('audio/') ? 'audio' : 'file',
        url: URL.createObjectURL(file),
      };
      draftUrlsRef.current.add(newAtt.url);
      setAttachments((prev) => [...prev, newAtt]);
    });

    e.target.value = '';
  };

  // Mention trigger check
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setText(val);

    const cursor = e.target.selectionStart;
    const match = val.slice(0, cursor).match(/(?:^|\s)@([^\s@]*)$/);
    if (match) {
      mentionRange.current = { start: cursor - match[1].length - 1, end: cursor };
      setShowMentionMenu(true);
      setMentionQuery(match[1].toLowerCase());
    } else {
      setShowMentionMenu(false);
    }
  };

  const handleSelectMention = (name: string) => {
    const { start, end } = mentionRange.current;
    const replacement = `@${name} `;
    setText(text.slice(0, start) + replacement + text.slice(end));
    setShowMentionMenu(false);
    window.requestAnimationFrame(() => { textareaRef.current?.focus(); textareaRef.current?.setSelectionRange(start + replacement.length, start + replacement.length); });
  };

  const handleSend = () => {
    if (isAnnouncementRestricted) return;
    if (isRecording || startingRecording) { setSendError('Stop recording before sending your message.'); return; }
    if (!text.trim() && attachments.length === 0) return;

    setSendError('');
    let sendResult: void | Promise<void>;
    try {
      sendResult = onSendMessage(text, attachments);
    } catch (error) {
      setSendError(error instanceof Error ? error.message : 'Message was not saved. Please try again.');
      return;
    }
    attachments.forEach(attachment => draftUrlsRef.current.delete(attachment.url));
    setText('');
    setAttachments([]);
    setShowEmojiPicker(false);
    setShowMentionMenu(false);
    void Promise.resolve(sendResult).catch((error: unknown) => {
      setSendError(error instanceof Error ? error.message : 'Message was not saved. Please try again.');
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;
    if ((e.metaKey || e.ctrlKey) && ['b', 'i', 'u', 'k'].includes(e.key.toLowerCase())) {
      e.preventDefault();
      applyFormat(({ b: 'bold', i: 'italic', u: 'underline', k: 'link' } as const)[e.key.toLowerCase() as 'b' | 'i' | 'u' | 'k']);
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Close emoji picker on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setShowEmojiPicker(false); setShowMentionMenu(false); } };
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', handleClickOutside); document.removeEventListener('keydown', escape); };
  }, []);

  if (isAnnouncementRestricted) {
    return (
      <div className="px-3 py-2 text-xs text-slate-400 border-t border-slate-200/70">
        You don't have permission to post here.
      </div>
    );
  }

  return (
    <div className="relative rounded-lg border border-slate-600 bg-white p-1.5 focus-within:border-slate-400">
      {sendError && (
        <p role="alert" className="mb-2 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs text-rose-700">
          {sendError}
        </p>
      )}
      <AnimatePresence initial={false}>
        {showFormatting && <motion.div role="toolbar" aria-label="Message formatting" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.14 }} className="mb-1 flex min-w-0 flex-wrap items-center gap-0.5">
          {formatting.map(({ format, label, icon: Icon }) => <button key={format} type="button" aria-label={label} title={label} onMouseDown={event => event.preventDefault()} onClick={() => applyFormat(format)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-slate-500 hover:bg-slate-100 hover:text-slate-900"><Icon className="h-4 w-4" /></button>)}
        </motion.div>}
      </AnimatePresence>
      {/* Attachment Preview Chips */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2 p-1.5 bg-slate-50 rounded-lg border border-slate-200/60">
          {attachments.map((att) => (
            <div
              key={att.id}
              className="flex items-center gap-1.5 px-2 py-0.5 bg-white border border-slate-200 rounded-md text-xs font-medium text-slate-800 shadow-2xs"
            >
              {att.type === 'audio' ? <Mic className="h-3.5 w-3.5 text-brand-600" /> : <FileText className="w-3.5 h-3.5 text-brand-600" />}
              <span className="max-w-[150px] truncate">{att.name}</span>
              <button
                type="button"
                aria-label={`Remove ${att.name}`}
                onClick={() => { if (draftUrlsRef.current.delete(att.url)) URL.revokeObjectURL(att.url); setAttachments((prev) => prev.filter((a) => a.id !== att.id)); }}
                className="p-0.5 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Autocomplete mention dropdown */}
      {showMentionMenu && (
        <div className="absolute bottom-full left-4 mb-2 w-64 max-w-[calc(100vw-2rem)] bg-white rounded-xl shadow-elevated border border-slate-200 p-1.5 z-40 animate-in fade-in zoom-in-95 duration-150">
          <div className="px-2 py-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Mention Member or Channel
          </div>
          <button
            onClick={() => handleSelectMention('everyone')}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs font-medium text-brand-600 hover:bg-brand-50 rounded-lg text-left"
          >
            <span className="w-5 h-5 rounded-md bg-brand-100 flex items-center justify-center font-bold text-xs">@</span>
            <span>everyone (Notify entire channel)</span>
          </button>
          <button
            onClick={() => handleSelectMention('channel')}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs font-medium text-brand-600 hover:bg-brand-50 rounded-lg text-left"
          >
            <span className="w-5 h-5 rounded-md bg-brand-100 flex items-center justify-center font-bold text-xs">#</span>
            <span>channel (Notify active members)</span>
          </button>
          {users
            .filter((u) => u.name.toLowerCase().includes(mentionQuery))
            .slice(0, 4)
            .map((u) => (
              <button
                key={u.id}
                onClick={() => handleSelectMention(u.name)}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-slate-800 hover:bg-slate-100 rounded-lg text-left"
              >
                <img src={u.avatar} alt={u.name} className="w-5 h-5 rounded-full object-cover" />
                <div className="truncate">
                  <div className="font-medium truncate">{u.name}</div>
                  <div className="text-[11px] text-slate-400 truncate">{u.role}</div>
                </div>
              </button>
            ))}
        </div>
      )}

      {/* Main Textarea */}
      <textarea
        ref={textareaRef}
        value={text}
        onChange={handleTextChange}
        onKeyDown={handleKeyDown}
        rows={1}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full px-2 py-1 text-sm text-slate-900 placeholder:text-slate-400 bg-transparent resize-none outline-none leading-relaxed min-h-[36px] max-h-32"
      />
      {isRecording && <p role="status" className="px-2 py-1 text-xs text-rose-600">Recording · {Math.floor(recordingSeconds / 60)}:{String(recordingSeconds % 60).padStart(2, '0')} · Stop to attach (2 min max)</p>}

      {/* Bottom Tool bar buttons */}
      <div className="flex items-center justify-between gap-2 pt-1">
        <div className="flex min-w-0 flex-wrap items-center gap-0.5 text-slate-400">
          <button type="button" aria-label={showFormatting ? 'Hide formatting' : 'Show formatting'} aria-expanded={showFormatting} onClick={() => setShowFormatting(value => !value)} title="Formatting" className={`flex h-7 w-7 items-center justify-center rounded hover:bg-slate-100 ${showFormatting ? 'text-slate-700' : 'text-slate-400'}`}><span aria-hidden="true" className="text-base underline underline-offset-4">A</span></button>
          <button type="button" onClick={() => {
            const start = textareaRef.current?.selectionStart ?? text.length;
            const prefix = start > 0 && !/\s/.test(text[start - 1]) ? ' @' : '@';
            insertText(prefix);
            mentionRange.current = { start: start + prefix.length - 1, end: start + prefix.length };
            setShowMentionMenu(true); setMentionQuery('');
          }} aria-label="Mention someone" title="Mention someone" className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><AtSign className="h-4 w-4" /></button>
          {/* Voice dictation mic button */}
          <button
            type="button"
            disabled={startingRecording}
            onClick={() => void handleToggleRecording()}
            className={`p-1.5 rounded-lg transition-colors ${
              isRecording
                ? 'bg-rose-500 text-white animate-pulse'
                : 'hover:text-slate-700 hover:bg-slate-100'
            }`}
            title={isRecording ? 'Stop recording' : 'Record a voice message'}
            aria-label={isRecording ? 'Stop recording' : 'Record a voice message'}
          >
            {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>

          {/* Hidden File Input */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            multiple
            className="hidden"
          />

          {/* File attachment */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-1.5 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            title="Attach Files or Images"
            aria-label="Attach files or images"
          >
            <Paperclip className="w-4 h-4" />
          </button>

          {/* Emoji Popover Toggle */}
          <div ref={emojiRef}>
            <button
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className="p-1.5 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              title="Insert Emoji"
              aria-label="Insert emoji"
              aria-expanded={showEmojiPicker}
            >
              <Smile className="w-4 h-4" />
            </button>

            {showEmojiPicker && (
              <div role="group" aria-label="Emoji picker" className="absolute bottom-full left-0 mb-2 max-h-64 overflow-y-auto p-2 bg-white rounded-xl shadow-elevated border border-slate-200 z-50 grid grid-cols-6 gap-1 w-60 max-w-[calc(100vw-2rem)]">
                {emojiCategories.map((em) => (
                  <button
                    key={em}
                    aria-label={`Insert ${em}`}
                    onClick={() => {
                      insertText(em);
                      setShowEmojiPicker(false);
                      textareaRef.current?.focus();
                    }}
                    className="p-1.5 hover:bg-slate-100 rounded-lg text-base text-center transition-transform hover:scale-110"
                  >
                    {em}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Create Poll */}
          <button
            onClick={() => setIsCreatePollOpen(true)}
            className="inline-flex items-center gap-1 p-1.5 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            title="Create Custom Poll"
            aria-label="Create poll"
          >
            <ListChecks className="w-4 h-4" /><span className="text-xs">Poll</span>
          </button>
        </div>

        {/* Send Button */}
        <button
          onClick={handleSend}
          disabled={isRecording || startingRecording || !text.trim() && attachments.length === 0}
          aria-label="Send message"
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-brand-600 px-3 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          <span>Send</span>
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
