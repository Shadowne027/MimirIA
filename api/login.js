import crypto from "node:crypto";

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  try {
    console.log('[LOGIN] Iniciando login...');
    
    // Parsear body
    let body = '';
    for await (const chunk of req) {
      body += chunk;
    }
    const { username, password } = JSON.parse(body);
    
    console.log('[LOGIN] Usuario:', username);
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Escribe tu usuario y tu contraseña.' });
    }

    // Conectar a MongoDB
    const { MongoClient } = await import('mongodb');
    console.log('[LOGIN] Conectando a MongoDB...');
    
    const client = await MongoClient.connect(process.env.MONGODB_URI);
    const db = client.db('mimiria');
    const users = db.collection('users');
    
    console.log('[LOGIN] Buscando usuario...');
    
    // Buscar usuario
    const user = await users.findOne({ usernameLower: username.toLowerCase() });
    
    if (!user) {
      await client.close();
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    }

    console.log('[LOGIN] Usuario encontrado. Verificando contraseña...');
    
    // Verificar contraseña
    const hash = crypto.scryptSync(password, user.salt, 64).toString('hex');
    
    if (hash !== user.passwordHash) {
      await client.close();
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    }

    console.log('[LOGIN] Contraseña correcta. Creando token...');
    
    // Crear token simple
    const token = Buffer.from(JSON.stringify({
      userId: user.userId,
      username: user.username,
      exp: Date.now() + 30 * 24 * 60 * 60 * 1000 // 30 días
    })).toString('base64');
    
    await client.close();
    
    console.log('[LOGIN] Login completado exitosamente');
    
    return res.status(200).json({
      user: {
        userId: user.userId,
        id: user.displayId,
        username: user.username,
        token
      }
    });
    
  } catch (error) {
    console.error('[LOGIN] Error:', error);
    return res.status(500).json({
      error: 'Error al iniciar sesión',
      details: error.message || 'Error desconocido',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
