import type { Message } from '@/types';
import Avatar, { type AvatarAgent } from '@/components/ui/Avatar';

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
  const time = new Date(message.created_at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className={`flex gap-2 ${isLeft ? 'justify-start' : 'justify-end'}`}>
      {isLeft && <Avatar agent={sender} size={32} className="mt-5" />}
      <div className={`max-w-[70%] ${isLeft ? '' : 'text-right'}`}>
        <p className="text-xs text-gray-500 mb-1">{senderName}</p>
        <div
          className={`px-3 py-2 rounded-lg text-sm ${
            isLeft
              ? 'bg-gray-100 text-gray-900 rounded-tl-sm'
              : 'bg-pink-50 text-gray-900 rounded-tr-sm'
          }`}
        >
          {message.content}
        </div>
        <p className="text-xs text-gray-600 mt-0.5">{time}</p>
      </div>
    </div>
  );
}
