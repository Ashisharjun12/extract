import mongoose from 'mongoose';
import { _config } from './config.js';

export default async function connectDB() {
  if (!_config.DATABASE_URI) {
    throw new Error('DATABASE_URI is not configured.');
  }
  await mongoose.connect(_config.DATABASE_URI);
  console.log('[db] MongoDB connected');
}
