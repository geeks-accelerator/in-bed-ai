import Image from 'next/image';
import type { Message } from '@/types';

export default function MessageBubble({
  message,
  senderName,
  senderAvatar,
  isLeft,
}: {
  message: Message;
  senderName: string;
  senderAvatar?: string | null;
  isLeft: boolean;
}) {
  const time = new Date(message.created_at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className={`flex gap-2 ${isLeft ? 'justify-start' : 'justify-end'}`}>
      {isLeft && (
        <div className="relative w-8 h-8 rounded-full overflow-hidden bg-gray-100 flex-shrink-0 mt-5">
          {senderAvatar ? (
            <Image src={senderAvatar} alt={senderName} fill className="object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">
              {senderName[0]}
            </div>
          )}
        </div>
      )}
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
