/**
 * GET /api/health
 * Diagnóstico completo con manejo robusto de errores
 */
export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const result = {
      ok: false,
      build: 'mimir-v5-openai',
      mongo: false,
      openai: false,
      model: 'gpt-5-mini',
      errors: []
    };

    // Verificar variables de entorno
    const hasMongoUri = Boolean(process.env.MONGODB_URI);
    const hasOpenAIKey = Boolean(process.env.OPENAI_API_KEY);

    if (!hasMongoUri) {
      result.errors.push('Falta MONGODB_URI');
    }
    if (!hasOpenAIKey) {
      result.errors.push('Falta OPENAI_API_KEY');
    }

    // Probar MongoDB
    if (hasMongoUri) {
      try {
        const { MongoClient } = await import('mongodb');
        const client = await MongoClient.connect(process.env.MONGODB_URI, {
          serverSelectionTimeoutMS: 5000
        });
        await client.db().command({ ping: 1 });
        await client.close();
        result.mongo = true;
      } catch (e) {
        result.errors.push('MongoDB: ' + (e.message || 'Error desconocido'));
      }
    }

    // Probar OpenAI
    if (hasOpenAIKey) {
      try {
        const response = await fetch('https://api.openai.com/v1/models', {
          headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` }
        });
        result.openai = response.ok;
        if (!response.ok) {
          result.errors.push('OpenAI: Status ' + response.status);
        }
      } catch (e) {
        result.errors.push('OpenAI: ' + (e.message || 'Error de conexión'));
      }
    }

    result.ok = result.mongo && result.openai;
    
    return res.status(result.ok ? 200 : 503).json(result);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: 'Error interno del servidor',
      details: error.message || 'Error desconocido',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
