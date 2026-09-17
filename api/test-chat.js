/**
 * GET /api/test-chat
 * Endpoint de diagnóstico para probar cada componente del chat
 */
export default async function handler(req, res) {
  console.log('[TEST-CHAT] Iniciando diagnóstico...');
  
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const results = {
    step1_env: false,
    step2_mongodb: false,
    step3_openai_key: false,
    step4_openai_call: false,
    errors: []
  };

  try {
    // PASO 1: Verificar variables de entorno
    console.log('[TEST-CHAT] Paso 1: Verificando variables de entorno...');
    const hasMongoUri = Boolean(process.env.MONGODB_URI);
    const hasOpenAIKey = Boolean(process.env.OPENAI_API_KEY);
    
    results.step1_env = hasMongoUri && hasOpenAIKey;
    
    if (!hasMongoUri) results.errors.push('Falta MONGODB_URI');
    if (!hasOpenAIKey) results.errors.push('Falta OPENAI_API_KEY');
    
    console.log('[TEST-CHAT] MONGODB_URI:', hasMongoUri ? '✅' : '❌');
    console.log('[TEST-CHAT] OPENAI_API_KEY:', hasOpenAIKey ? '✅' : '❌');

    if (!results.step1_env) {
      return res.status(500).json(results);
    }

    // PASO 2: Probar conexión a MongoDB
    console.log('[TEST-CHAT] Paso 2: Probando MongoDB...');
    try {
      const { MongoClient } = await import('mongodb');
      const client = await MongoClient.connect(process.env.MONGODB_URI, {
        serverSelectionTimeoutMS: 5000
      });
      await client.db().command({ ping: 1 });
      await client.close();
      results.step2_mongodb = true;
      console.log('[TEST-CHAT] MongoDB: ✅');
    } catch (e) {
      results.errors.push('MongoDB: ' + e.message);
      console.error('[TEST-CHAT] MongoDB: ❌', e.message);
      return res.status(500).json(results);
    }

    // PASO 3: Verificar que la API key de OpenAI esté presente
    console.log('[TEST-CHAT] Paso 3: Verificando OpenAI API key...');
    results.step3_openai_key = hasOpenAIKey;
    console.log('[TEST-CHAT] OpenAI key: ✅');

    // PASO 4: Hacer una llamada de prueba a OpenAI
    console.log('[TEST-CHAT] Paso 4: Probando llamada a OpenAI...');
    try {
      const testResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'gpt-5-nano',
          messages: [
            { role: 'user', content: 'Di "OK" si funcionas' }
          ],
          max_completion_tokens: 10
        })
      });

      console.log('[TEST-CHAT] OpenAI status:', testResponse.status);

      if (testResponse.ok) {
        const data = await testResponse.json();
        console.log('[TEST-CHAT] OpenAI response:', data.choices?.[0]?.message?.content);
        results.step4_openai_call = true;
        console.log('[TEST-CHAT] OpenAI: ✅');
      } else {
        const errorData = await testResponse.json().catch(() => ({}));
        const errorMsg = errorData.error?.message || `Status ${testResponse.status}`;
        results.errors.push('OpenAI: ' + errorMsg);
        console.error('[TEST-CHAT] OpenAI: ❌', errorMsg);
        console.error('[TEST-CHAT] OpenAI error details:', errorData);
        return res.status(500).json(results);
      }
    } catch (e) {
      results.errors.push('OpenAI call: ' + e.message);
      console.error('[TEST-CHAT] OpenAI call: ❌', e.message);
      return res.status(500).json(results);
    }

    // Si llegamos aquí, todo está bien
    console.log('[TEST-CHAT] ✅ Todos los componentes funcionan correctamente');
    return res.status(200).json({
      ...results,
      message: 'Todos los componentes del chat funcionan correctamente'
    });

  } catch (error) {
    console.error('[TEST-CHAT] Error general:', error);
    results.errors.push('General: ' + error.message);
    return res.status(500).json(results);
  }
}
