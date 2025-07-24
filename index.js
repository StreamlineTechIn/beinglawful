const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
const session = require('express-session');
const { body, validationResult } = require('express-validator');
const nodemailer = require('nodemailer');
const schedule = require('node-schedule');
require('dotenv').config();
const multer = require('multer');


// Multer setup for file uploads
const storage = multer.memoryStorage();const upload = multer({
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/', 'video/', 'application/pdf'];
        if (allowedTypes.some(type => file.mimetype.startsWith(type))) {
            cb(null, true);
        } else {
            cb(new Error('Only images, videos, and PDF files are allowed'), false);
        }
    }
}).fields([
    { name: 'photos', maxCount: 10 },
    { name: 'videos', maxCount: 5 },
    { name: 'pdfs', maxCount: 5 } 
    
]);

const app = express();

// app.use('/zipfiles', express.static(path.join(__dirname, 'uploads', 'zipfiles')));

// Set view engine to EJS and specify the views directory
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
console.log('Views directory set to:', app.get('views'));

// Disable view cache for development
app.set('view cache', false);

// Session middleware
app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

// Parse JSON for fetch requests
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/activities', express.static('activities'));
// Trial test questions
const trialTests = {
    trial1: [
        { question: "Who is Cheif Minister of Maharashtra?", options: ["Devendra Fadnavis", "Udhav Thakarey", "Ajit Pawar", "Eknath Shinde"], correctAnswer: "Devendra Fadnavis" },
        { question: "Who is President of India?", options: ["Rahul Gandhi", "Narendra Modi", "Yogi Aditya Nath", "Dropady Murmu"], correctAnswer: "Dropady Murmu" }
    ],
    trial2: [
        { question: "What is the minimum age to vote in India?", options: ["16", "20", "18", "17"], correctAnswer: "18" },
        { question: "The Constitution of India was adopted on?", options: ["15 August 1947", "26 January 1950", "26 November 1949", "2 October 1950"], correctAnswer: "26 November 1949" }
    ]
};
    
// Validate environment variables for Firebase and Email
const requiredEnvVars = [
    'FIREBASE_PROJECT_ID',
    'FIREBASE_PRIVATE_KEY_ID',
    'FIREBASE_PRIVATE_KEY',
    'FIREBASE_CLIENT_EMAIL',
    'FIREBASE_CLIENT_ID',
    'FIREBASE_CLIENT_X509_CERT_URL',
    'EMAIL_USER',
    'EMAIL_PASS'
];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingEnvVars.length > 0) {
    console.error(`Missing environment variables: ${missingEnvVars.join(', ')}`);
    process.exit(1);
}

// Initialize Firebase Admin SDK
let db, bucket;
try {
    const serviceAccount = {
        type: "service_account",
        project_id: process.env.FIREBASE_PROJECT_ID,
        private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
        private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
        client_id: process.env.FIREBASE_CLIENT_ID,
        auth_uri: "https://accounts.google.com/o/oauth2/auth",
        token_uri: "https://oauth2.googleapis.com/token",
        auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
        client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
        universe_domain: "googleapis.com"
    };

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket: `${process.env.FIREBASE_PROJECT_ID}.beinglawful-ee5a4.firebasestorage.app`
    });
    db = admin.firestore();
    bucket = admin.storage().bucket(); // Moved inside try block after initialization
    console.log('Firebase initialized successfully');
} catch (error) {
    console.error('Failed to initialize Firebase:', error.message, error.stack);
    process.exit(1);

}

// Set up Express app
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '.')));

// Hardcoded admin credentials
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'admin123';

// Email setup
const transporter = nodemailer.createTransport({
    host: 'smtp-mail.outlook.com',
    port: 587,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    tls: {
        ciphers: 'SSLv3',
        rejectUnauthorized: false
    }
});
transporter.verify(function (error, success) {
    if (error) {
        console.log('SMTP Verify Error:', error);
    } else {
        console.log('SMTP Connection Success ✅ Ready to send emails');
    }
});
// Email templates
const emailTemplates = {
    schoolRegistration: {
        subject: 'School Registration Confirmation - Being Lawful',
        text: (schoolName, email, password) => `Dear ${schoolName},\n\nThank you for registering with Being Lawful! Your login credentials are:\n\nEmail: ${email}\nPassword: ${password}\n\nPlease use these to log in to your school dashboard.\n\nBest regards,\nBeing Lawful Team`,
        html: (schoolName, email, password) => `
            <h2>School Registration Confirmation</h2>
            <p>Dear ${schoolName},</p>
            <p>Thank you for registering with <strong>Being Lawful</strong>!</p>
            <p>Your login credentials are:</p>
            <ul>
                <li><strong>Email:</strong> ${email}</li>
                <li><strong>Password:</strong> ${password}</li>
            </ul>
            <p>Please use these to log in to your school dashboard.</p>
            <p>Best regards,<br>Being Lawful Team</p>
        `
    },
    trainerRegistration: {
        subject: 'Trainer Registration Confirmation - Being Lawful',
        text: (trainerName, email, password) => `Dear ${trainerName},\n\nThank you for registering as a trainer with Being Lawful! Your login credentials are:\n\nEmail: ${email}\nPassword: ${password}\n\nPlease use these to log in to your trainer dashboard.\n\nBest regards,\nBeing Lawful Team`,
        html: (trainerName, email, password) => `
            <h2>Trainer Registration Confirmation</h2>
            <p>Dear ${trainerName},</p>
            <p>Thank you for registering as a trainer with <strong>Being Lawful</strong>!</p>
            <p>Your login credentials are:</p>
            <ul>
                <li><strong>Email:</strong> ${email}</li>
                <li><strong>Password:</strong> ${password}</li>
            </ul>
            <p>Please use these to log in to your trainer dashboard.</p>
            <p>Best regards,<br>Being Lawful Team</p>
        `
    },
    schoolWorkshopReminder: {
        subject: 'Workshop Reminder - Being Lawful',
        text: (schoolName, eventDate) => `Dear ${schoolName},\n\nThis is a reminder for your upcoming workshop with Being Lawful scheduled on ${eventDate}. Please ensure all arrangements are in place.\n\nBest regards,\nBeing Lawful Team`,
        html: (schoolName, eventDate) => `
            <h2>Workshop Reminder</h2>
            <p>Dear ${schoolName},</p>
            <p>This is a reminder for your upcoming workshop with <strong>Being Lawful</strong> scheduled on <strong>${eventDate}</strong>.</p>
            <p>Please ensure all arrangements are in place.</p>
            <p>Best regards,<br>Being Lawful Team</p>
        `
    },
    studentWorkshopReminder: {
        subject: 'Workshop Reminder - Being Lawful',
        text: (studentName, eventDate) => `Dear ${studentName}'s Parent,\n\nThis is a reminder for the upcoming workshop at your child's school with Being Lawful, scheduled on ${eventDate}. We look forward to your child's participation.\n\nBest regards,\nBeing Lawful Team`,
        html: (studentName, eventDate) => `
            <h2>Workshop Reminder</h2>
            <p>Dear ${studentName}'s Parent,</p>
            <p>This is a reminder for the upcoming workshop at your child's school with <strong>Being Lawful</strong>, scheduled on <strong>${eventDate}</strong>.</p>
            <p>We look forward to your child's participation.</p>
            <p>Best regards,<br>Being Lawful Team</p>
        `
    }
};

// Send email function
const sendEmail = async (to, subject, text, html) => {
    try {
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to,
            subject,
            text,
            html
        };
        const info = await transporter.sendMail(mailOptions);
        console.log(`Email sent: ${info.messageId}`);
    } catch (error) {
        console.error(`Error sending email to ${to}:`, error.message, error.stack);
        throw error;
    }
};

// Utility Functions

// Fetch random questions from Firestore
async function getRandomQuestions(limit = 30) {
    try {
        const snapshot = await db.collection('mcqs').get();
        let questions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Filter valid questions
        questions = questions.filter(mcq => {
            const isValid = 
                mcq.question && typeof mcq.question === 'string' &&
                Array.isArray(mcq.options) && mcq.options.length >= 4 &&
                mcq.options.every(opt => typeof opt === 'string' && opt.trim()) &&
                mcq.correctAnswer && typeof mcq.correctAnswer === 'string' &&
                mcq.options.includes(mcq.correctAnswer);
            if (!isValid) console.warn(`Filtered out invalid MCQ: ${JSON.stringify(mcq)}`);
            return isValid;
        });

        // Fallback questions if not enough valid ones
        const fallbackQuestions = [
            { question: "What is the supreme law of India?", options: ["Parliament", "President", "Supreme Court", "Constitution"], correctAnswer: "Constitution" },
            { question: "When did the Indian Constitution come into effect?", options: ["15 August 1947", "26 January 1950", "2 October 1948", "26 November 1949"], correctAnswer: "26 January 1950" },
            { question: "Who is known as the father of the Indian Constitution?", options: ["Mahatma Gandhi", "Jawaharlal Nehru", "B. R. Ambedkar", "Rajendra Prasad"], correctAnswer: "B. R. Ambedkar" },
            { question: "How many fundamental rights are there in the Indian Constitution?", options: ["5", "6", "7", "8"], correctAnswer: "6" },
            { question: "Which part of the Constitution deals with Fundamental Rights?", options: ["Part I", "Part II", "Part III", "Part IV"], correctAnswer: "Part III" },
            { question: "Which Article guarantees the Right to Equality?", options: ["Article 12", "Article 14", "Article 16", "Article 19"], correctAnswer: "Article 14" },
            { question: "Right to Education is a fundamental right under which Article?", options: ["Article 21A", "Article 15", "Article 19", "Article 32"], correctAnswer: "Article 21A" },
            { question: "Directive Principles of State Policy are in which part of the Constitution?", options: ["Part IV", "Part V", "Part III", "Part VI"], correctAnswer: "Part IV" },
            { question: "Which Article allows the President to declare Emergency?", options: ["Article 352", "Article 356", "Article 360", "Article 370"], correctAnswer: "Article 352" },
            { question: "What does the Preamble of the Constitution declare India to be?", options: ["Monarchy", "Dictatorship", "Sovereign Republic", "Colony"], correctAnswer: "Sovereign Republic" },
            { question: "Which body interprets the Constitution?", options: ["Lok Sabha", "Rajya Sabha", "Supreme Court", "President"], correctAnswer: "Supreme Court" },
            { question: "What is the minimum age to vote in India?", options: ["16", "18", "21", "25"], correctAnswer: "18" },
            { question: "Which Article provides Right to Freedom of Religion?", options: ["Article 14", "Article 19", "Article 25", "Article 32"], correctAnswer: "Article 25" },
            { question: "Who elects the President of India?", options: ["Public", "Rajya Sabha", "Electoral College", "Prime Minister"], correctAnswer: "Electoral College" },
            { question: "Which Article deals with the abolition of untouchability?", options: ["Article 14", "Article 17", "Article 21", "Article 23"], correctAnswer: "Article 17" },
            { question: "What is the term of the Lok Sabha?", options: ["4 years", "5 years", "6 years", "7 years"], correctAnswer: "5 years" },
            { question: "Which is the highest judicial authority in India?", options: ["High Court", "District Court", "Supreme Court", "Cabinet"], correctAnswer: "Supreme Court" },
            { question: "How many schedules are there in the Indian Constitution?", options: ["10", "12", "8", "11"], correctAnswer: "12" },
            { question: "Which article ensures cultural and educational rights?", options: ["Article 15", "Article 29", "Article 21", "Article 14"], correctAnswer: "Article 29" },
            { question: "Which organ of the government makes laws?", options: ["Executive", "Judiciary", "Legislature", "Election Commission"], correctAnswer: "Legislature" },
            { question: "What is the role of the Election Commission?", options: ["Conducts elections", "Make laws", "Judicial review", "Budget allocation"], correctAnswer: "Conducts elections" },
            { question: "The Constitution of India was adopted on?", options: ["15 August 1947", "26 January 1950", "26 November 1949", "2 October 1950"], correctAnswer: "26 November 1949" },
            { question: "How many amendments have been made to the Constitution (as of 2024)?", options: ["80", "90", "100", "105"], correctAnswer: "105" },
            { question: "Which Article gives the Right to Constitutional Remedies?", options: ["Article 32", "Article 19", "Article 21", "Article 14"], correctAnswer: "Article 32" },
            { question: "Fundamental Duties were added to the Constitution in which year?", options: ["1950", "1976", "1980", "1992"], correctAnswer: "1976" },
            { question: "How many Fundamental Duties are listed in the Constitution?", options: ["10", "9", "12", "11"], correctAnswer: "11" },
            { question: "Who administers the oath to the President of India?", options: ["Prime Minister", "Speaker", "Chief Justice of India", "Vice President"], correctAnswer: "Chief Justice of India" },
            { question: "What is the meaning of 'Secular' in the Preamble?", options: ["Religious state", "No religion", "Equal respect to all religions", "One religion"], correctAnswer: "Equal respect to all religions" },
            { question: "The concept of Fundamental Rights is inspired by which country?", options: ["USA", "UK", "France", "Germany"], correctAnswer: "USA" },
            { question: "Which Article deals with the Right against Exploitation?", options: ["Article 19", "Article 23", "Article 15", "Article 21"], correctAnswer: "Article 23" }
        ];

        if (questions.length < limit) {
            console.warn(`Only ${questions.length} valid questions available. Using fallback questions.`);
            const needed = limit - questions.length;
            const shuffledFallbacks = [...fallbackQuestions].sort(() => Math.random() - 0.5);
            questions = [...questions, ...shuffledFallbacks.slice(0, needed)];
            
            while (questions.length < limit) {
                const additional = limit - questions.length;
                questions = [...questions, ...shuffledFallbacks.slice(0, additional)];
            }
        }

        questions = questions.sort(() => Math.random() - 0.5).slice(0, limit);
        return questions;
    } catch (error) {
        console.error('Error fetching random questions:', error.message, error.stack);
        throw error;
    }
}

// Fetch user by parentMobile1
async function getUserByParentMobile(parentMobile1) {
    try {
        const snapshot = await db.collection('participants')
            .where('parentMobile1', '==', parentMobile1)
            .get();
        if (snapshot.empty) {
            throw new Error(`No user found with parentMobile1: ${parentMobile1}`);
        }
        const user = snapshot.docs[0].data();
        const userId = snapshot.docs[0].id;
        return { user, userId };
    } catch (error) {
        console.error('Error in getUserByParentMobile:', error.message, error.stack);
        throw error;
    }
}

// Fetch event date details for a school
async function getEventDateDetails(schoolName) {
    try {
        console.log(`Fetching event date details for schoolName: ${schoolName}`);
        if (!schoolName) {
            console.warn('schoolName is empty or undefined');
            return { isEventDate: false, isOnOrAfterEventDate: false, eventDateMissing: true, eventDate: null };
        }

        const schoolSnapshot = await db.collection('schools')
            .where('schoolName', '==', schoolName)
            .get();
        
        if (schoolSnapshot.empty) {
            console.warn(`No school found with schoolName: ${schoolName}`);
            return { isEventDate: false, isOnOrAfterEventDate: false, eventDateMissing: true, eventDate: null };
        }

        const schoolData = schoolSnapshot.docs[0].data();
        const eventDateRaw = schoolData.eventDate;
        console.log(`Raw eventDate from Firestore: ${eventDateRaw}, Type: ${typeof eventDateRaw}`);

        if (!eventDateRaw || typeof eventDateRaw.toDate !== 'function') {
            console.warn('eventDate is null, undefined, or not a Firestore Timestamp:', eventDateRaw);
            return { isEventDate: false, isOnOrAfterEventDate: false, eventDateMissing: true, eventDate: null };
        }

        const eventDate = eventDateRaw.toDate();
        console.log(`Converted eventDate: ${eventDate}`);

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        eventDate.setHours(0, 0, 0, 0);

        console.log(`Today's date (normalized): ${today}`);
        console.log(`Event date (normalized): ${eventDate}`);

        const isEventDate = eventDate.getTime() === today.getTime();
        const isOnOrAfterEventDate = today.getTime() >= eventDate.getTime();
        console.log(`isEventDate result: ${isEventDate}`);
        console.log(`isOnOrAfterEventDate result: ${isOnOrAfterEventDate}`);

        const formattedEventDate = eventDate.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        return { isEventDate, isOnOrAfterEventDate, eventDateMissing: false, eventDate: formattedEventDate };
    } catch (error) {
        console.error('Error calculating event date details:', error.message, error.stack);
        return { isEventDate: false, isOnOrAfterEventDate: false, eventDateMissing: true, eventDate: null };
    }
}

// Middleware

// Check admin authentication
function requireAdmin(req, res, next) {
    if (req.session.isAdmin) {
        return next();
    }
    res.redirect('/admin-login');
}

// Check student authentication
function requireStudentAuth(req, res, next) {
    if (req.session.parentMobile1) {
        return next();
    }
    res.redirect('/login?error=Please%20login%20to%20access%20this%20page');
}

// Check if it's on or after the event date
    async function checkEventDate(req, res, next) {
        try {
            const parentMobile1 = req.session.parentMobile1 || req.params.parentMobile1;
            const { user } = await getUserByParentMobile(parentMobile1);
            const { isEventDate, isOnOrAfterEventDate, eventDateMissing, eventDate } = await getEventDateDetails(user.schoolNameDropdown || '');
            res.locals.isEventDate = isEventDate;
            res.locals.isOnOrAfterEventDate = isOnOrAfterEventDate;
            res.locals.eventDateMissing = eventDateMissing;
            res.locals.eventDate = eventDate;
            res.locals.user = user;
            next();
        } catch (error) {
            console.error('Error in checkEventDate middleware:', error.message, error.stack);
            res.locals.isEventDate = false;
            res.locals.isOnOrAfterEventDate = false;
            res.locals.eventDateMissing = true;
            res.locals.eventDate = null;
            next();
        }
    }

    // Send workshop reminder emails (runs daily)
    const checkAndSendWorkshopEmails = async () => {
        const today = new Date().toISOString().split('T')[0];
        console.log(`Checking for workshop reminders on ${today}`);

        const schoolsSnapshot = await db.collection('schools').where('isApproved', '==', true).get();
        console.log(`Found ${schoolsSnapshot.size} approved schools`);
        if (!schoolsSnapshot.empty) {
            for (const doc of schoolsSnapshot.docs) {
                const school = doc.data();
                const schoolName = school.schoolName;
                const schoolEmail = school.schoolEmail;

                if (school.eventDate && typeof school.eventDate.toDate === 'function') {
                    const eventDate = school.eventDate.toDate();
                    const eventDateString = eventDate.toISOString().split('T')[0];
                    console.log(`School ${schoolName} has event date ${eventDateString}`);

                    if (today === eventDateString) {
                        const formattedEventDate = eventDate.toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                        });
                        console.log(`Sending workshop reminder to ${schoolEmail} for event on ${formattedEventDate}`);
                        await sendEmail(
                            schoolEmail,
                            emailTemplates.schoolWorkshopReminder.subject,
                            emailTemplates.schoolWorkshopReminder.text(schoolName, formattedEventDate),
                            emailTemplates.schoolWorkshopReminder.html(schoolName, formattedEventDate)
                        );
                    }
                } else {
                    console.log(`School ${schoolName} has no event date`);
                }
            }
        } else {
            console.log('No approved schools found');
        }

        const studentsSnapshot = await db.collection('participants').where('hasCompletedMCQ', '==', true).get();
        console.log(`Found ${studentsSnapshot.size} students who completed MCQ`);
        if (!studentsSnapshot.empty) {
            for (const doc of studentsSnapshot.docs) {
                const student = doc.data();
                const studentName = student.studentName;
                const parentEmail = student.parentEmail;
                const schoolName = student.schoolNameDropdown;

                const schoolSnapshot = await db.collection('schools')
                    .where('schoolName', '==', schoolName)
                    .get();
                if (schoolSnapshot.empty) {
                    console.log(`No school found for student ${studentName} with schoolName ${schoolName}`);
                    continue;
                }

                const schoolData = schoolSnapshot.docs[0].data();
                if (schoolData.eventDate && typeof schoolData.eventDate.toDate === 'function') {
                    const eventDate = schoolData.eventDate.toDate();
                    const eventDateString = eventDate.toISOString().split('T')[0];
                    console.log(`Student ${studentName} linked to school ${schoolName} with event date ${eventDateString}`);

                    if (today === eventDateString && parentEmail) {
                        const formattedEventDate = eventDate.toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                        });
                        console.log(`Sending workshop reminder to ${parentEmail} for event on ${formattedEventDate}`);
                        await sendEmail(
                            parentEmail,
                            emailTemplates.studentWorkshopReminder.subject,
                            emailTemplates.studentWorkshopReminder.text(studentName, formattedEventDate),
                            emailTemplates.studentWorkshopReminder.html(studentName, formattedEventDate)
                        );
                    }
                } else {
                    console.log(`School ${schoolName} for student ${studentName} has no event date`);
                }
            }
        } else {
            console.log('No students found who completed MCQ');
        }
    };

    // Schedule daily email reminders at 10:30 PM IST
    const IST_OFFSET = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30
    const job = schedule.scheduleJob('30 22 * * *', () => {
        const now = new Date();
        const istTime = new Date(now.getTime() + IST_OFFSET);
        console.log(`Running email reminder job at ${istTime.toISOString()} IST (Server time: ${now.toISOString()})`);
        checkAndSendWorkshopEmails();
    });

// Routes

    // Home route (serves static HTML)
    app.get('/', (req, res) => {
        res.sendFile(path.join(__dirname, 'index.html'));
    });

// Login page (renders login.ejs)
    app.get('/login', (req, res) => {
        const error = req.query.error || null;
        res.render('login', { error });
    });

    // Student login (renders login.ejs or dashboard.ejs)
 app.post('/student-login', async (req, res) => {
    const { username, password } = req.body;
    try {
        if (!username || !password) {
            return res.render('login', { error: 'Username and password are required.' });
        }

        console.log(`Student login attempt for username: ${username}`);
        const { user, userId } = await getUserByParentMobile(username);

        if (!user) {
            return res.render('login', { error: 'Student not found.' });
        }

        // ✅ Approval Check
        if (!user.isApproved) {
            return res.render('login', { error: 'Approval pending. Please contact your school.' });
        }

        // ✅ Birthdate-based password check
        if (!user.birthdate || !/^\d{4}-\d{2}-\d{2}$/.test(user.birthdate)) {
            console.error(`Invalid birthdate format for user ${username}: ${user.birthdate}`);
            return res.render('login', { error: 'Invalid user data. Contact administrator.' });
        }

        const [year, month, day] = user.birthdate.split('-');
        const expectedPassword = `${day}${month}${year}`;
        if (password !== expectedPassword) {
            console.log(`Invalid password for username: ${username}. Expected: ${expectedPassword}, Got: ${password}`);
            return res.render('login', { error: 'Invalid username or password.' });
        }

        req.session.parentMobile1 = username;

        let mcqs = [];
        const hasCompletedMCQ = user.hasCompletedMCQ || false;
        if (!hasCompletedMCQ) {
            await db.runTransaction(async (transaction) => {
                const userRef = db.collection('participants').doc(userId);
                const userDoc = await transaction.get(userRef);
                const userData = userDoc.data();
                mcqs = userData.currentMcqs || [];
                if (mcqs.length === 0) {
                    mcqs = await getRandomQuestions(30);
                    transaction.update(userRef, { currentMcqs: mcqs });
                }
            });
        }

        const { isEventDate, isOnOrAfterEventDate, eventDateMissing, eventDate } = await getEventDateDetails(user.schoolNameDropdown || '');

        res.render('dashboard', {
            studentName: user.studentName || 'Unknown Student',
            parentMobile1: username,
            hasCompletedMCQ: hasCompletedMCQ,
            hasCompletedTrial1: user.hasCompletedTrial1 || false,
            hasCompletedTrial2: user.hasCompletedTrial2 || false,
            mcqs: mcqs,
            trial1: trialTests.trial1,
            trial2: trialTests.trial2,
            isEventDate: isEventDate,
            isOnOrAfterEventDate: isOnOrAfterEventDate,
            eventDateMissing: eventDateMissing,
            eventDate: eventDate,
            showResults: hasCompletedMCQ,
            score: user.score || 0,
            totalQuestions: user.totalQuestions || 30,
            percentage: user.percentage || 0,
             championMessage: user.championMessage || null
        });

    } catch (error) {
        console.error('Error during student login:', error.message, error.stack);
        res.render('login', { error: 'Login failed. Please try again later.' });
    }
});


    // Dashboard (renders dashboard.ejs)
   app.get('/dashboard/:parentMobile1', requireStudentAuth, checkEventDate, async (req, res) => {
    try {
        const parentMobile1 = req.session.parentMobile1;

        // ✅ Always fetch fresh participant data from Firestore
        const participantSnapshot = await db.collection('participants')
            .where('parentMobile1', '==', parentMobile1)
            .get();

        if (participantSnapshot.empty) {
            return res.redirect('/login?error=Student%20not%20found');
        }

        const participantDoc = participantSnapshot.docs[0];
        const participantDocId = participantDoc.id;
        const user = participantDoc.data(); // ✅ FRESH DATA

        let mcqs = [];
        const hasCompletedMCQ = user.hasCompletedMCQ || false;

        // ✅ Set MCQs if not completed
        if (!hasCompletedMCQ) {
            await db.runTransaction(async (transaction) => {
                const userRef = db.collection('participants').doc(participantDocId);
                const userDoc = await transaction.get(userRef);
                const userData = userDoc.data();
                mcqs = userData.currentMcqs || [];
                if (mcqs.length === 0) {
                    mcqs = await getRandomQuestions(30);
                    transaction.update(userRef, { currentMcqs: mcqs });
                }
            });
        }

        // ✅ Get participant media uploads
        const mediaSnapshot = await db.collection('participants')
            .doc(participantDocId)
            .collection('mediaUploads')
            .orderBy('uploadedAt', 'desc')
            .get();

        const mediaUploads = mediaSnapshot.docs.map(doc => doc.data());

        // ✅ Render dashboard with fresh Firestore data
        res.render('dashboard', {
            studentName: user.studentName || 'Unknown Student',
            parentMobile1,
            hasCompletedMCQ,
            hasCompletedTrial1: user.hasCompletedTrial1 || false,
            hasCompletedTrial2: user.hasCompletedTrial2 || false,
            mcqs,
            trial1: trialTests.trial1,
            trial2: trialTests.trial2,
            isEventDate: res.locals.isEventDate,
            isOnOrAfterEventDate: res.locals.isOnOrAfterEventDate,
            eventDateMissing: res.locals.eventDateMissing,
            eventDate: res.locals.eventDate,
            showResults: hasCompletedMCQ,
            score: user.score || 0,
            totalQuestions: user.totalQuestions || 30,
            percentage: user.percentage || 0,
            mediaUploads: mediaUploads || [],
            showMediaSection: false,
            isApproved: user.isApproved || false,
            isChampion: user.isChampion || false, // ✅ Include this
            championMessage: user.championMessage || ''// ✅ This will now be visible
        });

    } catch (error) {
        console.error('Error loading dashboard:', error);
        res.redirect('/login?error=Error%20loading%20dashboard');
    }
});




    // MCQ test (renders mcq.ejs)
    app.get('/mcq-test/:parentMobile1', requireStudentAuth, async (req, res) => {
        try {
            const parentMobile1 = req.session.parentMobile1;
            const { user, userId } = await getUserByParentMobile(parentMobile1);

            if (user.hasCompletedMCQ) {
                return res.status(400).send('You have already completed the MCQ test.');
            }
            if (!(user.hasCompletedTrial1 || false) || !(user.hasCompletedTrial2 || false)) {
                return res.status(400).send('Please complete both trial tests before starting the main exam.');
            }

            let mcqs = [];
            await db.runTransaction(async (transaction) => {
                const userRef = db.collection('participants').doc(userId);
                const userDoc = await transaction.get(userRef);
                const userData = userDoc.data();
                mcqs = userData.currentMcqs || [];
                if (mcqs.length === 0) {
                    mcqs = await getRandomQuestions(30);
                    transaction.update(userRef, { currentMcqs: mcqs });
                }
            });

            res.render('mcq', { parentMobile1, mcqs });
        } catch (error) {
            console.error('Error in MCQ test route:', error.message, error.stack);
            res.status(500).send('Error loading MCQ test.');
        }
    });

// Submit Trial 1 (renders dashboard.ejs)
    app.post('/submit-trial1', requireStudentAuth, async (req, res) => {
        try {
            const { parentMobile1, ...answers } = req.body;
            const { user, userId } = await getUserByParentMobile(parentMobile1);

            let score = 0, correctAnswers = 0, wrongAnswers = 0;
            const trial1 = trialTests.trial1;
            trial1.forEach((mcq, index) => {
                const userAnswer = answers[`q${index}`]?.trim().toLowerCase();
                const correctAnswer = mcq.correctAnswer?.trim().toLowerCase();
                const isCorrect = userAnswer === correctAnswer;
                if (isCorrect) {
                    score++;
                    correctAnswers++;
                } else {
                    wrongAnswers++;
                }
            });

            const totalQuestions = trial1.length;
            const percentage = Math.round((score / totalQuestions) * 100);
            const mcqs = await getRandomQuestions(30);

            await db.collection('participants').doc(userId).update({
                hasCompletedTrial1: true,
                trial1Score: score,
                trial1TotalQuestions: totalQuestions,
                trial1Percentage: percentage,
                trial1CorrectAnswers: correctAnswers,
                trial1WrongAnswers: wrongAnswers,
                currentMcqs: mcqs
            });

            const updatedUser = (await db.collection('participants').doc(userId).get()).data();
            const { isEventDate, isOnOrAfterEventDate, eventDateMissing, eventDate } = await getEventDateDetails(updatedUser.schoolNameDropdown || '');

            res.render('dashboard', {
                studentName: updatedUser.studentName || 'Unknown Student',
                parentMobile1,
                hasCompletedMCQ: updatedUser.hasCompletedMCQ || false,
                hasCompletedTrial1: true,
                hasCompletedTrial2: updatedUser.hasCompletedTrial2 || false,
                mcqs,
                trial1: trialTests.trial1,
                trial2: trialTests.trial2,
                isEventDate,
                isOnOrAfterEventDate,
                eventDateMissing,
                eventDate,
                showResults: updatedUser.hasCompletedMCQ || false,
                score: updatedUser.score || 0,
                totalQuestions: updatedUser.totalQuestions || 30,
                percentage: updatedUser.percentage || 0
            });
        } catch (error) {
            console.error('Error in submit-trial1 route:', error.message, error.stack);
            res.status(500).send('Error processing trial test.');
        }
    });

    // Submit Trial 2 (renders dashboard.ejs)
    app.post('/submit-trial2', requireStudentAuth, async (req, res) => {
        try {
            const { parentMobile1, ...answers } = req.body;
            const { user, userId } = await getUserByParentMobile(parentMobile1);

            let score = 0, correctAnswers = 0, wrongAnswers = 0;
            const trial2 = trialTests.trial2;
            trial2.forEach((mcq, index) => {
                const userAnswer = answers[`q${index}`]?.trim().toLowerCase();
                const correctAnswer = mcq.correctAnswer?.trim().toLowerCase();
                const isCorrect = userAnswer === correctAnswer;
                if (isCorrect) {
                    score++;
                    correctAnswers++;
                } else {
                    wrongAnswers++;
                }
            });

            const totalQuestions = trial2.length;
            const percentage = Math.round((score / totalQuestions) * 100);
            const mcqs = await getRandomQuestions(30);

            await db.collection('participants').doc(userId).update({
                hasCompletedTrial2: true,
                trial2Score: score,
                trial2TotalQuestions: totalQuestions,
                trial2Percentage: percentage,
                trial2CorrectAnswers: correctAnswers,
                trial2WrongAnswers: wrongAnswers,
                currentMcqs: mcqs
            });

            const updatedUser = (await db.collection('participants').doc(userId).get()).data();
            const { isEventDate, isOnOrAfterEventDate, eventDateMissing, eventDate } = await getEventDateDetails(updatedUser.schoolNameDropdown || '');

            res.render('dashboard', {
                studentName: updatedUser.studentName || 'Unknown Student',
                parentMobile1,
                hasCompletedMCQ: updatedUser.hasCompletedMCQ || false,
                hasCompletedTrial1: updatedUser.hasCompletedTrial1 || false,
                hasCompletedTrial2: true,
                mcqs,
                trial1: trialTests.trial1,
                trial2: trialTests.trial2,
                isEventDate,
                isOnOrAfterEventDate,
                eventDateMissing,
                eventDate,
                showResults: updatedUser.hasCompletedMCQ || false,
                score: updatedUser.score || 0,
                totalQuestions: updatedUser.totalQuestions || 30,
                percentage: updatedUser.percentage || 0
            });
        } catch (error) {
            console.error('Error in submit-trial2 route:', error.message, error.stack);
            res.status(500).send('Error processing trial test.');
        }
    });

    // Submit MCQ (renders dashboard.ejs)
    app.post('/submit-mcq', requireStudentAuth, async (req, res) => {
        try {
            const { parentMobile1, ...answers } = req.body;
            const { user, userId } = await getUserByParentMobile(parentMobile1);
            let mcqs = user.currentMcqs || [];

            if (mcqs.length === 0) {
                return res.status(400).send('No questions found for this test session.');
            }

            let score = 0, correctAnswers = 0, wrongAnswers = 0;
            mcqs.forEach((mcq, index) => {
                const userAnswer = answers[`q${index}`]?.trim().toLowerCase();
                const correctAnswer = mcq.correctAnswer?.trim().toLowerCase();
                const isCorrect = userAnswer === correctAnswer;
                if (isCorrect) {
                    score++;
                    correctAnswers++;
                } else {
                    wrongAnswers++;
                }
            });

            const totalQuestions = mcqs.length;
            const percentage = Math.round((score / totalQuestions) * 100);
            const newMcqs = await getRandomQuestions(30);

            await db.collection('participants').doc(userId).update({
                hasCompletedMCQ: true,
                score,
                totalQuestions,
                correctAnswers,
                wrongAnswers,
                percentage,
                completedAt: admin.firestore.FieldValue.serverTimestamp(),
                currentMcqs: newMcqs
            });

            const updatedUser = (await db.collection('participants').doc(userId).get()).data();
            const { isEventDate, isOnOrAfterEventDate, eventDateMissing, eventDate } = await getEventDateDetails(updatedUser.schoolNameDropdown || '');

            res.render('dashboard', {
                studentName: updatedUser.studentName || 'Unknown Student',
                parentMobile1,
                hasCompletedMCQ: true,
                hasCompletedTrial1: updatedUser.hasCompletedTrial1 || false,
                hasCompletedTrial2: updatedUser.hasCompletedTrial2 || false,
                mcqs: newMcqs,
                trial1: trialTests.trial1,
                trial2: trialTests.trial2,
                isEventDate,
                isOnOrAfterEventDate,
                eventDateMissing,
                eventDate,
                showResults: true,
                score,
                totalQuestions,
                percentage
            });
        } catch (error) {
            console.error('Error in submit-mcq route:', error.message, error.stack);
            res.status(500).send('Error processing your exam submission.');
        }
    });

// Game Zone (renders gamezone.ejs)
    app.get('/gamezone/:parentMobile1', requireStudentAuth, checkEventDate, async (req, res) => {
        try {
            const parentMobile1 = req.session.parentMobile1;
            const user = res.locals.user;

            if (!(user.hasCompletedMCQ || false)) {
                return res.status(400).send('Please complete the main exam to access the Game Zone.');
            }
            if (res.locals.eventDateMissing) {
                return res.status(400).send('Event date yet to decide.');
            }
            if (!res.locals.isOnOrAfterEventDate) {
                return res.status(400).send(`Game Zone is only available on or after the event date: ${res.locals.eventDate}.`);
            }

            res.render('gamezone', { studentName: user.studentName || 'Unknown Student', parentMobile1 });
        } catch (error) {
            console.error('Error in gamezone route:', error.message, error.stack);
            res.status(500).send('Error loading Game Zone.');
        }
    });

    //student dashboard upload media
   app.post('/student-dashboard/upload-media', upload, async (req, res) => {
    try {
        const { parentMobile1, mediaDescription, mediaLink } = req.body;
        const photos = req.files['photos'] || [];
        const videos = req.files['videos'] || [];

        if (!parentMobile1) {
            return res.status(400).send('Parent Mobile Number is required.');
        }

        const participantSnapshot = await db.collection('participants')
            .where('parentMobile1', '==', parentMobile1)
            .get();

        if (participantSnapshot.empty) {
            return res.status(404).send('Student not found.');
        }

        const participantId = participantSnapshot.docs[0].id;
        const participantData = participantSnapshot.docs[0].data();

        if (mediaDescription && mediaDescription.length > 1000) {
            return res.status(400).send('Media description cannot exceed 1000 words.');
        }

        const bucket = admin.storage().bucket('beinglawful-ee5a4.appspot.com');
        const mediaUploads = [];

        for (const file of photos) {
            const fileName = `studentMedia/${participantId}/photos/${Date.now()}_${file.originalname}`;
            const fileUpload = bucket.file(fileName);

            await fileUpload.save(file.buffer, { metadata: { contentType: file.mimetype } });
            const [url] = await fileUpload.getSignedUrl({ action: 'read', expires: '03-09-2491' });

            mediaUploads.push({
                url,
                type: 'image',
                path: fileName,
                description: mediaDescription || '',
                link: mediaLink || '',
                uploadedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }

        for (const file of videos) {
            const fileName = `studentMedia/${participantId}/videos/${Date.now()}_${file.originalname}`;
            const fileUpload = bucket.file(fileName);

            await fileUpload.save(file.buffer, { metadata: { contentType: file.mimetype } });
            const [url] = await fileUpload.getSignedUrl({ action: 'read', expires: '03-09-2491' });

            mediaUploads.push({
                url,
                type: 'video',
                path: fileName,
                description: mediaDescription || '',
                link: mediaLink || '',
                uploadedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }

        if (mediaUploads.length > 0) {
            const batch = db.batch();
            mediaUploads.forEach(upload => {
                const mediaRef = db.collection('participants').doc(participantId).collection('mediaUploads').doc();
                batch.set(mediaRef, upload);
            });
            await batch.commit();
        }

        const uploadedMediaSnapshot = await db.collection('participants').doc(participantId).collection('mediaUploads').orderBy('uploadedAt', 'desc').get();
        const allUploadedMedia = uploadedMediaSnapshot.docs.map(doc => doc.data());

        const updatedUser = (await db.collection('participants').doc(participantId).get()).data();
        const { isEventDate, isOnOrAfterEventDate, eventDateMissing, eventDate } = await getEventDateDetails(updatedUser.schoolNameDropdown || '');

        res.render('dashboard', {
            studentName: updatedUser.studentName || 'Unknown Student',
            parentMobile1,
            hasCompletedMCQ: updatedUser.hasCompletedMCQ || false,
            hasCompletedTrial1: updatedUser.hasCompletedTrial1 || false,
            hasCompletedTrial2: updatedUser.hasCompletedTrial2 || false,
            mcqs: updatedUser.currentMcqs || [],
            trial1: trialTests.trial1,
            trial2: trialTests.trial2,
            isEventDate,
            isOnOrAfterEventDate,
            eventDateMissing,
            eventDate,
            showResults: updatedUser.hasCompletedMCQ || false,
            score: updatedUser.score || 0,
            totalQuestions: updatedUser.totalQuestions || 30,
            percentage: updatedUser.percentage || 0,
            mediaUploads: allUploadedMedia,
            error: null
        });

    } catch (error) {
        console.error('Error uploading media:', error);
        res.status(500).send(`Error uploading media: ${error.message}`);
    }
});

app.get('/student-dashboard/media-upload/:parentMobile1', requireStudentAuth, async (req, res) => {
    try {
        const { parentMobile1 } = req.params;
        const user = res.locals.user;

        const participantSnapshot = await db.collection('participants')
            .where('parentMobile1', '==', parentMobile1)
            .get();

        if (participantSnapshot.empty) {
            return res.status(404).send('Student not found.');
        }

        const participantDocId = participantSnapshot.docs[0].id;
        const participantData = participantSnapshot.docs[0].data();

        const mediaSnapshot = await db.collection('participants')
            .doc(participantDocId)
            .collection('mediaUploads')
            .orderBy('uploadedAt', 'desc')
            .get();

        const participantMediaUploads = mediaSnapshot.docs.map(doc => doc.data());

        const { isEventDate, isOnOrAfterEventDate, eventDateMissing, eventDate } = await getEventDateDetails(participantData.schoolNameDropdown || '');

        res.render('dashboard', {
            studentName: participantData.studentName || 'Unknown Student',
            parentMobile1,
            hasCompletedMCQ: participantData.hasCompletedMCQ || false,
            hasCompletedTrial1: participantData.hasCompletedTrial1 || false,
            hasCompletedTrial2: participantData.hasCompletedTrial2 || false,
            mcqs: participantData.currentMcqs || [],
            trial1: trialTests.trial1,
            trial2: trialTests.trial2,
            isEventDate,
            isOnOrAfterEventDate,
            eventDateMissing,
            eventDate,
            showResults: participantData.hasCompletedMCQ || false,
            score: participantData.score || 0,
            totalQuestions: participantData.totalQuestions || 30,
            percentage: participantData.percentage || 0,
            mediaUploads: participantMediaUploads,
            showMediaSection: true
        });

    } catch (error) {
        console.error('Error loading media upload page:', error);
        res.redirect('/dashboard/' + req.params.parentMobile1);
    }
});


// Certificate (renders certificate.ejs)
    app.get('/certificate/:parentMobile1', requireStudentAuth, async (req, res) => {
        try {
            const parentMobile1 = req.session.parentMobile1;
            const { user } = await getUserByParentMobile(parentMobile1);

            if (!(user.hasCompletedMCQ || false)) {
                return res.status(400).send('Please complete the main exam to access the certificate.');
            }

            const schoolSnapshot = await db.collection('schools')
                .where('schoolName', '==', user.schoolNameDropdown || '')
                .get();
            const schoolName = schoolSnapshot.empty ? 'N/A' : schoolSnapshot.docs[0].data().schoolName;

            res.render('certificate', {
                studentName: user.studentName || 'Unknown Student',
                schoolName,
                percentage: user.percentage || 0,
                completedAt: user.completedAt ? user.completedAt.toDate().toLocaleDateString() : 'N/A',
                parentMobile1
            });
        } catch (error) {
            console.error('Error in certificate route:', error.message, error.stack);
            res.status(500).send('Error loading certificate.');
        }
    });

// ... (Existing imports and setup remain unchanged)

// Book Order Route
    app.post('/submit-book-order',
        [
            body('buyerName')
                .trim()
                .notEmpty()
                .withMessage('Buyer name is required')
                .matches(/^[A-Za-z\s]{2,}$/)
                .withMessage('Invalid name format'),
            body('email')
                .trim()
                .isEmail()
                .withMessage('Invalid email address'),
            body('phone')
                .trim()
                .matches(/^\d{10}$/)
                .withMessage('Phone number must be 10 digits'),
            body('address')
                .trim()
                .isLength({ min: 5 })
                .withMessage('Address must be at least 5 characters'),
            body('city')
                .trim()
                .matches(/^[A-Za-z\s]{2,}$/)
                .withMessage('Invalid city name'),
            body('pincode')
                .trim()
                .matches(/^\d{6}$/)
                .withMessage('Pincode must be 6 digits'),
            body('quantity')
                .isInt({ min: 1, max: 10 })
                .withMessage('Quantity must be between 1 and 10'),
        ],
        async (req, res) => {
            try {
                // Check for validation errors
                const errors = validationResult(req);
                if (!errors.isEmpty()) {
                    console.error('Validation errors:', errors.array());
                    return res.status(400).render('orderError', {
                        error: errors.array()[0].msg,
                        values: req.body,
                    });
                }

                const { buyerName, email, phone, address, city, pincode, quantity } = req.body;

                // Check for duplicate order by email or phone
                const ordersRef = db.collection('orders');
                const emailSnapshot = await ordersRef.where('email', '==', email).get();
                const phoneSnapshot = await ordersRef.where('phone', '==', phone).get();

                if (!emailSnapshot.empty) {
                    return res.status(400).render('orderError', {
                        error: 'An order with this email already exists.',
                        values: req.body,
                    });
                }
                if (!phoneSnapshot.empty) {
                    return res.status(400).render('orderError', {
                        error: 'An order with this phone number already exists.',
                        values: req.body,
                    });
                }

                // Save order to Firestore
                const orderData = {
                    buyerName,
                    email,
                    phone,
                    address,
                    city,
                    pincode,
                    quantity: parseInt(quantity),
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                };

                const orderRef = await ordersRef.add(orderData);
                console.log(`Order created with ID: ${orderRef.id}`);

                // Optionally send confirmation email (using existing nodemailer setup)
                await sendEmail(
                    email,
                    'Book Order Confirmation - Being Lawful',
                    `Dear ${buyerName},\n\nThank you for your book order! Your order ID is ${orderRef.id}.\n\nBest regards,\nBeing Lawful Team`,
                    `
                        <h2>Book Order Confirmation</h2>
                        <p>Dear ${buyerName},</p>
                        <p>Thank you for your book order with <strong>Being Lawful</strong>!</p>
                        <p>Your order ID is: <strong>${orderRef.id}</strong></p>
                        <p>Best regards,<br>Being Lawful Team</p>
                    `
                );

                // Render confirmation page
                res.render('orderConfirmation', {
                    buyerName,
                    email,
                    orderId: orderRef.id,
                });
            } catch (error) {
                console.error('Error in submit-book-order route:', error.message, error.stack);
                res.status(500).render('orderError', {
                    error: 'Failed to submit order. Please try again later.',
                    values: req.body,
                });
            }
        }
    );
    app.get('/buy-book', (req, res) => {
        try {
            res.render('buy-Book', { error: null }); // Render buy-book.ejs from views
        } catch (error) {
            console.error('Error rendering buy-book:', error.message, error.stack);
            res.status(500).render('orderError', { error: 'Failed to load the order form. Please try again later.' });
        }
    });

    app.post('/admin/assign-event-date-school/:id', requireAdmin, async (req, res) => {
        try {
            const schoolId = req.params.id;
            const { eventDate } = req.body;
            if (!eventDate) {
                return res.status(400).send('Event date is required.');
            }
            const parsedDate = new Date(eventDate);
            if (isNaN(parsedDate.getTime())) {
                return res.status(400).send('Invalid event date format.');
            }
            await db.collection('schools').doc(schoolId).update({
                eventDate: admin.firestore.Timestamp.fromDate(parsedDate)
            });
            res.redirect('/admin-dashboard');
        } catch (error) {
            console.error('Error in assign-event-date-school route:', error.message, error.stack);
            res.status(500).send('Error assigning event date.');
        }
    });

// School dashboard (renders schoolDashboard.ejs)

// GET route for school dashboard
   app.get('/school-dashboard', async (req, res) => {
    try {
        const schoolEmail = req.query.username;
        console.log('Request query:', req.query); // Debug log

        if (!schoolEmail) {
            return res.render('schoolDashboard', {
                schoolName: 'Unknown',
                schoolEmail: '',
                city: '',
                district: '',
                pincode: '',
                schoolPhoneNumber: '',
                principalNumber: '',
                principalEmail: '',
                civicsTeacherNumber: '',
                civicsTeacherEmail: '',
                students: [],
                eventDate: null,
                eventDateMissing: true,
                resourcesConfirmed: false,
                selectedResources: [],
                selectedTrainers: [],
                error: 'Please login first',
                trialTests,
                trainers: [],
                mediaUploads: []
            });
        }

        const schoolSnapshot = await db.collection('schools')
            .where('schoolEmail', '==', schoolEmail)
            .get();

        if (schoolSnapshot.empty || schoolSnapshot.docs.length === 0) {
            return res.render('schoolDashboard', {
                schoolName: 'Unknown',
                schoolEmail: '',
                city: '',
                district: '',
                pincode: '',
                schoolPhoneNumber: '',
                principalNumber: '',
                principalEmail: '',
                civicsTeacherNumber: '',
                civicsTeacherEmail: '',
                students: [],
                eventDate: null,
                eventDateMissing: true,
                resourcesConfirmed: false,
                selectedResources: [],
                selectedTrainers: [],
                error: 'School not found',
                trialTests,
                trainers: [],
                mediaUploads: []
            });
        }

        const schoolData = schoolSnapshot.docs[0].data();
        const schoolName = schoolData.schoolName;

        // Format event date
        let eventDate = null;
        let eventDateMissing = true;
        if (schoolData.eventDate && typeof schoolData.eventDate.toDate === 'function') {
            eventDate = schoolData.eventDate.toDate().toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
            eventDateMissing = false;
        }

        // Fetch students
        const studentsSnapshot = await db.collection('participants')
            .where('schoolNameDropdown', '==', schoolName)
            .get();

        const students = studentsSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                studentName: data.studentName || 'N/A',
                studentClass: data.studentClass || 'N/A',
                hasCompletedMCQ: data.hasCompletedMCQ || false,
                trial1Percentage: data.trial1Percentage || 'N/A',
                trial2Percentage: data.trial2Percentage || 'N/A',
                score: data.score || 0,
                totalQuestions: data.totalQuestions || 0,
                percentage: data.percentage || 0,
                completedAt: data.completedAt ? data.completedAt.toDate().toLocaleDateString() : 'N/A',
                isApproved: data.isApproved || false,
                 isChampion: data.isChampion || false,
               message: data.message || null, // ✅ NEW: Student-specific message support
            };
        });

        // Fetch trainers with transformed availableDates
        const trainersSnapshot = await db.collection('trainers').get();
        const trainers = trainersSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                trainerName: data.trainerName || 'Unnamed',
                district: data.district || 'Not Specified',
                availableDates: Array.isArray(data.availableDates)
                    ? data.availableDates.map(dateObj =>
                        dateObj.date || dateObj.toDate ? dateObj.toDate().toISOString().split('T')[0] : 'N/A'
                    )
                    : []
            };
        });

        const mediaUploads = []; // Replace with actual fetch logic if needed

        const selectedTrainers = [
            schoolData.selectedTrainer1 || '',
            schoolData.selectedTrainer2 || ''
        ].map(trainerId => {
            const trainer = trainers.find(t => t.id === trainerId);
            return trainer ? { ...trainer, isOtherDistrict: trainer.district !== schoolData.district } : '';
        });

        res.render('schoolDashboard', {
            schoolName,
            mediaUploads,
            schoolEmail: schoolData.schoolEmail || '',
            city: schoolData.city || '',
            district: schoolData.district || '',
            pincode: schoolData.pincode || '',
            schoolPhoneNumber: schoolData.schoolPhoneNumber || '',
            principalNumber: schoolData.principalNumber || '',
            principalEmail: schoolData.principalEmail || '',
            civicsTeacherNumber: schoolData.civicsTeacherNumber || '',
            civicsTeacherEmail: schoolData.civicsTeacherEmail || '',
            students,
            eventDate,
            eventDateMissing,
            resourcesConfirmed: schoolData.resourcesConfirmed || false,
            selectedResources: schoolData.selectedResources || [],
            selectedTrainers,
            error: null,
            trialTests,
            trainers,
            workshopStartTime: schoolData.workshopStartTime || null,
            workshopEndTime: schoolData.workshopEndTime || null
        });

    } catch (error) {
        console.error('Error in /school-dashboard route:', error.message, error.stack);
        res.render('schoolDashboard', {
            schoolName: 'Unknown',
            schoolEmail: '',
            city: '',
            district: '',
            pincode: '',
            schoolPhoneNumber: '',
            principalNumber: '',
            principalEmail: '',
            civicsTeacherNumber: '',
            civicsTeacherEmail: '',
            students: [],
            eventDate: null,
            eventDateMissing: true,
            resourcesConfirmed: false,
            selectedResources: [],
            selectedTrainers: [],
            error: 'Error loading school data.',
            trialTests,
            trainers: [],
            mediaUploads: []
        });
    }
});

// POST route for submitting resources
    app.post('/school-dashboard/submit-resources', async (req, res) => {
        try {
            console.log("🔧 Incoming form body:", req.body);

            const rawEmail = req.body.schoolEmail;
            if (typeof rawEmail !== 'string') {
                throw new Error("Invalid or missing email.");
            }

            const schoolEmail = rawEmail.trim().toLowerCase();
            const { resources, trainerId1, trainerId2 } = req.body;

            console.log("📨 Cleaned Email:", schoolEmail);

            // 🔍 Step 1: Try normal Firestore query
            let schoolDoc = null;
            const snapshot = await db.collection('schools')
                .where('schoolEmail', '==', schoolEmail)
                .get();

            if (!snapshot.empty) {
                schoolDoc = snapshot.docs[0];
            }

            // 🔍 Step 2: Fallback if needed (case/space mismatch)
            if (!schoolDoc) {
                console.log("❌ Exact match failed. Trying fallback...");
                const allSchools = await db.collection('schools').get();
                allSchools.forEach(doc => {
                    const data = doc.data();
                    if (
                        data.schoolEmail &&
                        data.schoolEmail.trim().toLowerCase() === schoolEmail
                    ) {
                        schoolDoc = doc;
                    }
                });
            }

            // ❌ Step 3: If still not found
            if (!schoolDoc) {
                console.log("❌ School not found after fallback.");

                return res.status(404).render('schoolDashboard', {
                    schoolName: '',
                    schoolEmail,
                    city: '',
                    district: '',
                    pincode: '',
                    schoolPhoneNumber: '',
                    principalNumber: '',
                    principalEmail: '',
                    civicsTeacherNumber: '',
                    civicsTeacherEmail: '',
                    students: [],
                    eventDate: null,
                    eventDateMissing: true,
                    resourcesConfirmed: false,
                    selectedResources: [],
                    selectedTrainers: [],
                    trainers: [],
                    mediaUploads: [],
                    trialTests,
                    error: 'School not found.'
                });
            }

            // ✅ Step 4: School found
            const schoolData = schoolDoc.data();
            const schoolId = schoolDoc.id;

            const selectedResources = Array.isArray(resources)
                ? resources
                : [resources];

            // 🎯 Step 5: Fetch trainer details with transformed availableDates
            const trainer1Doc = await db.collection('trainers').doc(trainerId1).get();
            const trainer2Doc = await db.collection('trainers').doc(trainerId2).get();

            const selectedTrainers = [];

            if (trainer1Doc.exists) {
                const trainer = trainer1Doc.data();
                selectedTrainers.push({
                    ...trainer,
                    isOtherDistrict: trainer.district !== schoolData.district,
                    availableDates: Array.isArray(trainer.availableDates) ? trainer.availableDates.map(dateObj => 
                        dateObj.date || dateObj.toDate ? dateObj.toDate().toISOString().split('T')[0] : 'N/A'
                    ) : []
                });
            }

            if (trainer2Doc.exists) {
                const trainer = trainer2Doc.data();
                selectedTrainers.push({
                    ...trainer,
                    isOtherDistrict: trainer.district !== schoolData.district,
                    availableDates: Array.isArray(trainer.availableDates) ? trainer.availableDates.map(dateObj => 
                        dateObj.date || dateObj.toDate ? dateObj.toDate().toISOString().split('T')[0] : 'N/A'
                    ) : []
                });
            }

            // 📝 Step 6: Update school data
            await db.collection('schools').doc(schoolId).update({
                resourcesConfirmed: true,
                selectedResources,
                trainerId1,
                trainerId2
            });

            // 📚 Step 7: Load all trainers for dropdown
            const allTrainers = await db.collection('trainers').get();
            const trainers = allTrainers.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data,
                    availableDates: Array.isArray(data.availableDates) ? data.availableDates.map(dateObj => 
                        dateObj.date || dateObj.toDate ? dateObj.toDate().toISOString().split('T')[0] : 'N/A'
                    ) : []
                };
            });

            // ✅ Step 8: Render school dashboard with confirmation
            return res.render('schoolDashboard', {
                schoolName: schoolData.schoolName || '',
                schoolEmail,
                city: schoolData.city || '',
                district: schoolData.district || '',
                pincode: schoolData.pincode || '',
                schoolPhoneNumber: schoolData.schoolPhoneNumber || '',
                principalNumber: schoolData.principalNumber || '',
                principalEmail: schoolData.principalEmail || '',
                civicsTeacherNumber: schoolData.civicsTeacherNumber || '',
                civicsTeacherEmail: schoolData.civicsTeacherEmail || '',
                students: schoolData.students || [],
                eventDate: schoolData.eventDate ? schoolData.eventDate.toDate().toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                }) : null,
                eventDateMissing: !schoolData.eventDate,
                resourcesConfirmed: true,
                selectedResources,
                selectedTrainers,
                trainers,
                mediaUploads: [], // optional: pass uploads if you have them
                trialTests,
                error: null
            });

        } catch (error) {
            console.error("❌ Error in /submit-resources:", error);

            res.status(500).render('schoolDashboard', {
                schoolName: '',
                schoolEmail: req.body?.schoolEmail || '',
                city: '',
                district: '',
                pincode: '',
                schoolPhoneNumber: '',
                principalNumber: '',
                principalEmail: '',
                civicsTeacherNumber: '',
                civicsTeacherEmail: '',
                students: [],
                eventDate: null,
                eventDateMissing: true,
                resourcesConfirmed: false,
                selectedResources: [],
                selectedTrainers: [],
                trainers: [],
                mediaUploads: [],
                trialTests,
                error: 'Something went wrong while submitting resources.'
            });
        }
    });

    // Update school information
    app.post('/school-dashboard/update', [
        body('city').trim().notEmpty().withMessage('City is required'),
        body('district').trim().notEmpty().withMessage('District is required'),
        body('pincode').trim().matches(/^\d{6}$/).withMessage('Pincode must be 6 digits'),
        body('schoolPhoneNumber').trim().matches(/^\d{10}$/).withMessage('School phone number must be 10 digits'),
        body('principalNumber').trim().matches(/^\d{10}$/).withMessage('Principal phone number must be 10 digits'),
        body('principalEmail').trim().isEmail().withMessage('Invalid principal email address'),
        body('civicsTeacherNumber').trim().matches(/^\d{10}$/).withMessage('Civics teacher phone number must be 10 digits'),
        body('civicsTeacherEmail').trim().isEmail().withMessage('Invalid civics teacher email address')
    ], async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                const schoolEmail = req.body.schoolEmail;
                return res.status(400).render('schoolDashboard', {
                    schoolName: 'Unknown',
                    schoolEmail,
                    city: req.body.city,
                    district: req.body.district,
                    pincode: req.body.pincode,
                    schoolPhoneNumber: req.body.schoolPhoneNumber,
                    principalNumber: req.body.principalNumber,
                    principalEmail: req.body.principalEmail,
                    civicsTeacherNumber: req.body.civicsTeacherNumber,
                    civicsTeacherEmail: req.body.civicsTeacherEmail,
                    students: [],
                    eventDate: null,
                    eventDateMissing: true,
                    resourcesConfirmed: false,
                    selectedResources: [],
                    error: errors.array()[0].msg,
                    trialTests
                });
            }

            const {
                schoolEmail,
                city,
                district,
                pincode,
                schoolPhoneNumber,
                principalNumber,
                principalEmail,
                civicsTeacherNumber,
                civicsTeacherEmail
            } = req.body;

            const schoolSnapshot = await db.collection('schools')
                .where('schoolEmail', '==', schoolEmail)
                .get();
            if (schoolSnapshot.empty) {
                return res.status(404).render('schoolDashboard', {
                    schoolName: 'Unknown',
                    schoolEmail,
                    city,
                    district,
                    pincode,
                    schoolPhoneNumber,
                    principalNumber,
                    principalEmail,
                    civicsTeacherNumber,
                    civicsTeacherEmail,
                    students: [],
                    eventDate: null,
                    eventDateMissing: true,
                    resourcesConfirmed: false,
                    selectedResources: [],
                    error: 'School not found',
                    trialTests
                });
            }

            const schoolId = schoolSnapshot.docs[0].id;
            await db.collection('schools').doc(schoolId).update({
                city,
                district,
                pincode,
                schoolPhoneNumber,
                principalNumber,
                principalEmail,
                civicsTeacherNumber,
                civicsTeacherEmail
            });

            res.redirect(`/school-dashboard?username=${encodeURIComponent(schoolEmail)}`);
        } catch (error) {
            console.error('Error in school-dashboard/update route:', error.message, error.stack);
            res.status(500).render('schoolDashboard', {
                schoolName: 'Unknown',
                schoolEmail: req.body.schoolEmail,
                city: req.body.city,
                district: req.body.district,
                pincode: req.body.pincode,
                schoolPhoneNumber: req.body.schoolPhoneNumber,
                principalNumber: req.body.principalNumber,
                principalEmail: req.body.principalEmail,
                civicsTeacherNumber: req.body.civicsTeacherNumber,
                civicsTeacherEmail: req.body.civicsTeacherEmail,
                students: [],
                eventDate: null,
                eventDateMissing: true,
                resourcesConfirmed: false,
                selectedResources: [],
                error: 'Error updating school information',
                trialTests
            });
        }
    });

    // School login (renders login.ejs)
    app.post('/school-login', async (req, res) => {
        const { username, password } = req.body;
        console.log(`School login attempt: username=${username}`); // Add logging
        try {
            if (!username || !password) {
                console.log('Missing username or password');
                return res.render('login', { error: 'Username and password are required.' });
            }

            const snapshot = await db.collection('schools')
                .where('schoolEmail', '==', username)
                .get();
            if (snapshot.empty) {
                console.log(`No school found for username: ${username}`);
                return res.render('login', { error: 'Invalid username or password.' });
            }

            const school = snapshot.docs[0].data();
            if (password !== school.principalNumber) {

                console.log(`Invalid password for username: ${username} , ${school.principalNumber}, ${password}`);
                return res.render('login', { error: 'Invalid username or password.' });
            }

            console.log(`Login successful for ${username}, redirecting to school-dashboard`);
            // Store schoolEmail in session for consistency
            req.session.schoolEmail = username;
            res.redirect(`/school-dashboard?username=${encodeURIComponent(username)}`);
        } catch (error) {
            console.error('Error during school login:', error.message, error.stack);
            res.render('login', { error: 'Login failed. Try again later.' });
        }
    });

    // School upload media 
    app.post('/school-dashboard/upload-media', upload, async (req, res) => {
        try {
            const { schoolEmail, mediaDescription, mediaLink } = req.body;
            const photos = req.files['photos'] || [];
            const videos = req.files['videos'] || [];

            if (!schoolEmail) {
                return res.status(400).render('schoolDashboard', {
                    schoolName: 'Unknown',
                    schoolEmail: '',
                    city: '',
                    district: '',
                    pincode: '',
                    schoolPhoneNumber: '',
                    principalNumber: '',
                    principalEmail: '',
                    civicsTeacherNumber: '',
                    civicsTeacherEmail: '',
                    students: [],
                    eventDate: null,
                    eventDateMissing: true,
                    resourcesConfirmed: false,
                    selectedResources: [],
                    selectedTrainers: [],
                    trainers: [],
                    mediaUploads: [],
                    error: 'School email is required',
                    trialTests
                });
            }

            const schoolSnapshot = await db.collection('schools')
                .where('schoolEmail', '==', schoolEmail)
                .get();
            if (schoolSnapshot.empty) {
                return res.status(404).render('schoolDashboard', {
                    schoolName: 'Unknown',
                    schoolEmail,
                    city: '',
                    district: '',
                    pincode: '',
                    schoolPhoneNumber: '',
                    principalNumber: '',
                    principalEmail: '',
                    civicsTeacherNumber: '',
                    civicsTeacherEmail: '',
                    students: [],
                    eventDate: null,
                    eventDateMissing: true,
                    resourcesConfirmed: false,
                    selectedResources: [],
                    selectedTrainers: [],
                    trainers: [],
                    mediaUploads: [],
                    error: 'School not found',
                    trialTests
                });
            }

            const schoolId = schoolSnapshot.docs[0].id;
            const schoolData = schoolSnapshot.docs[0].data();

            if (mediaDescription && mediaDescription.length > 1000) {
                return res.status(400).render('schoolDashboard', {
                    schoolName: schoolData.schoolName,
                    schoolEmail,
                    city: schoolData.city || '',
                    district: schoolData.district || schoolData.city || '',
                    pincode: schoolData.pincode || '',
                    schoolPhoneNumber: schoolData.schoolPhoneNumber || '',
                    principalNumber: schoolData.principalNumber || '',
                    principalEmail: schoolData.principalEmail || '',
                    civicsTeacherNumber: schoolData.civicsTeacherNumber || '',
                    civicsTeacherEmail: schoolData.civicsTeacherEmail || '',
                    students: [],
                    eventDate: schoolData.eventDate ? schoolData.eventDate.toDate().toLocaleDateString('en-US') : null,
                    eventDateMissing: !schoolData.eventDate,
                    resourcesConfirmed: schoolData.resourcesConfirmed || false,
                    selectedResources: schoolData.selectedResources || [],
                    selectedTrainers: [
                        schoolData.selectedTrainer1 || '',
                        schoolData.selectedTrainer2 || ''
                    ],
                    trainers: [],
                    mediaUploads: [],
                    error: 'Media description cannot exceed 1000 words',
                    trialTests
                });
            }

            // Explicitly set the bucket name
            const bucket = admin.storage().bucket('beinglawful-ee5a4.firebasestorage.app'); // Verify this matches your bucket
            const [exists] = await bucket.exists();
            if (!exists) {
                throw new Error('The specified bucket does not exist. Please check your Firebase configuration.');
            }

            const mediaUploads = [];
            for (const file of photos) {
                const fileName = `media/${schoolId}/photos/${Date.now()}_${file.originalname}`;
                const fileUpload = bucket.file(fileName);
                try {
                    await fileUpload.save(file.buffer, {
                        metadata: { contentType: file.mimetype }
                    });
                    const [url] = await fileUpload.getSignedUrl({
                        action: 'read',
                        expires: '03-09-2491'
                    });
                    mediaUploads.push({
                        url,
                        type: 'image',
                        path: fileName,
                        description: mediaDescription || '',
                        link: mediaLink || '',
                        uploadedAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                } catch (uploadError) {
                    console.error(`Error uploading photo ${fileName}:`, uploadError.message, uploadError.stack);
                    throw new Error(`Failed to upload photo: ${uploadError.message}`);
                }
            }

            for (const file of videos) {
                const fileName = `media/${schoolId}/videos/${Date.now()}_${file.originalname}`;
                const fileUpload = bucket.file(fileName);
                try {
                    await fileUpload.save(file.buffer, {
                        metadata: { contentType: file.mimetype }
                    });
                    const [url] = await fileUpload.getSignedUrl({
                        action: 'read',
                        expires: '03-09-2491'
                    });
                    mediaUploads.push({
                        url,
                        type: 'video',
                        path: fileName,
                        description: mediaDescription || '',
                        link: mediaLink || '',
                        uploadedAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                } catch (uploadError) {
                    console.error(`Error uploading video ${fileName}:`, uploadError.message, uploadError.stack);
                    throw new Error(`Failed to upload video: ${uploadError.message}`);
                }
            }

            if (mediaUploads.length > 0) {
                const batch = db.batch();
                mediaUploads.forEach(upload => {
                    const mediaRef = db.collection('schools').doc(schoolId).collection('mediaUploads').doc();
                    batch.set(mediaRef, upload);
                });
                await batch.commit();
            }

            const trainersSnapshot = await db.collection('trainers').get();
            const trainers = trainersSnapshot.docs.map(doc => ({
                id: doc.id,
                trainerName: doc.data().trainerName || 'Unnamed',
                district: doc.data().district || 'Not Specified'
            }));

            const updatedSchoolSnapshot = await db.collection('schools').doc(schoolId).get();
            const updatedSchoolData = updatedSchoolSnapshot.data();

            res.render('schoolDashboard', {
                schoolName: updatedSchoolData.schoolName || '',
                schoolEmail,
                city: updatedSchoolData.city || '',
                district: updatedSchoolData.district || updatedSchoolData.city || '',
                pincode: updatedSchoolData.pincode || '',
                schoolPhoneNumber: updatedSchoolData.schoolPhoneNumber || '',
                principalNumber: updatedSchoolData.principalNumber || '',
                principalEmail: updatedSchoolData.principalEmail || '',
                civicsTeacherNumber: updatedSchoolData.civicsTeacherNumber || '',
                civicsTeacherEmail: updatedSchoolData.civicsTeacherEmail || '',
                students: [], // Fetch students if needed
                eventDate: updatedSchoolData.eventDate ? updatedSchoolData.eventDate.toDate().toLocaleDateString('en-US') : null,
                eventDateMissing: !updatedSchoolData.eventDate,
                resourcesConfirmed: updatedSchoolData.resourcesConfirmed || false,
                selectedResources: updatedSchoolData.selectedResources || [],
                selectedTrainers: [
                    updatedSchoolData.selectedTrainer1 || '',
                    updatedSchoolData.selectedTrainer2 || ''
                ],
                trainers,
                mediaUploads,
                error: null,
                trialTests
            });
        } catch (error) {
            console.error('Error in school-dashboard/upload-media route:', error.message, error.stack);
            const schoolEmail = req.body.schoolEmail || '';
            res.status(500).render('schoolDashboard', {
                schoolName: 'Unknown',
                schoolEmail,
                city: '',
                district: '',
                pincode: '',
                schoolPhoneNumber: '',
                principalNumber: '',
                principalEmail: '',
                civicsTeacherNumber: '',
                civicsTeacherEmail: '',
                students: [],
                eventDate: null,
                eventDateMissing: true,
                resourcesConfirmed: false,
                selectedResources: [],
                selectedTrainers: [],
                trainers: [],
                mediaUploads: [],
                error: `Error uploading media: ${error.message}`,
                trialTests
            });
        }
    });

app.post('/school-dashboard/approve-student/:id', async (req, res) => {
    try {
        const studentId = req.params.id;
        const schoolEmail = req.query.username;
        if (!studentId || !schoolEmail) return res.status(400).send('Missing required fields');

        await db.collection('participants').doc(studentId).update({ isApproved: true });

        res.redirect(`/school-dashboard?username=${encodeURIComponent(schoolEmail)}`);
    } catch (err) {
        console.error('Error approving student:', err);
        res.status(500).send('Error approving student.');
    }
});

//champ student
  app.post('/school-dashboard/mark-champ/:id', async (req, res) => {
    const studentId = req.params.id;
    const { username } = req.query;

    try {
        //  Count existing champions
        const championsSnapshot = await db.collection('participants')
            .where('isChampion', '==', true)
            .get();

        if (championsSnapshot.size >= 50) {
            return res.send(' Only 50 students can be marked as Champion.');
        }

        const championMessage = '🎉 Congratulations! You have been selected as a Being Lawful Champ!';

        //  Update the participant
        await db.collection('participants').doc(studentId).update({
            isChampion: true,
            championMessage: championMessage
        });

        console.log(`Champion set for ${studentId} - Message: ${championMessage}`);

        res.redirect(`/school-dashboard?username=${username}`);
    } catch (error) {
        console.error('Error marking champ:', error);
        res.status(500).send('Server error while marking champion');
    }
});



// Participation form (renders participation.ejs)
    app.get('/participation', async (req, res) => {
        try {
            const type = req.query.type || 'Student';

            const snapshot = await db.collection('schools')
                .where('isApproved', '==', true)
                .get();

            const schoolNames = snapshot.docs.map(doc => doc.data().schoolName);

            // ✅ Pass errors and values even if empty
            res.render('participation', {
                type,
                schoolNames,
                errors: {},  // ← Prevents ReferenceError
                values: {}   // ← Keeps fields empty on first load
            });
        } catch (error) {
            console.error('Error in participation route:', error.message, error.stack);
            res.status(500).send('Error loading participation form.');
        }
    });

    app.post('/participate', async (req, res) => {
        try {
            const participant = {
                studentName: req.body.studentName,
                schoolNameDropdown: req.body.schoolNameDropdown,
                birthdate: req.body.birthdate,
                studentClass: req.body.studentClass,
                parentMobile1: req.body.parentMobile1,
                parentMobile2: req.body.parentMobile2,
                parentEmail: req.body.parentEmail,
                address: req.body.address,
                city: req.body.city,
                pincode: req.body.pincode,
                type: req.body.type,
                
            };

            const errors = {};

            // Check for duplicate email or phone number
            const emailSnapshot = await db.collection('participants')
                .where('parentEmail', '==', participant.parentEmail)
                .get();
            if (!emailSnapshot.empty) {
                errors.parentEmail = 'User with this email already exists';
            }

            const mobileSnapshot = await db.collection('participants')
                .where('parentMobile1', '==', participant.parentMobile1)
                .get();
            if (!mobileSnapshot.empty) {
                errors.parentMobile1 = 'User with this mobile number already exists';
            }

            const requiredFields = ['studentName', 'schoolNameDropdown', 'birthdate', 'studentClass', 'parentMobile1', 'parentEmail', 'address', 'city', 'pincode', 'type'];
            requiredFields.forEach(field => {
                if (!participant[field]) {
                    errors[field] = 'This field is required';
                }
            });

            if (participant.pincode && !/^\d{6}$/.test(participant.pincode)) {
                errors.pincode = 'Pincode must be 6 digits';
            }

            if (participant.parentMobile1 && !/^\d{10}$/.test(participant.parentMobile1)) {
                errors.parentMobile1 = 'Mobile number must be 10 digits';
            }

            if (participant.parentMobile2 && participant.parentMobile2 !== '' && !/^\d{10}$/.test(participant.parentMobile2)) {
                errors.parentMobile2 = 'Mobile number must be 10 digits';
            }

            if (participant.parentEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(participant.parentEmail)) {
                errors.parentEmail = 'Invalid email address';
            }

            if (participant.birthdate && !/^\d{4}-\d{2}-\d{2}$/.test(participant.birthdate)) {
                errors.birthdate = 'Birthdate must be YYYY-MM-DD';
            }

            if (Object.keys(errors).length > 0) {
                const snapshot = await db.collection('schools')
                    .where('isApproved', '==', true)
                    .get();
                const schoolNames = snapshot.docs.map(doc => doc.data().schoolName);

                return res.render('participation', {
                    type: participant.type || 'Student',
                    schoolNames,
                    errors,
                    values: participant
                });
            }

            await db.collection('participants').add({
                ...participant,
                hasCompletedTrial1: false,
                hasCompletedTrial2: false,
                hasCompletedMCQ: false,
                trainerApprove : false, 
                score: 0
            });

            const [year, month, day] = participant.birthdate.split('-');
            const password = `${day}${month}${year}`;

            res.render('studentConfirmation', {
                studentName: participant.studentName,
                username: participant.parentMobile1,
                password
            });

        } catch (error) {
            console.error('Error in participate route:', error.message, error.stack);
            res.status(500).render('participation', {
                type: 'Student',
                schoolNames: [],
                errors: { server: 'Something went wrong. Please try again.' },
                values: req.body
            });
        }
    });

 app.post('/admin/complete-school/:schoolId', async (req, res) => {
    try {
        const { schoolId } = req.params;
        if (!req.session.isAdmin) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const schoolRef = db.collection('schools').doc(schoolId);
        const schoolDoc = await schoolRef.get();
        if (!schoolDoc.exists) {
            return res.status(404).json({ error: 'School not found' });
        }
        if (schoolDoc.data().isCompleted) {
            return res.status(400).json({ error: ' Jorge is already completed' });
        }
        await schoolRef.update({
            isCompleted: true,
            completedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        res.status(200).json({ message: 'School marked as completed', schoolId });
    } catch (error) {
        console.error('Error in complete-school route:', error.message, error.stack);
        res.status(500).json({ error: 'Server error', details: error.message });
    }
});
    // School participation form (renders schoolParticipation.ejs)
    app.get('/school-participation', async (req, res) => {
        try {
            const snapshot = await db.collection('schools').get();
            const schools = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            res.render('schoolParticipation', { schools, errors: null });
        } catch (error) {
            console.error('Error in school-participation route:', error.message, error.stack);
            res.status(500).send('Error fetching school data.');
        }
    });

    app.post('/school-participate', [
        body('schoolName').trim().notEmpty().withMessage('School name is required'),
        body('city').trim().notEmpty().withMessage('City is required'),
        body('district').trim().notEmpty().withMessage('District is required'),
        body('pincode').trim().matches(/^\d{6}$/).withMessage('Pincode must be 6 digits'),
        body('schoolPhoneNumber').trim().matches(/^\d{10}$/).withMessage('School phone number must be 10 digits'),
        body('schoolEmail').trim().isEmail().withMessage('Invalid school email address'),
        body('principalNumber').trim().matches(/^\d{10}$/).withMessage('Principal phone number must be 10 digits'),
        body('principalEmail').trim().isEmail().withMessage('Invalid principal email address'),
        body('civicsTeacherNumber').trim().matches(/^\d{10}$/).withMessage('Civics teacher phone number must be 10 digits'),
        body('civicsTeacherEmail').trim().isEmail().withMessage('Invalid civics teacher email address'),
        body('eventDate1').isDate().withMessage('Invalid date format for Event Date 1'),
        body('eventDate2').isDate().withMessage('Invalid date format for Event Date 2'),
        body('eventDate3').isDate().withMessage('Invalid date format for Event Date 3'),
        body('eventDate4').isDate().withMessage('Invalid date format for Event Date 4')
    ], async (req, res) => {
        try {
            const errors = validationResult(req).array();

            // Check for duplicate entries
            const {
                schoolName,
                city,
                district,
                pincode,
                schoolPhoneNumber,
                schoolEmail,
                principalNumber,
                principalEmail,
                civicsTeacherNumber,
                civicsTeacherEmail,
                eventDate1,
                eventDate2,
                eventDate3,
                eventDate4
            } = req.body;

            const checks = [
                { field: 'schoolEmail', value: schoolEmail, message: 'School email already exists' },
                { field: 'principalEmail', value: principalEmail, message: 'Principal email already exists' },
                { field: 'civicsTeacherEmail', value: civicsTeacherEmail, message: 'Civics teacher email already exists' },
                { field: 'schoolPhoneNumber', value: schoolPhoneNumber, message: 'School phone number already exists' },
                { field: 'principalNumber', value: principalNumber, message: 'Principal phone number already exists' },
                { field: 'civicsTeacherNumber', value: civicsTeacherNumber, message: 'Civics teacher phone number already exists' }
            ];

            for (const check of checks) {
                const snapshot = await db.collection('schools')
                    .where(check.field, '==', check.value)
                    .get();
                if (!snapshot.empty) {
                    errors.push({ param: check.field, msg: check.message });
                }
            }

            if (errors.length > 0) {
                const schoolsSnapshot = await db.collection('schools').get();
                const schools = schoolsSnapshot.docs.map(doc => {
                    const data = doc.data();
                    return {
                        id: doc.id,
                        ...data,
                        // Convert Firestore Timestamp to readable string
                        registeredAt: data.registeredAt ? data.registeredAt.toDate().toLocaleString() : 'Not registered'
                    };
                });
                return res.status(400).render('schoolParticipation', { schools, errors });
            }

            await db.collection('schools').add({
                schoolName,
                city,
                district,
                pincode,
                schoolPhoneNumber,
                schoolEmail,
                principalNumber,
                principalEmail,
                civicsTeacherNumber,
                civicsTeacherEmail,
                eventDates: [eventDate1, eventDate2, eventDate3, eventDate4],
                registeredAt: admin.firestore.FieldValue.serverTimestamp(),
                isApproved: false,
                resourcesConfirmed: false,
                selectedResources: []
            });

            await sendEmail(
                schoolEmail,
                emailTemplates.schoolRegistration.subject,
                emailTemplates.schoolRegistration.text(schoolName, schoolEmail, principalNumber),
                emailTemplates.schoolRegistration.html(schoolName, schoolEmail, principalNumber)
            );

            res.render('confirmation', {
                schoolEmail: schoolEmail,
                principalNumber: principalNumber
            });
        } catch (error) {
            console.error('Error in school-participate route:', error.message, error.stack);
            const schoolsSnapshot = await db.collection('schools').get();
            const schools = schoolsSnapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data,
                    // Convert Firestore Timestamp to readable string
                    registeredAt: data.registeredAt ? data.registeredAt.toDate().toLocaleString() : 'Not registered'
                };
            });
            res.status(500).render('schoolParticipation', {
                schools,
                errors: [{ msg: 'Internal server error. Please try again later.' }]
            });
        }
    });
        // Confirmation page (renders confirmation.ejs)
        app.get('/confirmation', (req, res) => {
            res.render('confirmation', {
                schoolEmail: 'Not provided',
                principalNumber: 'Not provided'
            });
        });

        // School students (renders schoolStudents.ejs)
        app.get('/school-students', async (req, res) => {
            try {
                const schoolName = req.query.schoolName;
                if (!schoolName) {
                    return res.status(400).send('School name is required.');
                }

                const snapshot = await db.collection('participants')
                    .where('schoolName', '==', schoolName)
                    .get();
                const students = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                res.render('schoolStudents', { schoolName, students });
            } catch (error) {
                console.error('Error in school-students route:', error.message, error.stack);
                res.status(500).send('Error fetching student data.');
            }
        });

        // Admin login page (renders adminLogin.ejs)
        app.get('/admin-login', (req, res) => {
            if (req.session.isAdmin) {
                return res.redirect('/admin-dashboard');
            }
            res.render('adminLogin', { error: null });
        });

        // Admin login (renders adminLogin.ejs on error)
        app.post('/admin-login', (req, res) => {
            const { username, password } = req.body;
            if (!username || !password) {
                return res.render('adminLogin', { error: 'Username and password are required.' });
            }

            if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
                req.session.isAdmin = true;
                res.redirect('/admin-dashboard');
            } else {
                res.render('adminLogin', { error: 'Invalid username or password.' });
            }
        });

        // Admin route (redirects to /admin-dashboard for backward compatibility)
        app.get('/admin', requireAdmin, async (req, res) => {
            res.redirect('/admin-dashboard');
        });

        // Admin dashboard (renders adminDashboard.ejs)
    app.get('/admin-dashboard', requireAdmin, async (req, res) => {
        try {
            console.log('---- Admin Dashboard Route Triggered ----');

            // 1️⃣ Parse Filters
            const filters = {
                schoolApproved: req.query.schoolApproved || '',
                schoolCity: req.query.schoolCity || '',
                trainerApproved: req.query.trainerApproved || '',
                trainerCity: req.query.trainerCity || '',
                studentCompleted: req.query.studentCompleted || '',
                studentCity: req.query.studentCity || '',
                workshopCompleted: req.query.workshopCompleted || ''
            };

            // 2️⃣ Fetch Schools + School Media
            let schoolsQuery = db.collection('schools');
            if (filters.schoolApproved) schoolsQuery = schoolsQuery.where('isApproved', '==', filters.schoolApproved === 'true');
            if (filters.schoolCity) schoolsQuery = schoolsQuery.where('city', '==', filters.schoolCity);
            if (filters.workshopCompleted) schoolsQuery = schoolsQuery.where('workshopCompleted', '==', filters.workshopCompleted === 'true');

            const schoolsSnapshot = await schoolsQuery.get();
            const schools = [];
            const schoolMediaPromises = [];

            for (const doc of schoolsSnapshot.docs) {
                const schoolData = doc.data();
                const eventDate = schoolData.eventDate?.toDate ? schoolData.eventDate.toDate() : (schoolData.eventDate ? new Date(schoolData.eventDate) : null);

                schoolMediaPromises.push(
                    db.collection('schools').doc(doc.id).collection('mediaUploads').get()
                        .then(mediaSnap => mediaSnap.docs.map(mediaDoc => ({
                            ...mediaDoc.data(),
                            uploadedAt: mediaDoc.data().uploadedAt?.toDate() || null,
                            uploadedBy: schoolData.schoolName || 'Unknown School'
                        })))
                );

                let trainer1 = null, trainer2 = null;
                if (schoolData.trainerId1) {
                    const t1Doc = await db.collection('trainers').doc(schoolData.trainerId1).get();
                    if (t1Doc.exists) trainer1 = { id: t1Doc.id, ...t1Doc.data() };
                }
                if (schoolData.trainerId2) {
                    const t2Doc = await db.collection('trainers').doc(schoolData.trainerId2).get();
                    if (t2Doc.exists) trainer2 = { id: t2Doc.id, ...t2Doc.data() };
                }

                schools.push({ id: doc.id, ...schoolData, eventDate, trainer1, trainer2 });
            }

            // 3️⃣ Fetch Trainers + Trainer Media
            let trainersQuery = db.collection('trainers');
            if (filters.trainerApproved) trainersQuery = trainersQuery.where('isApproved', '==', filters.trainerApproved === 'true');
            if (filters.trainerCity) trainersQuery = trainersQuery.where('city', '==', filters.trainerCity);

            const trainersSnapshot = await trainersQuery.get();
            const trainers = [];
            const trainerMediaPromises = [];

            for (const doc of trainersSnapshot.docs) {
                const data = doc.data();
                trainerMediaPromises.push(
                    db.collection('trainers').doc(doc.id).collection('mediaUploads').get()
                        .then(mediaSnap => mediaSnap.docs.map(mediaDoc => ({
                            ...mediaDoc.data(),
                            uploadedAt: mediaDoc.data().uploadedAt?.toDate() || null,
                            uploadedBy: data.trainerName || 'Unknown Trainer'
                        })))
                );

                trainers.push({
                    id: doc.id,
                    ...data,
                    registeredAt: data.registeredAt?.toDate ? data.registeredAt.toDate() : (data.registeredAt ? new Date(data.registeredAt) : null),
                    isApproved: typeof data.isApproved === 'boolean' ? data.isApproved : false
                });
            }

            // 4️⃣ Fetch Participants
            let participantsQuery = db.collection('participants');
            if (filters.studentCompleted) participantsQuery = participantsQuery.where('hasCompletedMCQ', '==', filters.studentCompleted === 'true');
            if (filters.studentCity) participantsQuery = participantsQuery.where('city', '==', filters.studentCity);

            const participantsSnapshot = await participantsQuery.get();
            const participants = participantsSnapshot.docs.map(doc => {
                const data = doc.data();
                const score = Number(data.score) || null;
                const totalQuestions = Number(data.totalQuestions) || null;
                const trial1Score = Number(data.trial1Score) || null;
                const trial1TotalQuestions = Number(data.trial1TotalQuestions) || null;
                const trial2Score = Number(data.trial2Score) || null;
                const trial2TotalQuestions = Number(data.trial2TotalQuestions) || null;

                return {
                    id: doc.id,
                    ...data,
                    birthdate: data.birthdate?.toDate ? data.birthdate.toDate() : (data.birthdate ? new Date(data.birthdate) : null),
                    completedAt: data.completedAt?.toDate ? data.completedAt.toDate() : (data.completedAt ? new Date(data.completedAt) : null),
                    score,
                    totalQuestions,
                    percentage: score && totalQuestions ? ((score / totalQuestions) * 100).toFixed(2) : null,
                    trial1Score,
                    trial1TotalQuestions,
                    trial1Percentage: trial1Score && trial1TotalQuestions ? ((trial1Score / trial1TotalQuestions) * 100).toFixed(2) : null,
                    trial2Score,
                    trial2TotalQuestions,
                    trial2Percentage: trial2Score && trial2TotalQuestions ? ((trial2Score / trial2TotalQuestions) * 100).toFixed(2) : null,
                    trial1CorrectAnswers: Number(data.trial1CorrectAnswers) || null,
                    trial1WrongAnswers: Number(data.trial1WrongAnswers) || null,
                    trial2CorrectAnswers: Number(data.trial2CorrectAnswers) || null,
                    trial2WrongAnswers: Number(data.trial2WrongAnswers) || null
                };
            });

            // 5️⃣ Collect All Media Uploads
            const schoolMedia = (await Promise.all(schoolMediaPromises)).flat();
            const trainerMedia = (await Promise.all(trainerMediaPromises)).flat();
            const mediaUploads = [...schoolMedia, ...trainerMedia].sort((a, b) => (b.uploadedAt || 0) - (a.uploadedAt || 0));

            // 6️⃣ Today's Participants Summary
            const today = new Date(); today.setHours(0, 0, 0, 0);
            const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
            let studentsTodayCount = 0;
            let averageScore = 0;

            try {
                const studentsTodaySnapshot = await db.collection('participants')
                    .where('hasCompletedMCQ', '==', true)
                    .where('completedAt', '>=', today)
                    .where('completedAt', '<', tomorrow)
                    .get();

                studentsTodayCount = studentsTodaySnapshot.size;
                const totalScore = studentsTodaySnapshot.docs.reduce((sum, doc) => sum + (Number(doc.data().score) || 0), 0);
                averageScore = studentsTodayCount > 0 ? (totalScore / studentsTodayCount).toFixed(2) : 0;
            } catch (indexErr) {
                console.error('🔥 Firestore Index Error:', indexErr.message);
            }

            // 7️⃣ Fetch Trainer ZIPs
            const zipSnapshot = await db.collection('trainerZips').get();
            const zips = zipSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                uploadedAt: doc.data().uploadedAt?.toDate() || null
            }));

            // 8️⃣ Render Admin Dashboard View
            res.render('adminDashboard', {
                schools,
                trainers,
                participants,
                filters,
                studentsTodayCount,
                averageScore,
                zips,
                mediaUploads,
                error: null,
                success: req.query.success || null
            });

        } catch (err) {
            console.error('❌ Error in /admin-dashboard:', err.message);
            res.render('adminDashboard', {
                schools: [],
                trainers: [],
                participants: [],
                filters: {},
                studentsTodayCount: 0,
                averageScore: 0,
                zips: [],
                mediaUploads: [],
                error: 'Failed to load dashboard data.',
                success: null
            });
        }
    });

    app.post('/admin-dashboard/delete-trainer/:id', requireAdmin, async (req, res) => {
        const trainerId = req.params.id;

        try {
            await db.collection('trainers').doc(trainerId).delete();
            res.redirect('/admin-dashboard?success=Trainer deleted successfully');
        } catch (err) {
            console.error('❌ Error deleting trainer:', err.message);
            res.redirect('/admin-dashboard?error=Failed to delete trainer');
        }
    });

    // Delete a participant by ID
    app.post('/admin-dashboard/delete-student/:id', requireAdmin, async (req, res) => {
        const participantId = req.params.id;

        try {
            await db.collection('participants').doc(participantId).delete();
            res.redirect('/admin-dashboard?success=Student deleted successfully');
        } catch (err) {
            console.error('❌ Error deleting student:', err.message);
            res.redirect('/admin-dashboard?error=Failed to delete student');
        }
    });
    // ✅ POST mark media as seen (One-way, not toggle)
    app.post('/admin-dashboard/mark-media-seen/:mediaId', async (req, res) => {
        try {
            const mediaId = req.params.mediaId;
            const mediaSnap = await db.collectionGroup('mediaUploads')
                .where('id', '==', mediaId)
                .limit(1)
                .get();

            if (mediaSnap.empty) {
                return res.status(404).json({ error: 'Media not found' });
            }

            const mediaDoc = mediaSnap.docs[0];

            if (!mediaDoc.data().seen) {
                await mediaDoc.ref.update({ seen: true });
            }

            res.json({ seen: true, message: 'Media marked as seen' });
        } catch (err) {
            console.error('Error marking media as seen:', err.message);
            res.status(500).json({ error: 'Server error' });
        }
    });

    app.get('/admin-dashboard/get-media-status/:mediaId', async (req, res) => {
        try {
            const mediaId = req.params.mediaId;
            const mediaSnap = await db.collectionGroup('mediaUploads').where('id', '==', mediaId).limit(1).get();

            if (mediaSnap.empty) {
                return res.status(404).json({ error: 'Media not found' });
            }

            const mediaDoc = mediaSnap.docs[0];
            res.json({ seen: mediaDoc.data().seen || false });
        } catch (err) {
            console.error('Error fetching media status:', err.message);
            res.status(500).json({ error: 'Server error' });
        }
    });

// POST: Toggle media seen status
app.post('/admin-dashboard/toggle-media-seen/:mediaId', async (req, res) => {
    try {
        const mediaId = req.params.mediaId;
        const mediaSnap = await db.collectionGroup('mediaUploads').where('id', '==', mediaId).limit(1).get();

        if (mediaSnap.empty) {
            return res.status(404).json({ error: 'Media not found' });
        }

        const mediaDoc = mediaSnap.docs[0];
        const currentSeen = mediaDoc.data().seen || false;
        const newSeen = !currentSeen;

        await mediaDoc.ref.update({ seen: newSeen });

        res.json({ seen: newSeen });
    } catch (err) {
        console.error('Error toggling media status:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
});

    // Approve trainer (general approval, not tied to a specific school)
    app.post('/admin/approve-trainer', requireAdmin, async (req, res) => {
        try {
            const { trainerId } = req.body;
            if (!trainerId) {
                return res.redirect('/admin-dashboard?error=Trainer ID is required');
            }

            const trainerRef = db.collection('trainers').doc(trainerId);
            const trainerDoc = await trainerRef.get();
            if (!trainerDoc.exists) {
                return res.redirect('/admin-dashboard?error=Trainer not found');
            }

            await trainerRef.update({ isApproved: true });
            res.redirect('/admin-dashboard?success=Trainer approved successfully');
        } catch (error) {
            console.error('Error in admin/approve-trainer route:', error.message, error.stack);
            res.redirect('/admin-dashboard?error=Error approving trainer');
        }
    });

    // Admin approve school
    app.post('/admin/approve-school/:id', requireAdmin, async (req, res) => {
            try {
                const schoolId = req.params.id;
                await db.collection('schools').doc(schoolId).update({ isApproved: true });
                res.redirect('/admin-dashboard');
            } catch (error) {
                console.error('Error in approve-school route:', error.message, error.stack);
                res.status(500).send('Error approving school.');
            }
        });

    // Admin reject school
    app.post('/admin/reject-school', requireAdmin, async (req, res) => {
    try {
    const { schoolId } = req.body;
    if (!schoolId) {
    return res.redirect('/admin-dashboard?error=School ID is required');
    }

    const schoolRef = db.collection('schools').doc(schoolId);
    const schoolDoc = await schoolRef.get();
    if (!schoolDoc.exists) {
    return res.redirect('/admin-dashboard?error=School not found');
    }

    await schoolRef.delete();
    res.redirect('/admin-dashboard?success=School rejected successfully');
    } catch (error) {
    console.error('Error in admin/reject-school route:', error.message, error.stack);
    res.redirect('/admin-dashboard?error=Error rejecting school');
    }
    });

    // Admin approve trainer
    // Approve Trainer 1 for a specific school
    app.post('/admin/approve-trainer1/:schoolId', requireAdmin, async (req, res) => {
        try {
            const { schoolId } = req.params;
            const schoolRef = db.collection('schools').doc(schoolId);
            const schoolDoc = await schoolRef.get();
            if (!schoolDoc.exists) {
                return res.redirect('/admin-dashboard?error=School not found');
            }

            const { trainerId1, name: schoolName, eventDate, spot, facilities } = schoolDoc.data();
            if (!trainerId1) {
                return res.redirect('/admin-dashboard?error=No Trainer 1 assigned to approve');
            }

            const trainerRef = db.collection('trainers').doc(trainerId1);
            const trainerDoc = await trainerRef.get();
            if (!trainerDoc.exists) {
                return res.redirect('/admin-dashboard?error=Trainer 1 not found');
            }

            // Check if trainer is already assigned to another school
            const existingSchoolId = trainerDoc.data().assignedSchoolId;
            if (existingSchoolId && existingSchoolId !== schoolId) {
                return res.redirect('/admin-dashboard?error=Trainer 1 already assigned to another school');
            }

            // Update trainer with approval status and assigned school details
            await trainerRef.update({
                isApproved: true,
                assignedSchoolId: schoolId,
                assignedSchoolName: schoolName
            });

            // Create assignment subcollection document
            await trainerRef.collection('assignments').doc(schoolId).set({
                schoolId,
                schoolName,
                eventDate: eventDate || null,
                spot: spot || null,
                facilities: facilities || [],
                assignedAt: admin.firestore.Timestamp.now()
            });

            console.log(`Approved Trainer 1 ${trainerId1} for school ${schoolId} (${schoolName})`);
            res.redirect('/admin-dashboard?success=Trainer 1 approved successfully');
        } catch (error) {
            console.error('Error approving Trainer 1:', error.message, error.stack);
            res.redirect('/admin-dashboard?error=Failed to approve Trainer 1');
        }
    });

    // Approve Trainer 2 for a specific school
    app.post('/admin/approve-trainer2/:schoolId', requireAdmin, async (req, res) => {
        try {
            const { schoolId } = req.params;
            const schoolRef = db.collection('schools').doc(schoolId);
            const schoolDoc = await schoolRef.get();
            if (!schoolDoc.exists) {
                return res.redirect('/admin-dashboard?error=School not found');
            }

            const { trainerId2, name: schoolName, eventDate, spot, facilities } = schoolDoc.data();
            if (!trainerId2) {
                return res.redirect('/admin-dashboard?error=No Trainer 2 assigned to approve');
            }

            const trainerRef = db.collection('trainers').doc(trainerId2);
            const trainerDoc = await trainerRef.get();
            if (!trainerDoc.exists) {
                return res.redirect('/admin-dashboard?error=Trainer 2 not found');
            }

            // Check if trainer is.cn already assigned to another school
            const existingSchoolId = trainerDoc.data().assignedSchoolId;
            if (existingSchoolId && existingSchoolId !== schoolId) {
                return res.redirect('/admin-dashboard?error=Trainer 2 already assigned to another school');
            }

            // Update trainer with approval status and assigned school details
            await trainerRef.update({
                isApproved: true,
                assignedSchoolId: schoolId,
                assignedSchoolName: schoolName
            });

            // Create assignment subcollection document
            await trainerRef.collection('assignments').doc(schoolId).set({
                schoolId,
                schoolName,
                eventDate: eventDate || null,
                spot: spot || null,
                facilities: facilities || [],
                assignedAt: admin.firestore.Timestamp.now()
            });

            console.log(`Approved Trainer 2 ${trainerId2} for school ${schoolId} (${schoolName})`);
            res.redirect('/admin-dashboard?success=Trainer 2 approved successfully');
        } catch (error) {
            console.error('Error approving Trainer 2:', error.message, error.stack);
            res.redirect('/admin-dashboard?error=Failed to approve Trainer 2');
        }
    });

    // Reject Trainer 1
    app.post('/admin/reject-trainer1/:schoolId', requireAdmin, async (req, res) => {
        try {
            const { schoolId } = req.params;
            const schoolRef = db.collection('schools').doc(schoolId);
            await schoolRef.update({
                trainerId1: null
            });
            console.log(`Rejected Trainer 1 for school ${schoolId}`);
            res.redirect('/admin-dashboard?success=Trainer 1 rejected successfully');
        } catch (error) {
            console.error('Error rejecting Trainer 1:', error);
            res.redirect('/admin-dashboard?error=Failed to reject Trainer 1');
        }
    });

    // Reject Trainer 2
    app.post('/admin/reject-trainer2/:schoolId', requireAdmin, async (req, res) => {
        try {
            const { schoolId } = req.params;
            const schoolRef = db.collection('schools').doc(schoolId);
            await schoolRef.update({
                trainerId2: null
            });
            console.log(`Rejected Trainer 2 for school ${schoolId}`);
            res.redirect('/admin-dashboard?success=Trainer 2 rejected successfully');
        } catch (error) {
            console.error('Error rejecting Trainer 2:', error);
            res.redirect('/admin-dashboard?error=Failed to reject Trainer 2');
        }
    });

    // Assign Trainer 1
    app.post('/admin/assign-trainer1/:schoolId', requireAdmin, async (req, res) => {
        try {
            const { schoolId } = req.params;
            const { trainerId } = req.body;

            if (!trainerId) {
                return res.redirect('/admin-dashboard?error=Trainer ID is required for Trainer 1');
            }

            const schoolRef = db.collection('schools').doc(schoolId);
            const schoolDoc = await schoolRef.get();
            if (!schoolDoc.exists) {
                return res.redirect('/admin-dashboard?error=School not found');
            }

            const { name: schoolName, eventDate, spot, facilities } = schoolDoc.data();
            const trainerRef = db.collection('trainers').doc(trainerId);
            const trainerDoc = await trainerRef.get();
            if (!trainerDoc.exists) {
                return res.redirect('/admin-dashboard?error=Trainer not found');
            }

            // Check if trainer is already assigned to another school
            const existingSchoolId = trainerDoc.data().assignedSchoolId;
            if (existingSchoolId && existingSchoolId !== schoolId) {
                return res.redirect('/admin-dashboard?error=Trainer already assigned to another school');
            }

            // Update school with trainer ID
            await schoolRef.update({
                trainerId1: trainerId
            });

            // Update trainer with assigned school details
            await trainerRef.update({
                assignedSchoolId: schoolId,
                assignedSchoolName: schoolName
            });

            // Create assignment subcollection document
            await trainerRef.collection('assignments').doc(schoolId).set({
                schoolId,
                schoolName,
                eventDate: eventDate || null,
                spot: spot || null,
                facilities: facilities || [],
                assignedAt: admin.firestore.Timestamp.now()
            });

            console.log(`Assigned Trainer 1 ${trainerId} to school ${schoolId}`);
            res.redirect('/admin-dashboard?success=Trainer 1 assigned successfully');
        } catch (error) {
            console.error('Error assigning Trainer 1:', error);
            res.redirect('/admin-dashboard?error=Failed to assign Trainer 1');
        }
    });

    // Assign Trainer 2
    app.post('/admin/assign-trainer2/:schoolId', requireAdmin, async (req, res) => {
        try {
            const { schoolId } = req.params;
            const { trainerId } = req.body;

            if (!trainerId) {
                return res.redirect('/admin-dashboard?error=Trainer ID is required for Trainer 2');
            }

            const schoolRef = db.collection('schools').doc(schoolId);
            const schoolDoc = await schoolRef.get();
            if (!schoolDoc.exists) {
                return res.redirect('/admin-dashboard?error=School not found');
            }

            const { name: schoolName, eventDate, spot, facilities } = schoolDoc.data();
            const trainerRef = db.collection('trainers').doc(trainerId);
            const trainerDoc = await trainerRef.get();
            if (!trainerDoc.exists) {
                return res.redirect('/admin-dashboard?error=Trainer not found');
            }

            // Check if trainer is already assigned to another school
            const existingSchoolId = trainerDoc.data().assignedSchoolId;
            if (existingSchoolId && existingSchoolId !== schoolId) {
                return res.redirect('/admin-dashboard?error=Trainer already assigned to another school');
            }

            // Update school with trainer ID
            await schoolRef.update({
                trainerId2: trainerId
            });

            // Update trainer with assigned school details
            await trainerRef.update({
                assignedSchoolId: schoolId,
                assignedSchoolName: schoolName
            });

            // Create assignment subcollection document
            await trainerRef.collection('assignments').doc(schoolId).set({
                schoolId,
                schoolName,
                eventDate: eventDate || null,
                spot: spot || null,
                facilities: facilities || [],
                assignedAt: admin.firestore.Timestamp.now()
            });

            console.log(`Assigned Trainer 2 ${trainerId} to school ${schoolId}`);
            res.redirect('/admin-dashboard?success=Trainer 2 assigned successfully');
        } catch (error) {
            console.error('Error assigning Trainer 2:', error);
            res.redirect('/admin-dashboard?error=Failed to assign Trainer 2');
        }
    });

    // Reject trainer and show available trainers (for assigning new trainers)
    app.post('/reject-trainer/:id', requireAdmin, async (req, res) => {
        try {
            const availableTrainersSnapshot = await db.collection('trainers')
                .where('isApproved', '==', true)
                .get();
            const availableTrainers = availableTrainersSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            res.render('assignTrainer', {
                rejectedTrainerId: req.params.id,
                availableTrainers,
                error: null,
                schoolId: req.query.schoolId || null
            });
        } catch (error) {
            console.error('Error fetching available trainers:', error);
            res.render('assignTrainer', {
                rejectedTrainerId: req.params.id,
                availableTrainers: [],
                error: 'Failed to load available trainers',
                schoolId: req.query.schoolId || null
            });
        }
    });
    // Admin logout
    app.get('/admin-logout', (req, res) => {
    req.session.destroy(err => {    
    if (err) {
    console.error('Error destroying session:', err.message, err.stack);
    }
    res.redirect('/admin-login');
    });
    });
    //traniner game zone
app.get('/trainer-gamezone', async (req, res) => {
    try {
        res.render('trainer-gamezone', { trainerName: 'Demo Trainer', trainerMobile: 'N/A' });
    } catch (error) {
        console.error('Error in trainer-gamezone route:', error.message);
        res.status(500).send('Error loading Trainer Game Zone.');
    }
});
// trainer add date
app.post('/trainer-dashboard/add-dates', async (req, res) => {
    try {
        const { trainerEmail, availableDates } = req.body;
        if (!trainerEmail || !availableDates) return res.status(400).send('Missing data');

        const trainerSnapshot = await db.collection('trainers').where('email', '==', trainerEmail).get();

        if (trainerSnapshot.empty) return res.status(404).send('Trainer not found');

        const trainerId = trainerSnapshot.docs[0].id;
        const trainerRef = db.collection('trainers').doc(trainerId);
        const trainerData = trainerSnapshot.docs[0].data();

        const existingDates = trainerData.availableDates || [];
        const newDates = Array.isArray(availableDates) ? availableDates : [availableDates];

        await trainerRef.update({
            availableDates: [...existingDates, ...newDates]
        });

        res.redirect(`/trainer-dashboard?username=${encodeURIComponent(trainerEmail)}`);
    } catch (err) {
        console.error('Error adding dates:', err);
        res.status(500).send('Internal Server Error');
    }
});

    //delete date for trainer 
  app.post('/trainer-dashboard/delete-date', async (req, res) => {
    try {
        const { trainerEmail, dateToDelete } = req.body;
        const username = req.query.username;

        if (!trainerEmail || trainerEmail !== username) {
            return res.redirect(`/trainer-dashboard?username=${encodeURIComponent(username)}&error=Invalid%20trainer%20email`);
        }

        if (!dateToDelete) {
            return res.redirect(`/trainer-dashboard?username=${encodeURIComponent(username)}&error=No%20date%20provided`);
        }

        const trainerSnapshot = await db.collection('trainers').where('email', '==', trainerEmail).get();

        if (trainerSnapshot.empty) {
            return res.redirect(`/trainer-dashboard?username=${encodeURIComponent(username)}&error=Trainer%20not%20found`);
        }

        const trainerId = trainerSnapshot.docs[0].id;
        const trainerRef = db.collection('trainers').doc(trainerId);
        const trainerData = trainerSnapshot.docs[0].data();

        const dateToDeleteStr = new Date(dateToDelete).toISOString().split('T')[0];
        if (!dateToDeleteStr) {
            return res.redirect(`/trainer-dashboard?username=${encodeURIComponent(username)}&error=Invalid%20date%20format`);
        }

        const updatedDates = (trainerData.availableDates || []).filter(date => {
            if (!date) return true;

            // If stored as Firestore Timestamp
            if (date.toDate) {
                return date.toDate().toISOString().split('T')[0] !== dateToDeleteStr;
            }

            // If stored as string
            const dateStr = new Date(date).toISOString().split('T')[0];
            return dateStr !== dateToDeleteStr;
        });

        await trainerRef.update({
            availableDates: updatedDates
        });

        return res.redirect(`/trainer-dashboard?username=${encodeURIComponent(username)}&success=Date%20deleted%20successfully`);
    } catch (error) {
        console.error('Error deleting date:', error);
        return res.redirect(`/trainer-dashboard?username=${encodeURIComponent(req.query.username)}&error=Error%20deleting%20date`);
    }
});

    //uploaded media for trainer
   app.post('/trainer-dashboard/upload-media', upload, async (req, res) => {
    try {
        const { trainerEmail, mediaDescription, mediaLink } = req.body;
        const photos = req.files['photos'] || [];
        const videos = req.files['videos'] || [];
        const zipFiles = req.files['zipFiles'] || []; // Add ZIP file handling

        if (!trainerEmail) {
            return res.status(400).render('trainerDashboard', {
                trainerName: 'Unknown',
                email: '',
                city: '',
                district: '',
                profession: '',
                assignedSchools: [],
                availableDates: [],
                schoolsInDistrict: [],
                mediaUploads: [],
                approvedZips: [],
                error: 'Trainer email is required',
                success: null,
                trainerData: {}
            });
        }

        // Fetch trainer data
        const trainerSnapshot = await db.collection('trainers')
            .where('email', '==', trainerEmail)
            .get();
        if (trainerSnapshot.empty) {
            return res.status(404).render('trainerDashboard', {
                trainerName: 'Unknown',
                email: trainerEmail,
                city: '',
                district: '',
                profession: '',
                assignedSchools: [],
                availableDates: [],
                schoolsInDistrict: [],
                mediaUploads: [],
                approvedZips: [],
                error: 'Trainer not found',
                success: null,
                trainerData: {}
            });
        }

        const trainerId = trainerSnapshot.docs[0].id;
        const trainerData = trainerSnapshot.docs[0].data();

        if (!trainerData.isApproved) {
            return res.status(403).render('trainerDashboard', {
                trainerName: trainerData.trainerName || 'Unknown',
                email: trainerEmail,
                city: trainerData.city || '',
                district: trainerData.district || trainerData.city || '',
                profession: trainerData.profession || '',
                assignedSchools: [],
                availableDates: trainerData.availableDates || [],
                schoolsInDistrict: [],
                mediaUploads: [],
                approvedZips: [],
                error: 'You must complete the Train the Trainer program to upload media.',
                success: null,
                trainerData
            });
        }

        if (mediaDescription && mediaDescription.length > 1000) {
            return res.status(400).render('trainerDashboard', {
                trainerName: trainerData.trainerName || 'Unknown',
                email: trainerEmail,
                city: trainerData.city || '',
                district: trainerData.district || trainerData.city || '',
                profession: trainerData.profession || '',
                assignedSchools: [],
                availableDates: trainerData.availableDates || [],
                schoolsInDistrict: [],
                mediaUploads: [],
                approvedZips: [],
                error: 'Media description cannot exceed 1000 characters',
                success: null,
                trainerData
            });
        }

        // Explicitly set the bucket name
        const bucket = admin.storage().bucket('beinglawful-ee5a4.firebasestorage.app');
        const [exists] = await bucket.exists();
        if (!exists) {
            throw new Error('The specified bucket does not exist. Please check your Firebase configuration.');
        }

        const mediaUploads = [];
        const zipUploads = [];

        // Handle photos
        for (const file of photos) {
            const fileName = `media/trainers/${trainerId}/photos/${Date.now()}_${file.originalname}`;
            const fileUpload = bucket.file(fileName);
            await fileUpload.save(file.buffer, {
                metadata: { contentType: file.mimetype }
            });
            const [url] = await fileUpload.getSignedUrl({
                action: 'read',
                expires: '03-09-2491'
            });
            mediaUploads.push({
                url,
                type: 'image',
                path: fileName,
                description: mediaDescription || '',
                link: mediaLink || '',
                uploadedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }

        // Handle videos
        for (const file of videos) {
            const fileName = `media/trainers/${trainerId}/videos/${Date.now()}_${file.originalname}`;
            const fileUpload = bucket.file(fileName);
            await fileUpload.save(file.buffer, {
                metadata: { contentType: file.mimetype }
            });
            const [url] = await fileUpload.getSignedUrl({
                action: 'read',
                expires: '03-09-2491'
            });
            mediaUploads.push({
                url,
                type: 'video',
                path: fileName,
                description: mediaDescription || '',
                link: mediaLink || '',
                uploadedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }

        // Handle ZIP files
        for (const file of zipFiles) {
            const fileName = `zipfiles/trainers/${trainerId}/${Date.now()}_${file.originalname}`;
            const fileUpload = bucket.file(fileName);
            await fileUpload.save(file.buffer, {
                metadata: { contentType: file.mimetype }
            });
            const [url] = await fileUpload.getSignedUrl({
                action: 'read',
                expires: '03-09-2491'
            });
            zipUploads.push({
                trainerId,
                fileName: file.originalname,
                url,
                path: fileName,
                approved: false, // Initially not approved
                uploadedAt: admin.firestore.FieldValue.serverTimestamp(),
                description: mediaDescription || '',
                link: mediaLink || ''
            });
        }

        // Save media uploads to Firestore
        if (mediaUploads.length > 0) {
            const batch = db.batch();
            mediaUploads.forEach(upload => {
                const mediaRef = db.collection('trainers').doc(trainerId).collection('mediaUploads').doc();
                batch.set(mediaRef, upload);
            });
            await batch.commit();
        }

        // Save ZIP uploads to Firestore
        if (zipUploads.length > 0) {
            const batch = db.batch();
            zipUploads.forEach(upload => {
                const zipRef = db.collection('trainerZips').doc();
                batch.set(zipRef, upload);
            });
            await batch.commit();
        }

        // Fetch updated trainer data
        const updatedTrainerSnapshot = await db.collection('trainers').doc(trainerId).get();
        const updatedTrainerData = updatedTrainerSnapshot.data();

        // Fetch assigned schools
        const schoolsSnapshot1 = await db.collection('schools')
            .where('isApproved', '==', true)
            .where('trainerId1', '==', trainerId)
            .get();
        const schoolsSnapshot2 = await db.collection('schools')
            .where('isApproved', '==', true)
            .where('trainerId2', '==', trainerId)
            .get();
        const assignedSchools = [...schoolsSnapshot1.docs, ...schoolsSnapshot2.docs].map(doc => {
            const data = doc.data();
            return {
                schoolName: data.schoolName || 'N/A',
                city: data.city || 'N/A',
                district: data.district || data.city || 'N/A',
                eventDate: data.eventDate ? data.eventDate.toDate().toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                }) : 'Not assigned',
                resourcesConfirmed: data.resourcesConfirmed || false,
                selectedResources: data.selectedResources || [],
                trainerRole: data.trainerId1 === trainerId ? 'Trainer 1' : 'Trainer 2'
            };
        });

        // Fetch schools in the trainer's district
        const schoolsInDistrictSnapshot = await db.collection('schools')
            .where('district', '==', updatedTrainerData.district || updatedTrainerData.city)
            .where('isApproved', '==', true)
            .get();
        const schoolsInDistrict = schoolsInDistrictSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                schoolName: data.schoolName || 'N/A',
                schoolEmail: data.schoolEmail || 'N/A',
                city: data.city || 'N/A',
                district: data.district || 'N/A',
                eventDate: data.eventDate ? data.eventDate.toDate().toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                }) : 'Not assigned',
                assignedTrainerId: data.trainerId1 || data.trainerId2 || null,
                trainerRole: data.trainerId1 === trainerId ? 'Trainer 1' : data.trainerId2 === trainerId ? 'Trainer 2' : null
            };
        });

        // Fetch media uploads
        const mediaSnapshot = await db.collection('trainers').doc(trainerId).collection('mediaUploads').get();
        const mediaUploadsData = mediaSnapshot.docs.map(doc => ({
            ...doc.data(),
            uploadedAt: doc.data().uploadedAt ? doc.data().uploadedAt.toDate() : null
        }));

        // Fetch approved ZIP files
        const zipSnapshot = await db.collection('trainerZips')
            .where('trainerId', '==', trainerId)
            .where('approved', '==', true)
            .get();
        const approvedZips = zipSnapshot.docs.map(doc => ({
            ...doc.data(),
            downloadUrl: `/zipfiles/${doc.data().fileName}`,
            uploadedAt: doc.data().uploadedAt ? doc.data().uploadedAt.toDate() : null
        }));

        res.render('trainerDashboard', {
            trainerName: updatedTrainerData.trainerName || 'Unknown',
            email: trainerEmail,
            city: updatedTrainerData.city || '',
            district: updatedTrainerData.district || updatedTrainerData.city || '',
            profession: updatedTrainerData.profession || '',
            assignedSchools,
            availableDates: updatedTrainerData.availableDates || [],
            schoolsInDistrict,
            mediaUploads: mediaUploadsData,
            approvedZips,
            error: null,
            success: 'Media and/or ZIP files uploaded successfully',
            trainerData: updatedTrainerData
        });
    } catch (error) {
        console.error('Error in trainer-dashboard/upload-media route:', error.message, error.stack);
        res.status(500).render('trainerDashboard', {
            trainerName: 'Unknown',
            email: trainerEmail || '',
            city: '',
            district: '',
            profession: '',
            assignedSchools: [],
            availableDates: [],
            schoolsInDistrict: [],
            mediaUploads: [],
            approvedZips: [],
            error: `Error uploading media: ${error.message}`,
            success: null,
            trainerData: {}
        });
    }
});

    app.get('/trainer-dashboard', async (req, res) => {
        try {
            const trainerEmail = req.query.username;
            if (!trainerEmail) {
                return res.status(400).render('trainerDashboard', {
                    trainerName: 'Unknown',
                    email: '',
                    city: '',
                    district: '',
                    profession: '',
                    assignedSchools: [],
                    availableDates: [],
                    schoolsInDistrict: [],
                    mediaUploads: [],
                    approvedZips: [],
                    error: 'Trainer email is required',
                    success: null,
                    trainerData: {}
                });
            }

            // Fetch trainer data
            const trainerSnapshot = await db.collection('trainers')
                .where('email', '==', trainerEmail)
                .get();

            if (trainerSnapshot.empty) {
                return res.status(404).render('trainerDashboard', {
                    trainerName: 'Unknown',
                    email: trainerEmail,
                    city: '',
                    district: '',
                    profession: '',
                    assignedSchools: [],
                    availableDates: [],
                    schoolsInDistrict: [],
                    mediaUploads: [],
                    approvedZips: [],
                    error: 'Trainer not found',
                    success: null,
                    trainerData: {}
                });
            }

            const trainerId = trainerSnapshot.docs[0].id;
            const trainerData = trainerSnapshot.docs[0].data();

            // Fetch assigned schools
            const schoolsSnapshot1 = await db.collection('schools')
                .where('isApproved', '==', true)
                .where('trainerId1', '==', trainerId)
                .get();

            const schoolsSnapshot2 = await db.collection('schools')
                .where('isApproved', '==', true)
                .where('trainerId2', '==', trainerId)
                .get();

            const assignedSchools = [...schoolsSnapshot1.docs, ...schoolsSnapshot2.docs].map(doc => {
                const data = doc.data();
                return {
                    schoolName: data.schoolName || 'N/A',
                    city: data.city || 'N/A',
                    district: data.district || data.city || 'N/A',
                    eventDate: data.eventDate ? data.eventDate.toDate().toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                    }) : 'Not assigned',
                    resourcesConfirmed: data.resourcesConfirmed || false,
                    selectedResources: data.selectedResources || [],
                    trainerRole: data.trainerId1 === trainerId ? 'Trainer 1' : 'Trainer 2'
                };
            });

            // Fetch schools in trainer's district
            const schoolsInDistrictSnapshot = await db.collection('schools')
                .where('district', '==', trainerData.district || trainerData.city)
                .where('isApproved', '==', true)
                .get();

            const schoolsInDistrict = schoolsInDistrictSnapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    schoolName: data.schoolName || 'N/A',
                    schoolEmail: data.schoolEmail || 'N/A',
                    city: data.city || 'N/A',
                    district: data.district || 'N/A',
                    eventDate: data.eventDate ? data.eventDate.toDate().toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                    }) : 'Not assigned',
                    assignedTrainerId: data.trainerId1 || data.trainerId2 || null,
                    trainerRole: data.trainerId1 === trainerId ? 'Trainer 1' : data.trainerId2 === trainerId ? 'Trainer 2' : null
                };
            });

            // Fetch media uploads
            const mediaSnapshot = await db.collection('trainers').doc(trainerId).collection('mediaUploads').get();
            const mediaUploads = mediaSnapshot.docs.map(doc => ({
                ...doc.data(),
                uploadedAt: doc.data().uploadedAt ? doc.data().uploadedAt.toDate() : null
            }));

            // Fetch approved ZIP files for trainers
            const zipSnapshot = await db.collection('trainerZips')
                .where('trainerId', '==', trainerId)
                .where('approved', '==', true)
                .get();

                 const approvedZips = zipSnapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    ...data,
                    downloadUrl: `/zipfiles/${data.fileName}`, // Path for downloading
                    uploadedAt: data.uploadedAt ? data.uploadedAt.toDate() : null
                };
            });


            // Render Dashboard with all data
            res.render('trainerDashboard', {
                trainerName: trainerData.trainerName || 'Unknown',
                email: trainerEmail,
                city: trainerData.city || '',
                district: trainerData.district || trainerData.city || '',
                profession: trainerData.profession || '',
                assignedSchools,
                availableDates: trainerData.availableDates || [],
                schoolsInDistrict,
                mediaUploads,
                approvedZips,
                error: null,
                success: null,
                trainerData
            });

        } catch (error) {
            console.error('Error in trainer-dashboard route:', error.message, error.stack);
            res.status(500).render('trainerDashboard', {
                trainerName: 'Unknown',
                email: req.query.username || '',
                city: '',
                district: '',
                profession: '',
                assignedSchools: [],
                availableDates: [],
                schoolsInDistrict: [],
                mediaUploads: [],
                approvedZips: [],
                error: `Error loading dashboard: ${error.message}`,
                success: null,
                trainerData: {}
            });
        }
    });    
app.post('/trainer-login', async (req, res) => {
            const { username, password } = req.body;
            try {
                if (!username || !password) {
                    return res.render('login', { error: 'Username and password are required.' });
                }

                const snapshot = await db.collection('trainers')
                    .where('email', '==', username)
                    .get();
                if (snapshot.empty) {
                    return res.render('login', { error: 'Invalid username or password.' });
                }

                const trainer = snapshot.docs[0].data();
                if (password !== trainer.mobileNumber) {
                    return res.render('login', { error: 'Invalid username or password.' });
                }

                res.redirect(`/trainer-dashboard?username=${encodeURIComponent(username)}`);
            } catch (error) {
                console.error('Error during trainer login:', error.message, error.stack);
                res.render('login', { error: 'Login failed. Try again later.' });
            }
        });

  app.get('/trainer-participation', async (req, res) => {
    try {
        const schoolsSnapshot = await db.collection('schools')
            .where('isApproved', '==', true)
            .get();
        const schools = schoolsSnapshot.docs.map(doc => doc.data().schoolName);

        const trainersSnapshot = await db.collection('trainers')
            .where('isApproved', '==', true) // Filter for approved trainers
            .get();
        const trainers = trainersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        res.render('trainerParticipation', { schools, trainers, errors: null });
    } catch (error) {
        console.error('Error in trainer-participation route:', error.message, error.stack);
        res.status(500).send('Error loading trainer participation form.');
    }
});
   
app.post('/trainer-participate', [
    body('trainerName').trim().notEmpty().withMessage('Trainer name is required'),
    body('email').trim().isEmail().withMessage('Invalid email address'),
    body('city').trim().notEmpty().withMessage('City is required'),
    body('district').trim().notEmpty().withMessage('District is required'),
    body('profession').trim().notEmpty().withMessage('Profession is required'),
    body('mobileNumber').trim().matches(/^\d{10}$/).withMessage('Mobile number must be 10 digits'),
    body('whatsappNumber').trim().matches(/^\d{10}$/).withMessage('WhatsApp number must be 10 digits'),
    body('referenceName').trim().notEmpty().withMessage('Reference name is required')
], async (req, res) => {
    try {
        const validationErrors = validationResult(req);
        const errors = validationErrors.isEmpty() ? [] : validationErrors.array();

        const {
            trainerName, email, city, district, profession, mobileNumber, whatsappNumber, referenceName
        } = req.body;

        const duplicateChecks = [
            { field: 'email', value: email, message: 'Email already exists' },
            { field: 'mobileNumber', value: mobileNumber, message: 'Mobile number already exists' },
            { field: 'whatsappNumber', value: whatsappNumber, message: 'WhatsApp number already exists' }
        ];

        for (const check of duplicateChecks) {
            const snapshot = await db.collection('trainers').where(check.field, '==', check.value).get();
            if (!snapshot.empty) {
                errors.push({ param: check.field, msg: check.message });
            }
        }

        if (errors.length > 0) {
            return await renderFormWithErrors(res, errors);
        }

        await db.collection('trainers').add({
            trainerName,
            email,
            city,
            district,
            profession,
            mobileNumber,
            whatsappNumber,
            referenceName,
            registeredAt: admin.firestore.FieldValue.serverTimestamp(),
            isApproved: false
        });

        await sendEmail(
            email,
            emailTemplates.trainerRegistration.subject,
            emailTemplates.trainerRegistration.text(trainerName, email, mobileNumber),
            emailTemplates.trainerRegistration.html(trainerName, email, mobileNumber)
        );

        res.render('confirmation', {
            schoolEmail: email,
            principalNumber: mobileNumber
        });

    } catch (error) {
        console.error('Error in trainer-participate route:', error.message, error.stack);
        await renderFormWithErrors(res, [{ msg: 'Internal server error. Please try again later.' }]);
    }
});

// Helper function to render form with data and errors
async function renderFormWithErrors(res, errors) {
    const schoolsSnapshot = await db.collection('schools').where('isApproved', '==', true).get();
    const schools = schoolsSnapshot.docs.map(doc => doc.data().schoolName);

    const trainersSnapshot = await db.collection('trainers').get();
    const trainers = trainersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    res.status(400).render('trainerParticipation', { schools, trainers, errors });
}

    // Assign trainer to school
    app.post('/admin/assign-trainer', requireAdmin, async (req, res) => {
    try {
    const { schoolId, trainerId } = req.body;
    if (!schoolId || !trainerId) {
    return res.redirect('/admin-dashboard?error=School ID and Trainer ID are required');
    }

    const schoolRef = db.collection('schools').doc(schoolId);
    const schoolDoc = await schoolRef.get();
    if (!schoolDoc.exists) {
    return res.redirect('/admin-dashboard?error=School not found');
    }

    const trainerRef = db.collection('trainers').doc(trainerId);
    const trainerDoc = await trainerRef.get();
    if (!trainerDoc.exists) {
    return res.redirect('/admin-dashboard?error=Trainer not found');
    }

    await schoolRef.update({ assignedTrainerId: trainerId });
    res.redirect('/admin-dashboard?success=Trainer assigned successfully');
    } catch (error) {
    console.error('Error in admin/assign-trainer route:', error.message, error.stack);
    res.redirect('/admin-dashboard?error=Error assigning trainer');
    }
    });

    // Logout
    app.get('/logout', (req, res) => {
    req.session.destroy(err => {
    if (err) {
    console.error('Error destroying session:', err.message, err.stack);
    }
    res.redirect('/login');
    });
    });


    // logistic Dashboard route
app.get("/logistic-dashboard", async (req, res) => {
  const snapshot = await db
    .collection("schools")
    .where("isApproved", "==", true)
    .get();

  const schools = [];

  snapshot.forEach(doc => {
    const data = doc.data();
    schools.push({
      id: doc.id,
      name: data.schoolName,
      civicsSirNumber: data.civicsTeacherNumber,
      schoolPhoneNumber: data.schoolPhoneNumber,
    principalNumber: data.principalNumber,       
      city: data.city,
      district: data.district,
      rawEventDate: data.eventDate?.toDate(), // Keep raw Date for sorting
      eventDate: data.eventDate?.toDate().toLocaleDateString("en-IN"),
      status: data.isCompleted ? "delivered" : "pending",
    });
  });

  // Sort by raw date
  schools.sort((a, b) => a.rawEventDate - b.rawEventDate);

  res.render("logistic-dashboard", { schools });
});


// New POST route to update status
app.post("/update-status", async (req, res) => {
  const { id, status } = req.body;

  try {
    await db.collection("schools").doc(id).update({
      status: status,
      isCompleted: status === "delivered"
    });
    res.redirect("/logistic-dashboard");
  } catch (error) {
    console.error("Status update failed:", error);
    res.status(500).send("Error updating status");
  }
});


app.get("/admin-dashboard/logistics", async (req, res) => {
  try {
    const snapshot = await db
      .collection("schools")
      .where("isApproved", "==", true)
      .get();

    const schools = [];

    snapshot.forEach(doc => {
      const data = doc.data();
      schools.push({
        id: doc.id,
        name: data.schoolName || "N/A",
        civicsSirNumber: data.civicsTeacherNumber || "N/A",
        schoolPhoneNumber: data.schoolPhoneNumber || "N/A",
        principalNumber: data.principalNumber || "N/A",
        city: data.city || "N/A",
        district: data.district || "N/A",
        rawEventDate: data.eventDate?.toDate(), // For sorting if needed
        eventDate: data.eventDate
          ? data.eventDate.toDate().toLocaleDateString("en-IN", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })
          : "Not set",
        status: data.isCompleted ? "Delivered" : "Pending",
      });
    });

    res.render("admin-logistics", { schools });
  } catch (error) {
    console.error("Error fetching logistics data:", error);
    res.status(500).send("Error loading logistics dashboard");
  }
});

    // Start the server
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    });