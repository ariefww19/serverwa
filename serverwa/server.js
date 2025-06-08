const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const express = require('express');
const qrcode = require('qrcode-terminal');
const bodyParser = require('body-parser');
const cors = require('cors');
const mime = require('mime-types');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Enhanced CORS configuration
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS || '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Middleware
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'WhatsApp API is running',
    version: '1.0.0',
    documentation: '/status - Check WhatsApp connection status'
  });
});

// WhatsApp Client initialization with enhanced options
const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: process.env.WA_DATA_PATH || './auth_data'
  }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-gpu'
    ]
  },
  webVersionCache: {
    type: 'remote',
    remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html'
  }
});

// QR Code for authentication
client.on('qr', qr => {
  console.log('QR RECEIVED', qr);
  qrcode.generate(qr, { small: true });
});

// When authenticated
client.on('authenticated', () => {
  console.log('AUTHENTICATED');
});

// When ready
client.on('ready', () => {
  console.log('Client is ready!');
});

// Handle errors
client.on('auth_failure', msg => {
  console.error('AUTHENTICATION FAILURE', msg);
});

client.on('disconnected', (reason) => {
  console.log('Client was logged out', reason);
});

// Initialize WhatsApp client
client.initialize().catch(err => {
  console.error('Failed to initialize client', err);
});

// Endpoint to send text message
app.post('/send-message', async (req, res) => {
  try {
    const { number, message } = req.body;
    
    if (!number || !message) {
      return res.status(400).json({
        success: false,
        message: 'Number and message are required'
      });
    }
    
    const formattedNumber = number.includes('@c.us') 
      ? number 
      : `${number.replace(/^0|\+|\D/g, '')}@c.us`;
    
    const sendMessage = await client.sendMessage(formattedNumber, message);
    
    res.json({
      success: true,
      message: 'Message sent successfully',
      data: sendMessage.id._serialized
    });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send message',
      error: error.message
    });
  }
});

// Endpoint to send base64 image
app.post('/send-image', async (req, res) => {
  try {
    const { number, caption, imageBase64, mimeType = 'image/jpeg' } = req.body;

    if (!imageBase64 || !number) {
      return res.status(400).json({ 
        success: false,
        error: 'Number and imageBase64 are required' 
      });
    }

    const formattedNumber = number.includes('@c.us') 
      ? number 
      : `${number.replace(/^0|\+|\D/g, '')}@c.us`;

    const media = new MessageMedia(
      mimeType,
      imageBase64,
      `image.${mime.extension(mimeType)}`
    );

    const sendResult = await client.sendMessage(formattedNumber, media, {
      caption: caption || '',
      sendMediaAsDocument: false
    });

    res.json({
      success: true,
      message: 'Image sent successfully',
      data: sendResult.id._serialized
    });
  } catch (error) {
    console.error('Error sending image:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send image',
      error: error.message
    });
  }
});

// Connection status endpoint
app.get('/status', (req, res) => {
  const isConnected = client.info ? true : false;
  res.json({
    connected: isConnected,
    status: isConnected ? 'Connected' : 'Waiting for connection',
    info: isConnected ? {
      wid: client.info.wid.user,
      platform: client.info.platform,
      pushname: client.info.pushname
    } : null
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: err.message
  });
});

// Start server
app.listen(port, () => {
  console.log(`WhatsApp API running on port ${port}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  client.destroy();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  client.destroy();
  process.exit(0);
});