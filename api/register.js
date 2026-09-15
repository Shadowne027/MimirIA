import crypto from "node:crypto";

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  try {
    console.log('[REGISTER] Iniciando registro...');
    
    // Parsear body
    let body = '';
    for await (const chunk of req) {
      body += chunk;
    }
    const { username, password } = JSON.parse(body);
    
    console.log('[REGISTER] Usuario:', username);
    
    if (!username || username.trim().length < 2) {
      return res.status(400).json({ error: 'El nombre de usuario debe tener al menos 2 caracteres.' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
    }

    // Conectar a MongoDB
    const { MongoClient } = await import('mongodb');
    console.log('[REGISTER] Conectando a MongoDB...');
    
    const client = await MongoClient.connect(process.env.MONGODB_URI);
    const db = client.db('mimiria');
    
    console.log('[REGISTER] Conectado. Verificando usuario existente...');
    
    // Verificar si el usuario ya existe
    const users = db.collection('users');
    const exists = await users.findOne({ usernameLower: username.toLowerCase() });
    
    if (exists) {
      await client.close();
      return res.status(409).json({ error: 'Ese nombre de usuario ya está registrado.' });
    }

    console.log('[REGISTER] Usuario no existe. Obteniendo siguiente ID...');
    
    // Obtener siguiente ID (simplificado)
    const counters = db.collection('counters');
    const result = await counters.findOneAndUpdate(
      { _id: 'users' },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: 'after' }
    );
    
    const userId = result?.value?.seq || result?.seq || 1;
    const displayId = `#${String(userId).padStart(3, '0')}`;
    
    console.log('[REGISTER] ID asignado:', displayId);
    
    // Crear hash de contraseña
    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = crypto.scryptSync(password, salt, 64).toString('hex');
    
    console.log('[REGISTER] Insertando usuario...');
    
    // Insertar usuario
    await users.insertOne({
      userId,
      displayId,
      username: username.trim(),
      usernameLower: username.toLowerCase(),
      salt,
      passwordHash,
      createdAt: Date.now(),
    });
    
    console.log('[REGISTER] Usuario insertado. Creando token...');
    
    // Crear token con firma HMAC
    const tokenPayload = { userId, username: username.trim() };
    const tokenBody = Buffer.from(JSON.stringify(tokenPayload)).toString('base64url');
    const tokenSecret = process.env.TOKEN_SECRET || 'mimiria-dev-secret';
    const tokenSig = crypto.createHmac('sha256', tokenSecret).update(tokenBody).digest('base64url');
    const token = `${tokenBody}.${tokenSig}`;
    
    await client.close();
    
    console.log('[REGISTER] Registro completado exitosamente');
    
    return res.status(201).json({
      user: {
        userId,
        id: displayId,
        username: username.trim(),
        token
      }
    });
    
  } catch (error) {
    console.error('[REGISTER] Error:', error);
    return res.status(500).json({
      error: 'Error al crear cuenta',
      details: error.message || 'Error desconocido',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
