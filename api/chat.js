// api/chat.js
import OpenAI from 'openai';
import { MongoClient } from 'mongodb';

// Configuración de OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Configuración de MongoDB (Opcional, para historial/caché si lo usabas)
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);

/**
 * Determina el modelo a usar basado en la complejidad del prompt.
 * - gpt-5-nano: Consultas rápidas, saludos, hechos simples.
 * - gpt-5-mini: Razonamiento, código, análisis, preguntas complejas.
 */
function determineModel(prompt) {
  const simpleKeywords = ['hola', 'hi', 'buenos', 'gracias', 'adios', 'qué hora', 'fecha', 'clima'];
  const isSimple = simpleKeywords.some(keyword => prompt.toLowerCase().includes(keyword));
  
  // Si es muy corto y parece saludo -> Nano
  if (prompt.length < 15 && isSimple) return 'gpt-5-nano';
  
  // Si contiene palabras clave de complejidad -> Mini
  const complexKeywords = ['analiza', 'código', 'programa', 'explica detalladamente', 'compara', 'resume', 'traduce', 'crea'];
  if (complexKeywords.some(k => prompt.toLowerCase().includes(k))) return 'gpt-5-mini';

  // Por defecto, usamos mini para asegurar calidad, o nano si quieres ahorrar costos en dudas generales
  // Aquí dejo 'gpt-5-mini' como default para seguridad, puedes cambiarlo a 'gpt-5-nano' si prefieres velocidad
  return 'gpt-5-mini';
}

export default async function handler(req, res) {
  // Solo permitir POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { message, conversationHistory = [], userId } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // 1. Determinar el modelo inteligente
    const modelToUse = determineModel(message);
    
    console.log(`[MIMIR IA] Usando modelo: ${modelToUse} para el mensaje: "${message.substring(0, 30)}..."`);

    // 2. Construir mensajes para la API
    // System prompt para dar personalidad a MIMIR
    const systemPrompt = {
      role: 'system',
      content: "Eres MIMIR, una IA avanzada, útil y precisa. Respondes de manera concisa pero completa. Si te preguntan algo complejo, razona paso a paso. Si es un saludo, sé amigable."
    };

    const messages = [
      systemPrompt,
      ...conversationHistory, // Historial previo si existe
      { role: 'user', content: message }
    ];

    // 3. Llamar a OpenAI con el modelo seleccionado
    const completion = await openai.chat.completions.create({
      model: modelToUse, // Aquí se inyecta 'gpt-5-nano' o 'gpt-5-mini'
      messages: messages,
      temperature: 0.7,
      max_tokens: 1024,
    });

    const reply = completion.choices[0].message.content;

    // 4. (Opcional) Guardar en MongoDB si está configurado
    if (uri && userId) {
      try {
        await client.connect();
        const db = client.db('mimir_db');
        const collection = db.collection('conversations');
        
        await collection.updateOne(
          { userId: userId },
          { 
            $push: { 
              messages: { 
                role: 'user', 
                content: message, 
                timestamp: new Date(),
                model: 'user'
              },
              response: {
                role: 'assistant',
                content: reply,
                timestamp: new Date(),
                model: modelToUse
              }
            }
          },
          { upsert: true }
        );
      } catch (dbError) {
        console.error('Error guardando en DB:', dbError);
        // No fallamos la petición si la DB falla, solo logueamos
      } finally {
        await client.close();
      }
    }

    // 5. Responder al frontend
    return res.status(200).json({
      success: true,
      data: {
        response: reply,
        model: modelToUse, // Devolvemos qué modelo se usó (útil para debug)
        usage: completion.usage
      }
    });

  } catch (error) {
    console.error('Error en API Chat:', error);
    return res.status(500).json({ 
      error: 'Failed to process chat', 
      details: error.message 
    });
  }
}