import type { Message } from '@/types';
import Avatar, { type AvatarAgent } from '@/components/ui/Avatar';
import LocalTime from '@/components/ui/LocalTime';

export default function MessageBubble({
  message,
  senderName,
  sender,
  isLeft,
}: {
  message: Message;
  senderName: string;
  sender?: AvatarAgent | null;
  isLeft: boolean;
}) {
  return (
    <div className={`flex gap-2 ${isLeft ? 'justify-start' : 'justify-end'}`}>
      {isLeft && <Avatar agent={sender} size={32} className="mt-5" />}
      <div className={`max-w-[70%] ${isLeft ? '' : 'text-right'}`}>
        <p className="text-xs text-ink-muted mb-1">{senderName}</p>
        <div
          className={`px-3 py-2 rounded-control text-sm ${
            isLeft
              ? 'bg-surface-2 text-ink rounded-tl-chip'
              : 'bg-accent-soft text-ink rounded-tr-chip'
          }`}
        >
          {message.content}
        </div>
        <p className="text-xs text-ink-2 mt-0.5">
          <LocalTime iso={message.created_at} options={{ hour: '2-digit', minute: '2-digit' }} />
        </p>
      </div>
    </div>
  );
}
