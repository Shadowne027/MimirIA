import { MongoClient } from 'mongodb';

let cachedClient = null;
let cachedDb = null;

export async function connectToDatabase() {
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  if (!process.env.MONGODB_URI) {
    throw new Error('Please define the MONGODB_URI environment variable');
  }

  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db('mimir-ia');

  cachedClient = client;
  cachedDb = db;

  return { client, db };
}

export async function GET(request, { params }) {
  try {
    const { id } = params;

    const { db } = await connectToDatabase();
    
    const conversation = await db.collection('conversations').findOne({ _id: id });
    
    if (!conversation) {
      return new Response(JSON.stringify({ error: 'Conversación no encontrada' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      ...conversation,
      id: conversation._id,
      _id: undefined
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Get conversation error:', error);
    return new Response(JSON.stringify({ error: 'Error interno del servidor' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function PATCH(request, { params }) {
  try {
    const { id } = params;
    const body = await request.json();
    const { title } = body;

    if (!title || typeof title !== 'string') {
      return new Response(JSON.stringify({ error: 'Título inválido' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const { db } = await connectToDatabase();
    
    const result = await db.collection('conversations').updateOne(
      { _id: id },
      { $set: { title, updatedAt: new Date() } }
    );

    if (result.matchedCount === 0) {
      return new Response(JSON.stringify({ error: 'Conversación no encontrada' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const updated = await db.collection('conversations').findOne({ _id: id });

    return new Response(JSON.stringify({
      ...updated,
      id: updated._id,
      _id: undefined
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Update conversation error:', error);
    return new Response(JSON.stringify({ error: 'Error interno del servidor' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = params;

    const { db } = await connectToDatabase();
    
    const result = await db.collection('conversations').deleteOne({ _id: id });

    if (result.deletedCount === 0) {
      return new Response(JSON.stringify({ error: 'Conversación no encontrada' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Delete conversation error:', error);
    return new Response(JSON.stringify({ error: 'Error interno del servidor' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
