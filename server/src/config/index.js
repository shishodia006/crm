import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';


// Explicitly load .env file from the server root directory
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// .env is loaded via node --env-file=.env flag in package.json scripts

export const config = {
  appName: process.env.APP_NAME || 'Dot Domino CRM',
  env: process.env.NODE_ENV || 'development',
  appUrl: (process.env.APP_URL || 'http://localhost:5173').replace(/\/+$/, ''),
  sessionSecret: process.env.SESSION_SECRET || 'dot-domino-change-this-secret',
  appKey: process.env.APP_KEY || process.env.SESSION_SECRET || 'dot-domino-change-this-secret',
  deliveryMode: process.env.DELIVERY_MODE || 'live',
  apiToken: process.env.API_TOKEN || '',
  cronSecret: process.env.CRON_SECRET || '',
  perPage: Number(process.env.PER_PAGE || 25),
  dripBatchSize: Number(process.env.DRIP_BATCH_SIZE || 50),
  dedupWindowHours: Number(process.env.DEDUP_WINDOW_HOURS || 24),
  sms: {
    provider: process.env.SMS_PROVIDER || 'mshastra',
    apiUrl: process.env.SMS_API_URL || '',
    apiKey: process.env.SMS_API_KEY || '',
    sender: process.env.SMS_SENDER || '',
    mshastra: {
      url: process.env.SMS_MSHASTRA_URL || 'https://mshastra.com/sendurl.aspx',
      user: process.env.SMS_MSHASTRA_USER || '',
      pwd: process.env.SMS_MSHASTRA_PWD || '',
      sender: process.env.SMS_MSHASTRA_SENDER || ''
    }
  },
  uploadPath: process.env.UPLOAD_PATH
    ? path.resolve(__dirname, '../..', process.env.UPLOAD_PATH)
    : path.resolve(__dirname, '../../../uploads'),
  port: Number(process.env.PORT || 8090),
 
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    database: process.env.DB_NAME || 'dot_domino_crm',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    charset: 'utf8mb4'
}
};
