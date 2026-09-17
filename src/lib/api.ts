import { ChatRequest, ChatResponse, Message, Conversation } from './types';

const API_BASE = '/api';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function sendChat(request: ChatRequest): Promise<ChatResponse> {
  try {
    const response = await fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Error en la respuesta' }));
      throw new ApiError(response.status, error.error || 'Error al enviar mensaje');
    }

    const data = await response.json();
    
    return {
      ...data,
      message: {
        ...data.message,
        timestamp: new Date(data.message.timestamp),
      },
    };
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(500, 'Error de conexión. Verifica tu internet.');
  }
}

export async function getConversations(): Promise<Conversation[]> {
  try {
    const response = await fetch(`${API_BASE}/conversations`);
    
    if (!response.ok) {
      throw new ApiError(response.status, 'Error al obtener conversaciones');
    }

    const data = await response.json();
    return data.map((conv: any) => ({
      ...conv,
      createdAt: new Date(conv.createdAt),
      updatedAt: new Date(conv.updatedAt),
    }));
  } catch (error) {
    console.error('Error fetching conversations:', error);
    return [];
  }
}

export async function getConversation(id: string): Promise<Conversation | null> {
  try {
    const response = await fetch(`${API_BASE}/conversations/${id}`);
    
    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new ApiError(response.status, 'Error al obtener conversación');
    }

    const data = await response.json();
    return {
      ...data,
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt),
      messages: data.messages.map((msg: any) => ({
        ...msg,
        timestamp: new Date(msg.timestamp),
      })),
    };
  } catch (error) {
    console.error('Error fetching conversation:', error);
    return null;
  }
}

export async function deleteConversation(id: string): Promise<void> {
  try {
    const response = await fetch(`${API_BASE}/conversations/${id}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new ApiError(response.status, 'Error al eliminar conversación');
    }
  } catch (error) {
    console.error('Error deleting conversation:', error);
    throw error;
  }
}

export async function updateConversationTitle(id: string, title: string): Promise<Conversation> {
  try {
    const response = await fetch(`${API_BASE}/conversations/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title }),
    });

    if (!response.ok) {
      throw new ApiError(response.status, 'Error al actualizar título');
    }

    const data = await response.json();
    return {
      ...data,
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt),
    };
  } catch (error) {
    console.error('Error updating conversation:', error);
    throw error;
  }
}
