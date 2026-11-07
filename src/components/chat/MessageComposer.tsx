import React, { useState, useRef, useEffect } from 'react';
import {
  Mic,
  MicOff,
  Paperclip,
  Smile,
  MapPin,
  Vote,
  Send,
  X,
  FileText,
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { Attachment } from '../../types';

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

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const emojiRef = useRef<HTMLDivElement>(null);

  // Common reactions
  const emojiCategories = [
    '😊', '👍', '❤️', '🎉', '🔥', '🙌', '✨', '🌟', 
    '🤝', '💡', '📋', '📢', '🍁', '🌱', '🕊️', '💼'
  ];

  // Speech-to-text / voice dictation
  const handleToggleVoiceDictation = () => {
    if (isRecording) {
      setIsRecording(false);
      return;
    }

    const SpeechRecognition =
      (window as unknown as { SpeechRecognition: typeof SpeechRecognition }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition: typeof SpeechRecognition }).webkitSpeechRecognition;

    if (SpeechRecognition) {
      try {
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        setIsRecording(true);

        recognition.onresult = (event: Event) => {
          const resultEvent = event as Event & { results: SpeechRecognitionResultList };
          const transcript = resultEvent.results[0][0].transcript;
          setText((prev) => (prev ? `${prev} ${transcript}` : transcript));
          setIsRecording(false);
        };

        recognition.onerror = () => {
          setIsRecording(false);
        };

        recognition.onend = () => {
          setIsRecording(false);
        };

        recognition.start();
      } catch {
        setSendError('Voice dictation could not start. Check microphone permissions and try again.');
        setIsRecording(false);
      }
    } else {
      setSendError('Voice dictation is not supported by this browser.');
    }
  };

  const handleShareLocation = () => {
    if (!navigator.geolocation) {
      setSendError('Location sharing is not supported by this browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const latitude = Number(coords.latitude.toFixed(6));
        const longitude = Number(coords.longitude.toFixed(6));
        setAttachments((prev) => [...prev, {
          id: `loc-${Date.now()}`,
          name: 'Shared location',
          type: 'location',
          size: 'GPS coordinates',
          url: `https://maps.google.com/?q=${latitude},${longitude}`,
          locationData: { label: `${latitude}, ${longitude}`, latitude, longitude },
        }]);
      },
      () => setSendError('Location could not be shared. Allow location access and try again.'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
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
        type: isImg ? 'image' : 'file',
        url: URL.createObjectURL(file),
      };
      setAttachments((prev) => [...prev, newAtt]);
    });

    e.target.value = '';
  };

  // Mention trigger check
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setText(val);

    const lastWord = val.split(/\s+/).pop() || '';
    if (lastWord.startsWith('@')) {
      setShowMentionMenu(true);
      setMentionQuery(lastWord.slice(1).toLowerCase());
    } else {
      setShowMentionMenu(false);
    }
  };

  const handleSelectMention = (name: string) => {
    const words = text.split(/\s+/);
    words.pop(); // remove incomplete mention
    const newText = words.length > 0 ? `${words.join(' ')} @${name} ` : `@${name} `;
    setText(newText);
    setShowMentionMenu(false);
    textareaRef.current?.focus();
  };

  const handleSend = () => {
    if (isAnnouncementRestricted) return;
    if (!text.trim() && attachments.length === 0) return;

    setSendError('');
    let sendResult: void | Promise<void>;
    try {
      sendResult = onSendMessage(text, attachments);
    } catch (error) {
      setSendError(error instanceof Error ? error.message : 'Message was not saved. Please try again.');
      return;
    }
    setText('');
    setAttachments([]);
    setShowEmojiPicker(false);
    setShowMentionMenu(false);
    void Promise.resolve(sendResult).catch((error: unknown) => {
      setSendError(error instanceof Error ? error.message : 'Message was not saved. Please try again.');
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
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
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (isAnnouncementRestricted) {
    return (
      <div className="px-3 py-2 text-xs text-slate-400 border-t border-slate-200/70">
        You don't have permission to post here.
      </div>
    );
  }

  return (
    <div className="relative bg-white border border-slate-200/90 rounded-xl shadow-subtle p-2 transition-all focus-within:border-brand-500/80 focus-within:ring-2 focus-within:ring-brand-500/15">
      {sendError && (
        <p role="alert" className="mb-2 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs text-rose-700">
          Message was not saved: {sendError}
        </p>
      )}
      {/* Attachment Preview Chips */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2 p-1.5 bg-slate-50 rounded-lg border border-slate-200/60">
          {attachments.map((att) => (
            <div
              key={att.id}
              className="flex items-center gap-1.5 px-2 py-0.5 bg-white border border-slate-200 rounded-md text-xs font-medium text-slate-800 shadow-2xs"
            >
              {att.type === 'location' ? (
                <MapPin className="w-3.5 h-3.5 text-rose-500" />
              ) : (
                <FileText className="w-3.5 h-3.5 text-brand-600" />
              )}
              <span className="max-w-[150px] truncate">{att.name}</span>
              <button
                onClick={() => setAttachments((prev) => prev.filter((a) => a.id !== att.id))}
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
        className="w-full px-2 py-1 text-sm text-slate-900 placeholder:text-slate-400 bg-transparent resize-none outline-none leading-relaxed min-h-[36px] max-h-32"
      />

      {/* Bottom Tool bar buttons */}
      <div className="flex items-center justify-between pt-1 border-t border-slate-100 mt-1">
        <div className="flex items-center gap-0.5 text-slate-400">
          {/* Voice dictation mic button */}
          <button
            onClick={handleToggleVoiceDictation}
            className={`p-1.5 rounded-lg transition-all ${
              isRecording
                ? 'bg-rose-500 text-white animate-pulse'
                : 'hover:text-slate-700 hover:bg-slate-100'
            }`}
            title="Speech-to-Text / Voice Dictation"
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
          >
            <Paperclip className="w-4 h-4" />
          </button>

          {/* Emoji Popover Toggle */}
          <div className="relative" ref={emojiRef}>
            <button
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className="p-1.5 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              title="Insert Emoji"
            >
              <Smile className="w-4 h-4" />
            </button>

            {showEmojiPicker && (
              <div className="absolute bottom-full left-0 mb-2 p-2 bg-white rounded-xl shadow-elevated border border-slate-200 z-50 grid grid-cols-4 gap-1 w-48 max-w-[calc(100vw-2rem)] animate-in fade-in zoom-in-95 duration-150">
                {emojiCategories.map((em) => (
                  <button
                    key={em}
                    onClick={() => {
                      setText((prev) => prev + em);
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

          {/* Share location */}
          <button
            onClick={handleShareLocation}
            className="p-1.5 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            title="Share Organization Site / Location"
          >
            <MapPin className="w-4 h-4" />
          </button>

          {/* Create Poll */}
          <button
            onClick={() => setIsCreatePollOpen(true)}
            className="p-1.5 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            title="Create Custom Poll"
          >
            <Vote className="w-4 h-4" />
          </button>
        </div>

        {/* Send Button */}
        <button
          onClick={handleSend}
          disabled={!text.trim() && attachments.length === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 disabled:hover:bg-brand-600 text-white rounded-lg text-xs font-medium shadow-xs transition-all active:scale-98"
        >
          <span>Send</span>
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
