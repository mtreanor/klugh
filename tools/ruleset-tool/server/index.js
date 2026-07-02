import express from 'express';
import { router } from './routes.js';
import { configPath } from './config.js';

const PORT = process.env.PORT || 5174;

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use('/api', router);

const server = app.listen(PORT, () => {
  console.log(`ruleset-tool API listening on http://localhost:${PORT}`);
  console.log(`  project config: ${configPath}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `\n[ruleset-tool] Port ${PORT} is already in use — another process (likely a ` +
      `stale dev server) is holding it. The Vite proxy expects the API here, so the ` +
      `UI would get HTML instead of JSON.\n` +
      `Free it with:  lsof -nP -iTCP:${PORT} -sTCP:LISTEN   then  kill <pid>\n` +
      `or run on another port:  PORT=5184 npm run server  (and update the proxy in vite.config.js).\n`,
    );
    process.exit(1);
  }
  throw err;
});
