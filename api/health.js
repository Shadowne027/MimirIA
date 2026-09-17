/**
 * GET /api/health
 * Diagnóstico completo con manejo robusto de errores
 */
export default async function handler(req, res) {
  console.log('[HEALTH] Iniciando verificación...');
  
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
      model: 'gpt-5-mini + gpt-5-nano',
      errors: [],
      warnings: []
    };

    // Verificar variables de entorno
    const hasMongoUri = Boolean(process.env.MONGODB_URI);
    const hasOpenAIKey = Boolean(process.env.OPENAI_API_KEY);

    console.log('[HEALTH] MONGODB_URI presente:', hasMongoUri);
    console.log('[HEALTH] OPENAI_API_KEY presente:', hasOpenAIKey);

    if (!hasMongoUri) {
      result.errors.push('Falta MONGODB_URI');
    }
    if (!hasOpenAIKey) {
      result.warnings.push('Falta OPENAI_API_KEY - La IA no funcionará');
    }

    // Probar MongoDB (OBLIGATORIO)
    if (hasMongoUri) {
      try {
        console.log('[HEALTH] Probando conexión a MongoDB...');
        const { MongoClient } = await import('mongodb');
        const client = await MongoClient.connect(process.env.MONGODB_URI, {
          serverSelectionTimeoutMS: 5000
        });
        await client.db().command({ ping: 1 });
        await client.close();
        result.mongo = true;
        console.log('[HEALTH] ✅ MongoDB conectado');
      } catch (e) {
        console.error('[HEALTH] ❌ Error MongoDB:', e.message);
        result.errors.push('MongoDB: ' + (e.message || 'Error desconocido'));
      }
    }

    // Probar OpenAI (OPCIONAL - solo warning si falla)
    if (hasOpenAIKey) {
      try {
        console.log('[HEALTH] Probando conexión a OpenAI...');
        const response = await fetch('https://api.openai.com/v1/models', {
          headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` }
        });
        result.openai = response.ok;
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          console.error('[HEALTH] ❌ Error OpenAI:', response.status, errorData);
          result.warnings.push(`OpenAI: Status ${response.status} - ${errorData.error?.message || 'Error desconocido'}`);
        } else {
          console.log('[HEALTH] ✅ OpenAI conectado');
        }
      } catch (e) {
        console.error('[HEALTH] ❌ Error OpenAI:', e.message);
        result.warnings.push('OpenAI: ' + (e.message || 'Error de conexión'));
      }
    }

    // El sistema está OK si MongoDB funciona (OpenAI es opcional)
    result.ok = result.mongo;
    
    console.log('[HEALTH] Resultado final:', {
      ok: result.ok,
      mongo: result.mongo,
      openai: result.openai,
      errors: result.errors,
      warnings: result.warnings
    });
    
    return res.status(result.ok ? 200 : 503).json(result);
  } catch (error) {
    console.error('[HEALTH] Error interno:', error);
    return res.status(500).json({
      ok: false,
      error: 'Error interno del servidor',
      details: error.message || 'Error desconocido',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
