import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';

const app = express();
const PORT = process.env.PORT || 3333;
const OPENAI_BASE = (process.env.OPENAI_BASE || 'https://api.openai.com/v1').replace(/\/$/, '');
const KEY = process.env.OPENAI_API_KEY;
const PROXY_TOKEN = process.env.CG_PROXY_TOKEN || '';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'null')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowedOriginSet = new Set(ALLOWED_ORIGINS);
const allowNullOrigin = allowedOriginSet.has('null');
const allowAnyOrigin = allowedOriginSet.has('*');

if (!PROXY_TOKEN) {
  console.warn('⚠️  CG_PROXY_TOKEN is not set; proxy requests will be rejected until it is configured.');
}

const isAllowedOrigin = (origin) => {
  if (!origin) {
    return true;
  }

  if (allowAnyOrigin) {
    return true;
  }

  if (origin === 'null') {
    return allowNullOrigin;
  }

  return allowedOriginSet.has(origin);
};

const corsOptions = {
  origin(origin, callback) {
    if (!origin) {
      // Non-browser or same-origin requests (e.g. curl) omit Origin; allow them.
      return callback(null, false);
    }

    if (isAllowedOrigin(origin)) {
      return callback(null, origin);
    }

    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CG-Proxy-Token'],
};

app.use((req, res, next) => {
  if (isAllowedOrigin(req.headers.origin)) {
    return next();
  }

  res.status(403).json({ error: 'Origin not allowed' });
});

app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));

function requireProxyToken(req, res, next) {
  if (req.method === 'OPTIONS') {
    return next();
  }

  if (!PROXY_TOKEN) {
    return res.status(500).json({ error: 'Proxy misconfigured: missing CG_PROXY_TOKEN' });
  }

  const providedToken = req.get('x-cg-proxy-token');
  if (providedToken !== PROXY_TOKEN) {
    return res.status(401).json({ error: 'Invalid or missing proxy token' });
  }

  return next();
}

app.use('/v1', requireProxyToken);

app.use((err, _req, res, next) => {
  if (err && err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'Origin not allowed' });
  }
  return next(err);
});

// Health check
app.get('/health', (_req, res) => res.json({ ok: true }));

// Models endpoint passthrough
app.get('/v1/models', async (req, res) => {
  console.log('📡 Models request received');
  try {
    const authHeader = `Bearer ${KEY}`;

    if (!KEY) {
      console.error('❌ Missing API key in server environment');
      return res.status(401).json({ error: 'Missing API key in server environment' });
    }

    console.log('🔑 Using configured API key');
    const r = await retryRequest(`${OPENAI_BASE}/models`, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Connection': 'close', // Prevent connection reuse issues
      },
    });

    if (!r.ok) {
      const errorData = await r.text();
      console.error('❌ OpenAI models API error:', r.status, errorData);
      return res.status(r.status).json({ error: 'Failed to fetch models from OpenAI' });
    }

    const data = await r.json();
    console.log('✅ Successfully fetched', data.data?.length || 0, 'models');
    res.json(data);
  } catch (err) {
    console.error('💥 Models endpoint error after retries:', err);
    res.status(500).json({ 
      error: 'Proxy error after retries', 
      detail: String(err),
      code: err.code || 'UNKNOWN' 
    });
  }
});

// Helper function for retrying requests with exponential backoff
async function retryRequest(url, options, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 Attempt ${attempt}/${maxRetries} for ${url}`);
      const response = await fetch(url, {
        ...options,
        timeout: 30000, // 30 second timeout
        agent: false, // Don't reuse connections
      });
      return response;
    } catch (error) {
      const isRetryableError = error.code === 'ECONNRESET' || 
                              error.code === 'ENOTFOUND' || 
                              error.code === 'ECONNREFUSED' ||
                              error.type === 'system';
      
      if (attempt === maxRetries || !isRetryableError) {
        throw error;
      }
      
      // Exponential backoff: 1s, 2s, 4s
      const delay = Math.pow(2, attempt - 1) * 1000;
      console.log(`⏱️  Retrying in ${delay}ms due to ${error.code || error.type}...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// Helper function to filter parameters based on model capabilities
function filterParametersForModel(body) {
  const model = body.model || '';
  const filteredBody = { ...body };
  
  // O1 models have strict parameter requirements
  if (model.includes('o1')) {
    console.log('🔧 Adjusting parameters for O1 model:', model);
    
    // O1 models only support temperature = 1 (default)
    if (filteredBody.temperature !== undefined && filteredBody.temperature !== 1) {
      console.log(`   • Removing temperature ${filteredBody.temperature} (O1 only supports default)`);
      delete filteredBody.temperature;
    }
    
    // O1 models don't support response_format
    if (filteredBody.response_format) {
      console.log('   • Removing response_format (not supported by O1 models)');
      delete filteredBody.response_format;
    }
    
    // O1 models don't support cache_control yet
    if (filteredBody.messages) {
      const hadCaching = filteredBody.messages.some(msg => msg.cache_control);
      filteredBody.messages = filteredBody.messages.map(msg => {
        if (msg.cache_control) {
          const { cache_control, ...msgWithoutCache } = msg;
          return msgWithoutCache;
        }
        return msg;
      });
      if (hadCaching) {
        console.log('   • Removing cache_control (not supported by O1 models)');
      }
    }
  } else {
    // GPT-4 and other models support these parameters
    console.log('✅ Using full parameter set for model:', model);
  }
  
  return filteredBody;
}

// Generic pass-through for chat completions
app.post('/v1/chat/completions', async (req, res) => {
  console.log('💬 Chat completion request received');
  
  // Check if caching is being used (before filtering)
  const hasCaching = req.body.messages?.some(msg => msg.cache_control?.type === 'ephemeral');
  if (hasCaching) {
    console.log('⚡ Prompt caching enabled in request');
  }
  
  try {
    // Accept either browser-sent key OR use server env key
    const authHeader = req.headers.authorization && req.headers.authorization.startsWith('Bearer ')
      ? req.headers.authorization
      : `Bearer ${KEY}`;

    if (!authHeader || authHeader === 'Bearer undefined') {
      console.error('❌ Missing API key for chat completions');
      return res.status(401).json({ error: 'Missing API key' });
    }

    // Filter parameters based on model capabilities
    const filteredBody = filterParametersForModel(req.body);

    console.log('🤖 Sending request to OpenAI...');
    const r = await retryRequest(`${OPENAI_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
        'Connection': 'close', // Prevent connection reuse issues
      },
      body: JSON.stringify(filteredBody),
    });

    console.log('📨 OpenAI response status:', r.status);
    res.status(r.status);
    
    // Handle the response properly
    if (r.ok) {
      const data = await r.text();
      res.set('Content-Type', r.headers.get('content-type') || 'application/json');
      res.send(data);
    } else {
      const errorText = await r.text();
      console.error('❌ OpenAI API error:', r.status, errorText);
      res.send(errorText);
    }
  } catch (err) {
    console.error('💥 Chat completions error after retries:', err);
    res.status(500).json({ 
      error: 'Proxy error after retries', 
      detail: String(err),
      code: err.code || 'UNKNOWN' 
    });
  }
});

// (Optional) responses endpoint passthrough
app.post('/v1/responses', async (req, res) => {
  try {
    const authHeader = req.headers.authorization && req.headers.authorization.startsWith('Bearer ')
      ? req.headers.authorization
      : `Bearer ${KEY}`;
    const r = await fetch(`${OPENAI_BASE}/responses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
      body: JSON.stringify(req.body),
    });
    res.status(r.status);
    r.body.pipe(res);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Proxy error', detail: String(err) });
  }
});

app.listen(PORT, () => console.log(`Coding-Grammarly proxy on http://localhost:${PORT}`));
