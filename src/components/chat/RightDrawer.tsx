import React, { useEffect, useState } from 'react';
import { Download, FileText, Pin, X } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { messageLink } from './MessageText';

export const RightDrawer: React.FC = () => {
  const { isRightDrawerOpen, toggleRightDrawer, activeTab, activeConversationId, activeChannelId, conversations, channels, messages, users, currentUser, togglePinConversation, openUserProfile } = useWorkspace();
  const [section, setSection] = useState<'media' | 'files'>('media');
  useEffect(() => {
    if (!isRightDrawerOpen) return;
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') toggleRightDrawer(); };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [isRightDrawerOpen, toggleRightDrawer]);
  if (!isRightDrawerOpen) return null;
  const isChannel = activeTab === 'channels';
  const conversation = conversations.find(item => item.id === activeConversationId);
  const channel = channels.find(item => item.id === activeChannelId);
  const partner = conversation?.type === 'direct' ? users.find(user => user.id === conversation.participants.find(id => id !== currentUser.id)) : undefined;
  const title = isChannel ? channel?.name : partner?.name || conversation?.name;
  const attachments = (messages[isChannel ? activeChannelId : activeConversationId] || []).flatMap(message => message.attachments || []);
  const media = attachments.filter(item => item.type === 'image');
  const files = attachments.filter(item => item.type !== 'image');
  const members = users.filter(user => isChannel ? !channel?.isPrivate || channel.members.includes(user.id) : conversation?.participants.includes(user.id));
  const urlFor = (url: string) => url.startsWith('blob:') ? url : messageLink(url);
  return <aside role="dialog" aria-label={`${title || 'Conversation'} settings`} className="fixed inset-0 z-50 flex h-full w-full shrink-0 flex-col bg-black lg:static lg:z-20 lg:w-80 lg:border-l lg:border-slate-200">
    <header className="flex min-h-12 items-center justify-between border-b border-slate-200 px-4 py-2">
      <h2 className="text-sm font-semibold text-slate-900">Conversation settings</h2>
      <button type="button" aria-label="Close conversation settings" onClick={toggleRightDrawer} className="rounded p-2 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>
    </header>
    <div className="flex-1 space-y-6 overflow-y-auto p-4">
      <div><h3 className="text-base font-semibold text-slate-900">{title}</h3>{(isChannel ? channel?.description : conversation?.description) && <p className="mt-2 text-sm text-slate-500">{isChannel ? channel?.description : conversation?.description}</p>}</div>
      {!isChannel && conversation && <button type="button" aria-pressed={conversation.isPinned} onClick={() => togglePinConversation(conversation.id)} className="flex w-full items-center gap-2 rounded-lg bg-slate-50 px-3 py-2.5 text-sm text-slate-700"><Pin className={`h-4 w-4 ${conversation.isPinned ? 'fill-current text-brand-400' : ''}`} />{conversation.isPinned ? 'Unpin conversation' : 'Pin conversation'}</button>}
      <section><h3 className="mb-2 text-sm font-medium text-slate-900">People · {members.length}</h3><div className="space-y-1">{members.map(user => <button type="button" key={user.id} onClick={() => openUserProfile(user)} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-slate-100">
        {user.avatar ? <img src={user.avatar} alt="" className="h-7 w-7 rounded-md object-cover" /> : <span className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 text-xs text-slate-500">{user.name.slice(0, 2)}</span>}
        <span className="min-w-0"><span className="block truncate text-sm text-slate-900">{user.name}</span><span className="block truncate text-xs text-slate-500">{user.role}</span></span>
      </button>)}</div></section>
      <section>
        <div role="tablist" aria-label="Shared attachments" className="mb-3 flex gap-1 rounded-lg bg-slate-50 p-1">{(['media', 'files'] as const).map(tab => <button key={tab} type="button" role="tab" aria-selected={section === tab} onClick={() => setSection(tab)} className={`flex-1 rounded px-2 py-1.5 text-xs ${section === tab ? 'bg-slate-100 text-slate-900' : 'text-slate-500'}`}>{tab === 'media' ? `Media (${media.length})` : `Files (${files.length})`}</button>)}</div>
        <div role="tabpanel" aria-label={section === 'media' ? 'Shared media' : 'Shared files'}>
          {!(section === 'media' ? media : files).length ? <p className="py-4 text-center text-xs text-slate-500">No {section} shared yet.</p> : <div className={section === 'media' ? 'grid grid-cols-2 gap-2' : 'space-y-2'}>{(section === 'media' ? media : files).map(item => {
            const url = urlFor(item.url);
            if (!url) return <p key={item.id} className="text-xs text-slate-500">{item.name} · Unavailable</p>;
            if (item.type === 'image') return <a key={item.id} href={url} target="_blank" rel="noreferrer"><img src={url} alt={item.name} className="aspect-square w-full rounded-lg object-cover" /></a>;
            if (item.type === 'audio') return <div key={item.id}><p className="mb-1 truncate text-xs text-slate-500">{item.name}</p><audio controls preload="none" src={url} aria-label={item.name} className="w-full" /></div>;
            return <a key={item.id} href={url} target="_blank" rel="noreferrer" download={item.type === 'file' ? item.name : undefined} className="flex items-center gap-2 rounded-lg bg-slate-50 p-3 text-slate-700"><FileText className="h-4 w-4 shrink-0" /><span className="min-w-0 flex-1 truncate text-xs">{item.name}</span><Download className="h-3.5 w-3.5 shrink-0" /></a>;
          })}</div>}
        </div>
      </section>
    </div>
  </aside>;
};
