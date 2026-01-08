require('dotenv').config(); // Load .env variables
const express = require('express');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const session = require('express-session');
const axios = require('axios');
const multer = require('multer');
const FormData = require('form-data');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.set('view engine', 'ejs');

// Session config
app.use(session({ 
    secret: 'google-drive-app-secret', 
    resave: false, 
    saveUninitialized: true 
}));

app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

// --- Google OAuth Strategy ---
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_REDIRECT_URI
  },
  (accessToken, refreshToken, profile, done) => {
    // Access token ko profile ke saath save kar rahe hain
    profile.token = accessToken;
    return done(null, profile);
  }
));

// --- Routes ---

app.get('/', (req, res) => {
    res.render('index', { user: req.user });
});

// Auth Trigger Route
app.get('/auth/google',
  passport.authenticate('google', { 
    scope: ['profile', 'https://www.googleapis.com/auth/drive'],
    accessType: 'offline',
    prompt: 'consent'
  })
);

// Auth Callback Route
app.get('/auth/google/callback', 
  passport.authenticate('google', { failureRedirect: '/' }),
  (req, res) => res.redirect('/')
);

// Upload Proxy Route (Forwarding to FastAPI)
app.post('/upload', upload.single('logo'), async (req, res) => {
    try {
        const form = new FormData();
        form.append('folder', req.body.folder);
        form.append('logo', req.file.buffer, {
            filename: req.file.originalname,
            contentType: req.file.mimetype,
        });

        const response = await axios.post('http://localhost:8000/watermark/start', form, {
            headers: {
                ...form.getHeaders(),
                'Authorization': `Bearer ${req.body.token}` // FastAPI ko token bhej raha hai
            }
        });
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: 'Backend connection failed' });
    }
});

// Progress Proxy
app.get('/status/:taskId', async (req, res) => {
    try {
        const response = await axios.get(`http://localhost:8000/watermark/progress/${req.params.taskId}`);
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: 'Status fetch failed' });
    }
});

app.get('/logout', (req, res) => {
    req.logout(() => res.redirect('/'));
});

app.listen(3000, () => console.log('Server: http://localhost:3000'));
