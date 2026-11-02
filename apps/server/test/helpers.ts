import { openDatabase } from '../src/db/database.js';

// Database SQLite trong bộ nhớ, đã chạy migration — mỗi test một database riêng.
export const memoryDb = () => openDatabase(':memory:');
