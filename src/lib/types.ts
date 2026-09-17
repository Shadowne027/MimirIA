export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  model?: 'gpt-5-nano' | 'gpt-5-mini';
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}

export interface User {
  id: string;
  email: string;
  name: string;
}

export interface ChatRequest {
  message: string;
  conversationId?: string;
  image?: string;
  document?: string;
}

export interface ChatResponse {
  message: Message;
  conversationId: string;
  model: 'gpt-5-nano' | 'gpt-5-mini';
  cached: boolean;
}

export const generateId = (): string => {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};
