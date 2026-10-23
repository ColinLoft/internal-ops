import React, { useState, useRef, useEffect } from 'react';
import {
  Mic,
  MicOff,
  Image,
  Paperclip,
  Smile,
  MapPin,
  Vote,
  Send,
  AtSign,
  X,
  FileText,
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { Attachment } from '../../types';

interface MessageComposerProps {
  onSendMessage: (text: string, attachments?: Attachment[]) => void;
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
  const [isRecording, setIsRecording] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const emojiRef = useRef<HTMLDivElement>(null);

  // Common non-profit emojis
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

        recognition.onresult = (event: SpeechRecognitionEvent) => {
          const transcript = event.results[0][0].transcript;
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
        // Fallback simulation for browsers blocking mic permission
        simulateDictation();
      }
    } else {
      simulateDictation();
    }
  };

  const simulateDictation = () => {
    setIsRecording(true);
    setTimeout(() => {
      setText((prev) => (prev ? `${prev} [Dictated message transcript]` : 'Updating the team on today’s community drive.'));
      setIsRecording(false);
    }, 2000);
  };

  // Attach sample location
  const handleShareLocation = () => {
    const locAtt: Attachment = {
      id: `loc-${Date.now()}`,
      name: 'San Francisco Field Operations Hub',
      type: 'location',
      size: 'GPS Coordinates',
      url: 'https://maps.google.com',
      locationData: {
        label: 'Beacon Community Center, 1850 Mission St, San Francisco, CA',
        latitude: 37.7668,
        longitude: -122.4194,
      },
    };
    setAttachments((prev) => [...prev, locAtt]);
  };

  // File upload simulation
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

    onSendMessage(text, attachments);
    setText('');
    setAttachments([]);
    setShowEmojiPicker(false);
    setShowMentionMenu(false);
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
    <div className="relative bg-white/90 backdrop-blur-xl border border-slate-200/90 rounded-2xl shadow-lg p-2.5 transition-all focus-within:border-brand-500/60 focus-within:ring-4 focus-within:ring-brand-500/10">
      {/* Attachment Preview Chips */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2 p-2 bg-slate-50 rounded-xl border border-slate-200/60">
          {attachments.map((att) => (
            <div
              key={att.id}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 shadow-2xs"
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
        <div className="absolute bottom-full left-4 mb-2 w-64 bg-white rounded-2xl shadow-xl border border-slate-200 p-1.5 z-40 animate-in fade-in zoom-in-95 duration-150">
          <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Mention Member or Channel
          </div>
          <button
            onClick={() => handleSelectMention('everyone')}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs font-semibold text-brand-600 hover:bg-brand-50 rounded-xl text-left"
          >
            <span className="w-6 h-6 rounded-lg bg-brand-100 flex items-center justify-center font-bold">@</span>
            <span>everyone (Notify entire channel)</span>
          </button>
          <button
            onClick={() => handleSelectMention('channel')}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs font-semibold text-brand-600 hover:bg-brand-50 rounded-xl text-left"
          >
            <span className="w-6 h-6 rounded-lg bg-brand-100 flex items-center justify-center font-bold">#</span>
            <span>channel (Notify active members)</span>
          </button>
          {users
            .filter((u) => u.name.toLowerCase().includes(mentionQuery))
            .slice(0, 4)
            .map((u) => (
              <button
                key={u.id}
                onClick={() => handleSelectMention(u.name)}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-slate-800 hover:bg-slate-100 rounded-xl text-left"
              >
                <img src={u.avatar} alt={u.name} className="w-6 h-6 rounded-full object-cover" />
                <div className="truncate">
                  <div className="font-bold truncate">{u.name}</div>
                  <div className="text-[10px] text-slate-400 truncate">{u.role}</div>
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
        className="w-full px-2 py-1 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 bg-transparent resize-none outline-none leading-relaxed min-h-[36px] max-h-32"
      />

      {/* Bottom Tool bar buttons */}
      <div className="flex items-center justify-between pt-1 border-t border-slate-100 mt-1">
        <div className="flex items-center gap-1 text-slate-500">
          {/* Voice dictation mic button */}
          <button
            onClick={handleToggleVoiceDictation}
            className={`p-1.5 rounded-xl transition-all ${
              isRecording
                ? 'bg-rose-500 text-white animate-pulse'
                : 'hover:text-brand-600 hover:bg-slate-100'
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
            className="p-1.5 hover:text-brand-600 hover:bg-slate-100 rounded-xl transition-colors"
            title="Attach Files or Images"
          >
            <Paperclip className="w-4 h-4" />
          </button>

          {/* Emoji Popover Toggle */}
          <div className="relative" ref={emojiRef}>
            <button
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className="p-1.5 hover:text-brand-600 hover:bg-slate-100 rounded-xl transition-colors"
              title="Insert Emoji"
            >
              <Smile className="w-4 h-4" />
            </button>

            {showEmojiPicker && (
              <div className="absolute bottom-full left-0 mb-2 p-2 bg-white rounded-2xl shadow-xl border border-slate-200 z-50 grid grid-cols-4 gap-1 w-48 animate-in fade-in zoom-in-95 duration-150">
                {emojiCategories.map((em) => (
                  <button
                    key={em}
                    onClick={() => {
                      setText((prev) => prev + em);
                      setShowEmojiPicker(false);
                      textareaRef.current?.focus();
                    }}
                    className="p-1.5 hover:bg-slate-100 rounded-lg text-base text-center transition-transform hover:scale-125"
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
            className="p-1.5 hover:text-brand-600 hover:bg-slate-100 rounded-xl transition-colors"
            title="Share Organization Site / Location"
          >
            <MapPin className="w-4 h-4" />
          </button>

          {/* Create Poll */}
          <button
            onClick={() => setIsCreatePollOpen(true)}
            className="p-1.5 hover:text-brand-600 hover:bg-slate-100 rounded-xl transition-colors"
            title="Create Custom Poll"
          >
            <Vote className="w-4 h-4" />
          </button>
        </div>

        {/* Send Button */}
        <button
          onClick={handleSend}
          disabled={!text.trim() && attachments.length === 0}
          className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-40 disabled:hover:bg-brand-600 text-white rounded-xl text-xs font-bold shadow-md shadow-brand-500/20 transition-all active:scale-95"
        >
          <span>Send</span>
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
