export function TypingIndicator() {
  return (
    <div className="flex justify-start animate-slide-up">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
          <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
          </svg>
        </div>
        <div className="px-4 py-3 rounded-2xl rounded-bl-md bg-muted">
          <div className="flex gap-1">
            <span className="typing-dot w-2 h-2 bg-muted-foreground rounded-full inline-block"></span>
            <span className="typing-dot w-2 h-2 bg-muted-foreground rounded-full inline-block"></span>
            <span className="typing-dot w-2 h-2 bg-muted-foreground rounded-full inline-block"></span>
          </div>
        </div>
      </div>
    </div>
  );
}
