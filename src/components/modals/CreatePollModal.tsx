import React, { useState } from 'react';
import { X, Vote, Plus, Trash2 } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { Poll } from '../../types';

export const CreatePollModal: React.FC = () => {
  const {
    isCreatePollOpen,
    setIsCreatePollOpen,
    sendMessage,
    currentUser,
  } = useWorkspace();

  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);

  if (!isCreatePollOpen) return null;

  const handleAddOption = () => {
    if (options.length < 6) {
      setOptions([...options, '']);
    }
  };

  const handleRemoveOption = (index: number) => {
    if (options.length > 2) {
      setOptions(options.filter((_, i) => i !== index));
    }
  };

  const handleOptionChange = (text: string, index: number) => {
    const updated = [...options];
    updated[index] = text;
    setOptions(updated);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;

    const validOptions = options.filter((o) => o.trim().length > 0);
    if (validOptions.length < 2) return;

    const poll: Poll = {
      id: `poll-${Date.now()}`,
      question: question.trim(),
      options: validOptions.map((text, i) => ({
        id: `opt-${i + 1}`,
        text: text.trim(),
        votes: [],
      })),
      totalVotes: 0,
      createdBy: currentUser.id,
    };

    sendMessage(`📊 Started a team poll: "${question.trim()}"`, undefined, poll);
    setIsCreatePollOpen(false);
    setQuestion('');
    setOptions(['', '']);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200/80 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-brand-50 text-brand-600">
              <Vote className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900">Create Staff Poll</h3>
              <p className="text-xs text-slate-500 font-medium">Gather feedback and votes from teammates</p>
            </div>
          </div>
          <button
            onClick={() => setIsCreatePollOpen(false)}
            className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Poll Question <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g. Which date works best for the community outreach?"
              required
              className="w-full px-3 py-2 text-sm bg-slate-50 focus:bg-white rounded-xl border border-slate-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none transition-all"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-700">Options</label>
              {options.length < 6 && (
                <button
                  type="button"
                  onClick={handleAddOption}
                  className="text-xs text-brand-600 hover:text-brand-700 font-bold flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Option
                </button>
              )}
            </div>

            <div className="space-y-2">
              {options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-400 w-5 text-center">{i + 1}.</span>
                  <input
                    type="text"
                    value={opt}
                    onChange={(e) => handleOptionChange(e.target.value, i)}
                    placeholder={`Option ${i + 1}`}
                    required
                    className="flex-1 px-3 py-1.5 text-xs bg-slate-50 focus:bg-white rounded-xl border border-slate-200 focus:border-brand-500 outline-none transition-all"
                  />
                  {options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveOption(i)}
                      className="p-1 text-slate-400 hover:text-rose-600 rounded-lg"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsCreatePollOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-xl shadow-md shadow-brand-500/25 transition-all"
            >
              <Vote className="w-4 h-4" />
              <span>Post Poll</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
