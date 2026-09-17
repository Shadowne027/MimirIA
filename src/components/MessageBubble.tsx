import { Message } from '../lib/types';

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  
  const formatTime = (date: Date) => {
    return new Intl.DateTimeFormat('es-CO', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  return (
    <div className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'} animate-slide-up`}>
      <div className={`flex max-w-[85%] md:max-w-[75%] ${isUser ? 'flex-row-reverse' : 'flex-row'} gap-3`}>
        {/* Avatar */}
        <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
          isUser 
            ? 'bg-indigo-500 text-white' 
            : 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white'
        }`}>
          {isUser ? (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
            </svg>
          )}
        </div>

        {/* Message Content */}
        <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} gap-1`}>
          <div className={`px-4 py-3 rounded-2xl ${
            isUser 
              ? 'bg-indigo-500 text-white rounded-br-md' 
              : 'bg-muted text-foreground rounded-bl-md'
          }`}>
            <p className="text-sm md:text-base whitespace-pre-wrap break-words">{message.content}</p>
          </div>
          
          <div className="flex items-center gap-2 px-1">
            <span className="text-xs text-muted-foreground">
              {formatTime(message.timestamp)}
            </span>
            {!isUser && message.model && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                {message.model === 'gpt-5-nano' ? '⚡ Nano' : '🧠 Mini'}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
