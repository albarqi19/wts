const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const CONFIG = require('./paths');

function configureServer(io) {
    const app = express();
    const server = http.createServer(app);

    // إعداد الوسائط (middleware)
    app.use(cors());
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // تضمين كائن Socket.IO في الطلبات HTTP
    app.use((req, res, next) => {
        req.io = io;
        next();
    });

    // تعيين المجلد العام للملفات الثابتة
    app.use(express.static(CONFIG.PUBLIC_DIR));

    // الصفحة الرئيسية
    app.get('/', (req, res) => {
        res.sendFile(path.join(CONFIG.PUBLIC_DIR, 'index.html'));
    });

    // إضافة مسارات محددة للصفحات الأخرى
    app.get('/devices', (req, res) => {
        res.sendFile(path.join(CONFIG.PUBLIC_DIR, 'devices.html'));
    });

    app.get('/chats', (req, res) => {
        res.sendFile(path.join(CONFIG.PUBLIC_DIR, 'chats.html'));
    });

    app.get('/contacts', (req, res) => {
        res.sendFile(path.join(CONFIG.PUBLIC_DIR, 'contacts.html'));
    });

    app.get('/integration', (req, res) => {
        res.sendFile(path.join(CONFIG.PUBLIC_DIR, 'integration.html'));
    });

    return { app, server };
}

module.exports = configureServer;
