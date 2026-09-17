import { createHashSignature, verifyHashSignature } from './_lib.js';

const SYSTEM_PROMPT = `Eres MIMIR, un asistente de IA útil, preciso y amigable. 
Responde de manera concisa pero completa en español.
Usa GPT-5 nano para preguntas simples y GPT-5 mini para preguntas complejas.`;

export async function POST(request) {
  try {
    const body = await request.json();
    const { message, conversationId, image, document } = body;

    if (!message || typeof message !== 'string') {
      return new Response(JSON.stringify({ error: 'Mensaje inválido' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Determinar modelo basado en complejidad
    const model = determineModel(message);
    
    // Verificar caché
    const cacheKey = `chat:${model}:${message.toLowerCase().trim()}`;
    const cached = await getCachedResponse(cacheKey);
    
    if (cached) {
      return new Response(JSON.stringify({
        message: {
          id: Date.now().toString(),
          role: 'assistant',
          content: cached,
          timestamp: new Date().toISOString(),
          model
        },
        conversationId: conversationId || generateId(),
        model,
        cached: true
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Llamar a OpenAI API
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: model === 'gpt-5-nano' ? 'gpt-4o-mini' : 'gpt-4o',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: message }
        ],
        max_tokens: 1024,
        temperature: 0.7
      })
    });

    if (!openaiResponse.ok) {
      throw new Error(`OpenAI API error: ${openaiResponse.status}`);
    }

    const data = await openaiResponse.json();
    const content = data.choices[0]?.message?.content || 'Lo siento, no pude generar una respuesta.';

    // Guardar en caché
    await cacheResponse(cacheKey, content);

    // Guardar en MongoDB si hay conversationId
    let finalConversationId = conversationId;
    if (!conversationId) {
      finalConversationId = generateId();
      await createConversation(finalConversationId, message, content, model);
    } else {
      await addMessageToConversation(conversationId, message, content, model);
    }

    return new Response(JSON.stringify({
      message: {
        id: Date.now().toString(),
        role: 'assistant',
        content,
        timestamp: new Date().toISOString(),
        model
      },
      conversationId: finalConversationId,
      model,
      cached: false
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Chat API error:', error);
    return new Response(JSON.stringify({ error: 'Error interno del servidor' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

function determineModel(message) {
  const simplePatterns = [
    /^hola/i, /^hi/i, /^buenos/i, /^buenas/i,
    /^gracias/i, /^thank/i, /^adios/i, /^bye/i,
    /^que tal/i, /^como estas/i, /^cuantos/i, /^que es/i,
    /^\d+\s*[+*/-]\s*\d+$/,
    /^quien fue/i, /^quando/i, /^donde/i
  ];

  const isSimple = simplePatterns.some(pattern => pattern.test(message.trim()));
  
  if (isSimple || message.length < 50) {
    return 'gpt-5-nano';
  }
  
  return 'gpt-5-mini';
}

async function getCachedResponse(key) {
  try {
    const db = await getDb();
    const cache = await db.collection('cache').findOne({ key });
    
    if (cache && new Date(cache.expiresAt) > new Date()) {
      return cache.response;
    }
    
    return null;
  } catch (error) {
    console.error('Cache read error:', error);
    return null;
  }
}

async function cacheResponse(key, response) {
  try {
    const db = await getDb();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 días
    
    await db.collection('cache').updateOne(
      { key },
      {
        $set: {
          key,
          response,
          expiresAt,
          updatedAt: new Date()
        }
      },
      { upsert: true }
    );
  } catch (error) {
    console.error('Cache write error:', error);
  }
}

async function createConversation(id, firstMessage, firstResponse, model) {
  try {
    const db = await getDb();
    const title = firstMessage.slice(0, 50) + (firstMessage.length > 50 ? '...' : '');
    const now = new Date();
    
    await db.collection('conversations').insertOne({
      _id: id,
      title,
      messages: [
        {
          id: generateId(),
          role: 'user',
          content: firstMessage,
          timestamp: now
        },
        {
          id: generateId(),
          role: 'assistant',
          content: firstResponse,
          timestamp: now,
          model
        }
      ],
      createdAt: now,
      updatedAt: now
    });
  } catch (error) {
    console.error('Create conversation error:', error);
  }
}

async function addMessageToConversation(conversationId, message, response, model) {
  try {
    const db = await getDb();
    const now = new Date();
    
    await db.collection('conversations').updateOne(
      { _id: conversationId },
      {
        $push: {
          messages: {
            $each: [
              {
                id: generateId(),
                role: 'user',
                content: message,
                timestamp: now
              },
              {
                id: generateId(),
                role: 'assistant',
                content: response,
                timestamp: now,
                model
              }
            ]
          }
        },
        $set: { updatedAt: now }
      }
    );
  } catch (error) {
    console.error('Add message error:', error);
  }
}

async function getDb() {
  const { MongoClient } = await import('mongodb');
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  return client.db('mimir-ia');
}

function generateId() {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}
