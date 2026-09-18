// api/chat.js
import OpenAI from 'openai';
import { MongoClient, ObjectId } from 'mongodb';

// Configuración de OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Configuración de MongoDB
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);

/**
 * Sistema de enrutamiento inteligente de modelos
 * - gpt-5-nano: Consultas rápidas, saludos, hechos simples (más económico)
 * - gpt-5-mini: Razonamiento, código, análisis, preguntas complejas (más capaz)
 */
function determineModel(prompt) {
  const simpleKeywords = ['hola', 'hi', 'buenos', 'gracias', 'adios', 'qué hora', 'fecha', 'clima', 'qué es', 'quién es'];
  const isSimple = simpleKeywords.some(keyword => prompt.toLowerCase().includes(keyword));

  // Si es muy corto y parece saludo o pregunta simple -> Nano
  if (prompt.length < 50 && isSimple) return 'gpt-5-nano';

  // Si contiene palabras clave de complejidad -> Mini
  const complexKeywords = [
    'analiza', 'código', 'programa', 'explica detalladamente', 'compara', 
    'resume', 'traduce', 'crea', 'algoritmo', 'función', 'ecuación', 
    'derivada', 'integral', 'cálculo', 'física', 'química', 'ensayo', 'tesis'
  ];
  if (complexKeywords.some(k => prompt.toLowerCase().includes(k))) return 'gpt-5-mini';

  // Si es muy largo -> Mini (probablemente complejo)
  if (prompt.length > 200) return 'gpt-5-mini';

  // Por defecto -> Mini para asegurar calidad
  return 'gpt-5-mini';
}

/**
 * Sistema de caché inteligente
 * Busca respuestas similares en la base de datos para evitar consultas repetitivas
 */
async function searchCache(db, message) {
  try {
    const cache = db.collection('cache');
    
    // Normalizar mensaje para comparación
    const normalizedMessage = message.toLowerCase().trim();
    
    // Buscar respuestas similares (últimas 100)
    const recentCache = await cache
      .find({})
      .sort({ timestamp: -1 })
      .limit(100)
      .toArray();

    // Buscar coincidencia exacta o muy similar
    for (const cached of recentCache) {
      const cachedNormalized = cached.question.toLowerCase().trim();
      
      // Coincidencia exacta
      if (cachedNormalized === normalizedMessage) {
        console.log('[CACHE] Coincidencia exacta encontrada');
        return cached;
      }
      
      // Coincidencia muy similar (90%+)
      const similarity = calculateSimilarity(normalizedMessage, cachedNormalized);
      if (similarity > 0.9) {
        console.log(`[CACHE] Coincidencia similar encontrada (${(similarity * 100).toFixed(1)}%)`);
        return cached;
      }
    }
    
    return null;
  } catch (error) {
    console.error('[CACHE] Error buscando en caché:', error);
    return null;
  }
}

/**
 * Calcula similitud entre dos textos (Jaccard similarity)
 */
function calculateSimilarity(text1, text2) {
  const words1 = new Set(text1.split(/\s+/));
  const words2 = new Set(text2.split(/\s+/));
  
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  
  return intersection.size / union.size;
}

/**
 * Guarda una respuesta en caché
 */
async function saveToCache(db, question, response, model) {
  try {
    const cache = db.collection('cache');
    await cache.insertOne({
      question,
      response,
      model,
      timestamp: new Date()
    });
    console.log('[CACHE] Respuesta guardada en caché');
  } catch (error) {
    console.error('[CACHE] Error guardando en caché:', error);
  }
}

export default async function handler(req, res) {
  // Solo permitir POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { message, conversationHistory = [], userId, conversationId } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Conectar a MongoDB
    await client.connect();
    const db = client.db('mimir_db');

    // 1. Buscar en caché primero
    const cached = await searchCache(db, message);
    if (cached) {
      console.log('[MIMIR IA] Usando respuesta de caché');
      await client.close();
      return res.status(200).json({
        success: true,
        data: {
          response: cached.response,
          model: cached.model,
          fromCache: true
        }
      });
    }

    // 2. Determinar el modelo inteligente
    const modelToUse = determineModel(message);
    console.log(`[MIMIR IA] Usando modelo: ${modelToUse} para el mensaje: "${message.substring(0, 30)}..."`);

    // 3. Construir mensajes para la API
    const systemPrompt = {
      role: 'system',
      content: `Eres MIMIR, una IA avanzada, útil y precisa creada por estudiantes del SENA para la Institución Educativa Gonzalo Rivera Laguado.

Reglas importantes:
- Responde SIEMPRE en español
- Sé conciso pero completo
- Si te preguntan algo complejo, razona paso a paso
- Si es un saludo, sé amigable y breve
- Incluye fuentes verificables cuando sea apropiado
- Fomenta el pensamiento crítico
- Si te preguntan sobre ti mismo, explica que eres MIMIR IA, un tutor personal con fuentes verificadas`
    };

    const messages = [
      systemPrompt,
      ...conversationHistory,
      { role: 'user', content: message }
    ];

    // 4. Llamar a OpenAI con el modelo seleccionado
    const completion = await openai.chat.completions.create({
      model: modelToUse,
      messages: messages,
      temperature: 0.7,
      max_tokens: 1024,
    });

    const reply = completion.choices[0].message.content;

    // 5. Guardar en caché para futuras consultas
    await saveToCache(db, message, reply, modelToUse);

    // 6. Guardar en historial de conversación si hay userId y conversationId
    if (userId && conversationId) {
      try {
        const collection = db.collection('conversations');
        
        await collection.updateOne(
          { _id: new ObjectId(conversationId), userId: userId },
          {
            $push: {
              messages: {
                $each: [
                  {
                    role: 'user',
                    content: message,
                    timestamp: new Date(),
                    model: 'user'
                  },
                  {
                    role: 'assistant',
                    content: reply,
                    timestamp: new Date(),
                    model: modelToUse
                  }
                ]
              }
            },
            $set: { updatedAt: new Date() }
          },
          { upsert: true }
        );
      } catch (dbError) {
        console.error('Error guardando en historial:', dbError);
        // No fallamos la petición si la DB falla
      }
    }

    await client.close();

    // 7. Responder al frontend
    return res.status(200).json({
      success: true,
      data: {
        response: reply,
        model: modelToUse,
        fromCache: false,
        usage: completion.usage
      }
    });

  } catch (error) {
    console.error('Error en API Chat:', error);
    
    // Cerrar conexión si está abierta
    try {
      await client.close();
    } catch (e) {
      // Ignorar error al cerrar
    }
    
    return res.status(500).json({
      error: 'Failed to process chat',
      details: error.message
    });
  }
}
