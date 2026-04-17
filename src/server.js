const express = require('express');
const helmet = require('helmet');
const client = require('prom-client');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(express.json({ limit: '100kb' }));

const register = new client.Registry();
client.collectDefaultMetrics({ register, prefix: 'taskapi_' });

const httpRequestsTotal = new client.Counter({
  name: 'taskapi_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code']
});

const httpRequestDuration = new client.Histogram({
  name: 'taskapi_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5]
});

const httpErrorsTotal = new client.Counter({
  name: 'taskapi_http_errors_total',
  help: 'Total number of HTTP responses with status code >= 500',
  labelNames: ['method', 'route', 'status_code']
});

register.registerMetric(httpRequestsTotal);
register.registerMetric(httpRequestDuration);
register.registerMetric(httpErrorsTotal);

app.use((req, res, next) => {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const duration = Number(process.hrtime.bigint() - start) / 1e9;
    const route = req.route && req.route.path ? req.route.path : req.path;
    const labels = {
      method: req.method,
      route,
      status_code: String(res.statusCode)
    };

    httpRequestsTotal.inc(labels);
    httpRequestDuration.observe(labels, duration);

    if (res.statusCode >= 500) {
      httpErrorsTotal.inc(labels);
    }
  });

  next();
});

let tasks = [
  { id: 1, title: 'Learn DevSecOps', completed: false }
];

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.get('/api/tasks', (req, res) => {
  res.json(tasks);
});

app.post('/api/tasks', (req, res) => {
  if (!req.body.title || typeof req.body.title !== 'string') {
    return res.status(400).json({ error: 'title is required' });
  }

  const task = {
    id: tasks.length + 1,
    title: req.body.title,
    completed: false
  };

  tasks.push(task);
  res.status(201).json(task);
});

app.get('/api/tasks/:id', (req, res) => {
  const task = tasks.find((item) => item.id === Number.parseInt(req.params.id, 10));
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }

  res.json(task);
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
