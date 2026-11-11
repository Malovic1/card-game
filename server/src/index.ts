import express from 'express';
import http from 'http';
import cors from 'cors';
import { setupSocketIo } from './rooms';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', game: 'treseta' });
});

const httpServer = http.createServer(app);
const io = setupSocketIo(httpServer);

const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
  console.log(`Tréseta server listening on http://localhost:${PORT}`);
});
