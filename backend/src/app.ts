import cors from 'cors';
import express, { Request, Response } from 'express';
import helmet from 'helmet';
import morgan from 'morgan';

import { env } from './config/env';
import { errorHandler, notFound } from './middlewares/error.middleware';
import apiV1Routes from './routes';

const app = express();

// Necesario para que req.ip refleje la IP real del cliente (auditoria M02)
// cuando el backend corre detras de un proxy/balanceador.
app.set('trust proxy', 1);

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (env.nodeEnv !== 'test') {
  app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));
}

app.get('/', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    service: 'klassy-nucleo-institucional',
    api: '/api/v1',
    health: '/health',
  });
});

app.get('/favicon.ico', (_req: Request, res: Response) => {
  res.status(204).end();
});

app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', service: 'klassy-nucleo-institucional' });
});

app.use('/api/v1', apiV1Routes);

app.use(notFound);
app.use(errorHandler);

export default app;
