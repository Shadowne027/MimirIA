import { ObjectId } from "mongodb";
import crypto from "node:crypto";

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    console.log('[CONVERSATIONS] Método:', req.method);
    
    // Verificar autenticación
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    
    if (!token) {
      console.log('[CONVERSATIONS] No hay token');
      return res.status(401).json({ error: 'Sesión inválida. Inicia sesión de nuevo.' });
    }

    // Verificar token
    const [tokenBody, tokenSig] = token.split('.');
    if (!tokenBody || !tokenSig) {
      console.log('[CONVERSATIONS] Token mal formado');
      return res.status(401).json({ error: 'Token inválido.' });
    }

    const tokenSecret = process.env.TOKEN_SECRET || 'mimiria-dev-secret';
    const expectedSig = crypto.createHmac('sha256', tokenSecret).update(tokenBody).digest('base64url');
    
    if (tokenSig !== expectedSig) {
      console.log('[CONVERSATIONS] Firma de token inválida');
      return res.status(401).json({ error: 'Token inválido.' });
    }

    let payload;
    try {
      payload = JSON.parse(Buffer.from(tokenBody, 'base64url').toString('utf8'));
    } catch (e) {
      console.log('[CONVERSATIONS] Error al decodificar token:', e.message);
      return res.status(401).json({ error: 'Token inválido.' });
    }

    if (!payload.userId || typeof payload.userId !== 'number') {
      console.log('[CONVERSATIONS] userId inválido en token');
      return res.status(401).json({ error: 'Token inválido.' });
    }

    console.log('[CONVERSATIONS] Usuario autenticado:', payload.userId);

    // Conectar a MongoDB
    const { MongoClient } = await import('mongodb');
    const client = await MongoClient.connect(process.env.MONGODB_URI);
    const db = client.db('mimiria');
    const col = db.collection('conversations');

    // GET - Listar conversaciones
    if (req.method === 'GET') {
      console.log('[CONVERSATIONS] Listando conversaciones...');
      const docs = await col
        .find({ userId: payload.userId })
        .sort({ updatedAt: -1 })
        .limit(100)
        .toArray();
      
      await client.close();
      console.log('[CONVERSATIONS] Encontradas', docs.length, 'conversaciones');
      return res.status(200).json({ 
        conversations: docs.map((d) => ({ ...d, id: String(d._id) })) 
      });
    }

    // POST - Crear conversación
    if (req.method === 'POST') {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
      }
      
      console.log('[CONVERSATIONS] Body recibido:', body);
      
      let title = 'Nueva conversación';
      try {
        const parsed = JSON.parse(body || '{}');
        title = parsed.title || 'Nueva conversación';
      } catch (e) {
        console.log('[CONVERSATIONS] Error al parsear body:', e.message);
      }
      
      console.log('[CONVERSATIONS] Creando conversación:', title, 'para usuario:', payload.userId);
      
      const now = Date.now();
      const doc = {
        userId: payload.userId,
        title: String(title).slice(0, 80),
        createdAt: now,
        updatedAt: now,
        messages: [],
      };
      
      console.log('[CONVERSATIONS] Insertando en MongoDB...');
      const result = await col.insertOne(doc);
      await client.close();
      
      console.log('[CONVERSATIONS] Conversación creada exitosamente:', result.insertedId);
      return res.status(201).json({ 
        conversation: { ...doc, id: String(result.insertedId) } 
      });
    }

    // DELETE - Eliminar conversación
    if (req.method === 'DELETE') {
      const id = req.query?.id;
      
      if (!id) {
        await client.close();
        return res.status(400).json({ error: 'Falta el id de la conversación.' });
      }

      console.log('[CONVERSATIONS] Eliminando conversación:', id);
      
      try {
        const result = await col.deleteOne({ 
          _id: new ObjectId(id), 
          userId: payload.userId 
        });
        
        await client.close();
        
        if (result.deletedCount === 0) {
          return res.status(404).json({ error: 'Conversación no encontrada.' });
        }
        
        console.log('[CONVERSATIONS] Conversación eliminada');
        return res.status(200).json({ ok: true });
      } catch (e) {
        await client.close();
        console.log('[CONVERSATIONS] Error al eliminar:', e.message);
        return res.status(400).json({ error: 'ID de conversación inválido.' });
      }
    }

    await client.close();
    return res.status(405).json({ error: 'Método no permitido' });
    
  } catch (error) {
    console.error('[CONVERSATIONS] Error:', error);
    return res.status(500).json({
      error: 'Error al procesar conversaciones',
      details: error.message || 'Error desconocido',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
