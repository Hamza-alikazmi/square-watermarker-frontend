require('dotenv').config(); 
const express = require('express');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const session = require('express-session');
const axios = require('axios');
const multer = require('multer');
const FormData = require('form-data');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// Backend URL from .env (FastAPI location)
const FASTAPI_URL = process.env.BACKEND_URL || 'http://localhost:8000';

app.set('view engine', 'ejs');

// Trust proxy for secure cookies on platforms like Koyeb
app.set('trust proxy', 1);

app.use(session({ 
    secret: 'google-drive-app-secret', 
    resave: false, 
    saveUninitialized: true,
    cookie: { secure: process.env.NODE_ENV === 'production' } // Production mein secure cookies
}));

app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_REDIRECT_URI
  },
  (accessToken, refreshToken, profile, done) => {
    profile.token = accessToken;
    return done(null, profile);
  }
));

// --- Routes ---

app.get('/', (req, res) => {
    res.render('index', { user: req.user });
});

app.get('/auth/google',
  passport.authenticate('google', { 
    scope: ['profile', 'https://www.googleapis.com/auth/drive'],
    accessType: 'offline',
    prompt: 'consent'
  })
);

app.get('/auth/google/callback', 
  passport.authenticate('google', { failureRedirect: '/' }),
  (req, res) => res.redirect('/')
);

// Forwarding to FastAPI using BACKEND_URL from .env
app.post('/upload', upload.single('logo'), async (req, res) => {
    try {
        const form = new FormData();
        form.append('folder', req.body.folder);
        form.append('logo', req.file.buffer, {
            filename: req.file.originalname,
            contentType: req.file.mimetype,
        });

        // Updated to use FASTAPI_URL variable
        const response = await axios.post(`${FASTAPI_URL}/watermark/start`, form, {
            headers: {
                ...form.getHeaders(),
                'Authorization': `Bearer ${req.body.token}`
            }
        });
        res.json(response.data);
    } catch (error) {
        console.error("Proxy Error:", error.message);
        res.status(500).json({ error: 'FastAPI Backend connection failed' });
    }
});

// Progress Proxy using BACKEND_URL
app.get('/status/:taskId', async (req, res) => {
    try {
        const response = await axios.get(`${FASTAPI_URL}/watermark/progress/${req.params.taskId}`);
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: 'Status fetch failed' });
    }
});

app.get('/logout', (req, res) => {
    req.logout((err) => {
        if (err) return next(err);
        res.redirect('/');
    });
});

// Privacy Policy Route
app.get('/privacy', (req, res) => {
    res.render('privacy');
});

// Terms of Service Route
app.get('/terms', (req, res) => {
    res.render('terms');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Frontend Proxy Server running on port ${PORT}`));