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

export async function GET() {
  try {
    const { db } = await connectToDatabase();
    
    const conversations = await db.collection('conversations')
      .find({})
      .sort({ updatedAt: -1 })
      .limit(50)
      .toArray();

    return new Response(JSON.stringify(conversations.map(conv => ({
      ...conv,
      id: conv._id,
      _id: undefined
    }))), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('List conversations error:', error);
    return new Response(JSON.stringify({ error: 'Error interno del servidor' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
