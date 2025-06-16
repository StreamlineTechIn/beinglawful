const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
const session = require('express-session');
require('dotenv').config();
const { body, validationResult } = require('express-validator');
const nodemailer = require('nodemailer');

const app = express();

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
app.use(express.json());

// Trial test questions
const trialTests = {
    trial1: [
        { question: "What is 1 + 1?", options: ["1", "2", "3", "4"], correctAnswer: "2" },
        { question: "Which color is the sky on a clear day?", options: ["Red", "Blue", "Green", "Yellow"], correctAnswer: "Blue" }
    ],
    trial2: [
        { question: "What is 3 - 1?", options: ["1", "2", "3", "4"], correctAnswer: "2" },
        { question: "Which animal is known as man's best friend?", options: ["Cat", "Dog", "Bird", "Fish"], correctAnswer: "Dog" }
    ]
};

// Validate environment variables for Firebase and SMTP
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
let db;
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
        credential: admin.credential.cert(serviceAccount)
    });
    db = admin.firestore();
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

// SMTP Setup for GoDaddy with Debugging
const transporter = nodemailer.createTransport({
    host: 'smtp-mail.outlook.com',
    port: 587,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    tls: {
        ciphers: 'SSLv3'
    },
    debug: true,
    logger: true
});

// Function to send emails
const sendEmail = async (to, subject, text, html) => {
    try {
        const mailOptions = {
            from: `"Being Lawful" <${process.env.EMAIL_USER}>`,
            to,
            subject,
            text,
            html
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`Email sent: ${info.messageId}`);
        return true;
    } catch (error) {
        console.error(`Error sending email to ${to}: ${error.message}`);
        return false;
    }
};

// Editable Email Message Templates
const emailTemplates = {
    schoolRegistration: {
        subject: 'Your School Registration - Login Credentials',
        text: (schoolName, email, password) => 
            `Dear ${schoolName},\n\nYour school has been registered with Being Lawful.\n\nLogin Credentials:\nUsername: ${email}\nPassword: ${password}\n\nPlease log in to complete your profile setup.\n\nBest regards,\nBeing Lawful Team`,
        html: (schoolName, email, password) => 
            `<p>Dear ${schoolName},</p><p>Your school has been registered with Being Lawful.</p><p><strong>Login Credentials:</strong><br>Username: ${email}<br>Password: ${password}</p><p> <strong> Please log in to complete your profile setup. </strong></p><p>Best regards,<br>Being Lawful Team</p>`
    },
    schoolApproval: {
        subject: 'School Approval Confirmation',
        text: (schoolName) => 
            `Dear ${schoolName},\n\nWe are pleased to inform you that your school has been approved by Being Lawful.\n\nYou can now proceed with the next steps, such as attending the workshop.\n\nBest regards,\nBeing Lawful Team`,
        html: (schoolName) => 
            `<p>Dear ${schoolName},</p><p>We are pleased to inform you that your school has been approved by Being Lawful.</p><p>You can now proceed with the next steps, such as attending the workshop.</p><p>Best regards,<br>Being Lawful Team</p>`
    },
    schoolWorkshopReminder: {
        subject: 'Workshop Day Reminder',
        text: (schoolName, workshopDate) => 
            `Dear ${schoolName},\n\nThis is a reminder that today is the workshop day for Being Lawful.\n\nDate: ${workshopDate}\n\nWe look forward to seeing you there!\n\nBest regards,\nBeing Lawful Team`,
        html: (schoolName, workshopDate) => 
            `<p>Dear ${schoolName},</p><p>This is a reminder that today is the workshop day for Being Lawful.</p><p><strong>Date:</strong> ${workshopDate}</p><p>We look forward to seeing you there!</p><p>Best regards,<br>Being Lawful Team</p>`
    },
    studentRegistration: {
        subject: 'Student Registration - Login Credentials',
        text: (studentName, username, password) => 
            `Dear Parent,\n\nYour child, ${studentName}, has been registered with Being Lawful.\n\nLogin Credentials:\nUsername: ${username}\nPassword: ${password}\n\nPlease log in to access the student portal.\n\nBest regards,\nBeing Lawful Team`,
        html: (studentName, username, password) => 
            `<p>Dear Parent,</p><p>Your child, ${studentName}, has been registered with Being Lawful.</p><p><strong>Login Credentials:</strong><br>Username: ${username}<br>Password: ${password}</p><p>Please log in to access the student portal.</p><p>Best regards,<br>Being Lawful Team</p>`
    },
    studentCertificate: {
        subject: 'Congratulations - MCQ Completion and Certificate',
        text: (studentName, username, percentage) => 
            `Dear ${studentName},\n\nCongratulations on completing the Main Exam with Being Lawful! You scored ${percentage}%.\n\nView and download your certificate here: https://beinglawful.in/certificate/${username}\n\nWe appreciate your participation and look forward to seeing you at the workshop.\n\nBest regards,\nBeing Lawful Team`,
        html: (studentName, username, percentage) => 
            `<p>Dear ${studentName},</p><p>Congratulations on completing the Main Exam with Being Lawful! You scored ${percentage}%.</p><p>View and download your certificate <a href="https://beinglawful.in/certificate/${username}">here</a>.</p><p>We appreciate your participation and look forward to seeing you at the workshop.</p><p>Best regards,<br>Being Lawful Team</p>`
    },
    studentWorkshopReminder: {
        subject: 'Workshop Day Reminder',
        text: (studentName, workshopDate) => 
            `Dear ${studentName},\n\nThis is a reminder that today is the workshop day for Being Lawful.\n\nDate: ${workshopDate}\n\nWe look forward to seeing you there!\n\nBest regards,\nBeing Lawful Team`,
        html: (studentName, workshopDate) => 
            `<p>Dear ${studentName},</p><p>This is a reminder that today is the workshop day for Being Lawful.</p><p><strong>Date:</strong> ${workshopDate}</p><p>We look forward to seeing you there!</p><p>Best regards,<br>Being Lawful Team</p>`
    },
    trainerRegistration: {
        subject: 'Your Trainer Registration - Login Credentials',
        text: (trainerName, email, password) => 
            `Dear ${trainerName},\n\nYou have been registered as a trainer with Being Lawful.\n\nLogin Credentials:\nUsername: ${email}\nPassword: ${password}\n\nPlease log in to complete your profile setup.\n\nBest regards,\nBeing Lawful Team`,
        html: (trainerName, email, password) => 
            `<p>Dear ${trainerName},</p><p>You have been registered as a trainer with Being Lawful.</p><p><strong>Login Credentials:</strong><br>Username: ${email}<br>Password: ${password}</p><p> <strong> Please log in to complete your profile setup. </strong></p><p>Best regards,<br>Being Lawful Team</p>`
    },
    trainerApproval: {
        subject: 'Trainer Approval Confirmation',
        text: (trainerName) => 
            `Dear ${trainerName},\n\nWe are pleased to inform you that your trainer profile has been approved by Being Lawful.\n\nBest regards,\nBeing Lawful Team`,
        html: (trainerName) => 
            `<p>Dear ${trainerName},</p><p>We are pleased to inform you that your trainer profile has been approved by Being Lawful.</p><p>Best regards,<br>Being Lawful Team</p>`
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

// Fetch user by parentMobile1 (username for students)
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

// Determine if today is the event date
async function calculateIsEventDate(schoolName) {
    const { isEventDate, eventDateMissing } = await getEventDateDetails(schoolName);
    return { isEventDate, eventDateMissing };
}

// Send workshop reminder emails (runs daily)
const checkAndSendWorkshopEmails = async () => {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

    // Fetch all schools and their event dates
    const schoolsSnapshot = await db.collection('schools').where('isApproved', '==', true).get();
    if (!schoolsSnapshot.empty) {
        for (const doc of schoolsSnapshot.docs) {
            const school = doc.data();
            const schoolName = school.schoolName;
            const schoolEmail = school.schoolEmail;

            if (school.eventDate && typeof school.eventDate.toDate === 'function') {
                const eventDate = school.eventDate.toDate();
                const eventDateString = eventDate.toISOString().split('T')[0];

                if (today === eventDateString) {
                    const formattedEventDate = eventDate.toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                    });
                    await sendEmail(
                        schoolEmail,
                        emailTemplates.schoolWorkshopReminder.subject,
                        emailTemplates.schoolWorkshopReminder.text(schoolName, formattedEventDate),
                        emailTemplates.schoolWorkshopReminder.html(schoolName, formattedEventDate)
                    );
                }
            }
        }
    }

    // Fetch all students who completed MCQ
    const studentsSnapshot = await db.collection('participants').where('hasCompletedMCQ', '==', true).get();
    if (!studentsSnapshot.empty) {
        for (const doc of studentsSnapshot.docs) {
            const student = doc.data();
            const studentName = student.studentName;
            const parentEmail = student.parentEmail;
            const schoolName = student.schoolNameDropdown;

            const schoolSnapshot = await db.collection('schools')
                .where('schoolName', '==', schoolName)
                .get();
            if (schoolSnapshot.empty) continue;

            const schoolData = schoolSnapshot.docs[0].data();
            if (schoolData.eventDate && typeof schoolData.eventDate.toDate === 'function') {
                const eventDate = schoolData.eventDate.toDate();
                const eventDateString = eventDate.toISOString().split('T')[0];

                if (today === eventDateString && parentEmail) {
                    const formattedEventDate = eventDate.toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                    });
                    await sendEmail(
                        parentEmail,
                        emailTemplates.studentWorkshopReminder.subject,
                        emailTemplates.studentWorkshopReminder.text(studentName, formattedEventDate),
                        emailTemplates.studentWorkshopReminder.html(studentName, formattedEventDate)
                    );
                }
            }
        }
    }
};

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

// Check if it's on or after the event date for students
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
            percentage: user.percentage || 0
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
        const user = res.locals.user;
        const userId = (await db.collection('participants').where('parentMobile1', '==', parentMobile1).get()).docs[0].id;

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

        res.render('dashboard', {
            studentName: user.studentName || 'Unknown Student',
            parentMobile1: parentMobile1,
            hasCompletedMCQ: hasCompletedMCQ,
            hasCompletedTrial1: user.hasCompletedTrial1 || false,
            hasCompletedTrial2: user.hasCompletedTrial2 || false,
            mcqs: mcqs,
            trial1: trialTests.trial1,
            trial2: trialTests.trial2,
            isEventDate: res.locals.isEventDate,
            isOnOrAfterEventDate: res.locals.isOnOrAfterEventDate,
            eventDateMissing: res.locals.eventDateMissing,
            eventDate: res.locals.eventDate,
            showResults: hasCompletedMCQ,
            score: user.score || 0,
            totalQuestions: user.totalQuestions || 30,
            percentage: user.percentage || 0
        });
    } catch (error) {
        console.error('Error in dashboard route:', error.message, error.stack);
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

        // Send certificate and appreciation email
        if (updatedUser.parentEmail) {
            await sendEmail(
                updatedUser.parentEmail,
                emailTemplates.studentCertificate.subject,
                emailTemplates.studentCertificate.text(updatedUser.studentName, parentMobile1, percentage),
                emailTemplates.studentCertificate.html(updatedUser.studentName, parentMobile1, percentage)
            );
        }

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

// School dashboard (renders schoolDashboard.ejs)
app.get('/school-dashboard', async (req, res) => {
    try {
        const schoolEmail = req.query.username;
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
                error: 'Please login first',
                trialTests
            });
        }

        const schoolSnapshot = await db.collection('schools')
            .where('schoolEmail', '==', schoolEmail)
            .get();
        if (schoolSnapshot.empty) {
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
                error: 'School not found',
                trialTests
            });
        }

        const schoolData = schoolSnapshot.docs[0].data();
        const schoolId = schoolSnapshot.docs[0].id;
        const schoolName = schoolData.schoolName;

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

        const studentsSnapshot = await db.collection('participants')
            .where('schoolNameDropdown', '==', schoolName)
            .get();
        
        const students = studentsSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                studentName: data.studentName || 'N/A',
                studentClass: data.studentClass || 'N/A',
                hasCompletedMCQ: data.hasCompletedMCQ || false,
                trial1Percentage: data.trial1Percentage || 'N/A',
                trial2Percentage: data.trial2Percentage || 'N/A',
                score: data.score || 0,
                totalQuestions: data.totalQuestions || 0,
                percentage: data.percentage || 0,
                completedAt: data.completedAt ? data.completedAt.toDate().toLocaleDateString() : 'N/A'
            };
        });

        res.render('schoolDashboard', {
            schoolName,
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
            error: null,
            trialTests
        });
    } catch (error) {
        console.error('Error in school-dashboard route:', error.message, error.stack);
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
            error: 'Error loading student data.',
            trialTests
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

// Submit resource arrangement
app.post('/school-dashboard/submit-resources', async (req, res) => {
    try {
        const { schoolEmail, resources } = req.body;
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
                error: 'School not found',
                trialTests
            });
        }

        const schoolId = schoolSnapshot.docs[0].id;
        const selectedResources = Array.isArray(resources) ? resources : [resources];
        await db.collection('schools').doc(schoolId).update({
            resourcesConfirmed: true,
            selectedResources: selectedResources
        });

        res.redirect(`/school-dashboard?username=${encodeURIComponent(schoolEmail)}`);
    } catch (error) {
        console.error('Error in school-dashboard/submit-resources route:', error.message, error.stack);
        res.status(500).render('schoolDashboard', {
            schoolName: 'Unknown',
            schoolEmail: req.body.schoolEmail,
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
            error: 'Error submitting resource arrangement',
            trialTests
        });
    }
});

// School login (renders login.ejs)
app.post('/school-login', async (req, res) => {
    const { username, password } = req.body;
    try {
        if (!username || !password) {
            return res.render('login', { error: 'Username and password are required.' });
        }

        const snapshot = await db.collection('schools')
            .where('schoolEmail', '==', username)
            .get();
        if (snapshot.empty) {
            return res.render('login', { error: 'Invalid username or password.' });
        }

        const school = snapshot.docs[0].data();
        if (password !== school.principalNumber) {
            return res.render('login', { error: 'Invalid username or password.' });
        }

        res.redirect(`/school-dashboard?username=${encodeURIComponent(username)}`);
    } catch (error) {
        console.error('Error during school login:', error.message, error.stack);
        res.render('login', { error: 'Login failed. Try again later.' });
    }
});

// Trainer participation form (renders trainerParticipation.ejs)
app.get('/trainer-participation', async (req, res) => {
    try {
        const snapshot = await db.collection('trainers').get();
        const trainers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.render('trainerParticipation', { trainers, errors: null });
    } catch (error) {
        console.error('Error in trainer-participation route:', error.message, error.stack);
        res.status(500).send('Error fetching trainer data.');
    }
});

// Submit trainer participation (renders trainerParticipation.ejs on error, renders trainerConfirmation.ejs on success)
// Submit trainer participation (renders trainerParticipation.ejs on error, renders trainerConfirmation.ejs on success)
app.post('/trainer-participate', [
    body('trainerName').trim().notEmpty().withMessage('Trainer name is required'),
    body('mobileNumber').trim().matches(/^\d{10}$/).notEmpty().withMessage('Mobile number must be 10 digits'),
    body('whatsappNumber').trim().matches(/^\d{10}$/).notEmpty().withMessage('WhatsApp number must be 10 digits'),
    body('email').trim().isEmail().notEmpty().withMessage('Invalid email address'),
    body('city').trim().notEmpty().withMessage('City is required'),
    body('profession').trim().notEmpty().withMessage('Profession is required'),
    body('referenceName').trim().notEmpty().withMessage('Reference name is required')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const trainersSnapshot = await db.collection('trainers').get();
            const trainers = trainersSnapshot.docs.map(doc => doc.data());
            return res.status(400).render('trainerParticipation', { trainers, errors: errors.array() });
        }

        const {
            trainerName,
            mobileNumber,
            whatsappNumber,
            email,
            city,
            profession,
            referenceName
        } = req.body;

        await db.collection('trainers').add({
            trainerName,
            mobileNumber,
            whatsappNumber,
            email,
            city,
            profession,
            referenceName,
            registeredAt: admin.firestore.FieldValue.serverTimestamp(),
            isApproved: false
        });

        // Send trainer registration email
        await sendEmail(
            email,
            emailTemplates.trainerRegistration.subject,
            emailTemplates.trainerRegistration.text(trainerName, email, mobileNumber),
            emailTemplates.trainerRegistration.html(trainerName, email, mobileNumber)
        );

        res.render('trainerConfirmation', {
            trainerEmail: email,
            mobileNumber: mobileNumber,
            city: city,
            profession: profession
        });
    } catch (error) {
        console.error('Error in trainer-participate route:', error.message, error.stack);
        const trainersSnapshot = await db.collection('trainers').get();
        const trainers = trainersSnapshot.docs.map(doc => doc.data());
        res.status(500).render('trainerParticipation', {
            trainers,
            errors: [{ msg: 'Internal server error. Please try again later.' }]
        });
    }
});
// Trainer confirmation page (renders trainerConfirmation.ejs)
app.get('/trainer-confirmation', (req, res) => {
    res.render('trainerConfirmation', {
        trainerEmail: 'Not provided',
        mobileNumber: 'Not provided'
    });
});

// Trainer login (renders login.ejs)
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

        req.session.trainerEmail = username;
        res.redirect(`/trainer-dashboard?username=${encodeURIComponent(username)}`);
    } catch (error) {
        console.error('Error during trainer login:', error.message, error.stack);
        res.render('login', { error: 'Login failed. Try again later.' });
    }
});

// Trainer dashboard (renders trainerDashboard.ejs)
// Trainer dashboard (renders trainerDashboard.ejs)
app.get('/trainer-dashboard', async (req, res) => {
    try {
        const trainerEmail = req.query.username;
        if (!trainerEmail) {
            return res.render('trainerDashboard', {
                trainerName: 'Unknown',
                trainerEmail: '',
                mobileNumber: '',
                whatsappNumber: '',
                city: '',
                profession: '',
                referenceName: '',
                error: 'Please login first',
                trialTests
            });
        }

        const trainerSnapshot = await db.collection('trainers')
            .where('email', '==', trainerEmail)
            .get();
        if (trainerSnapshot.empty) {
            return res.render('trainerDashboard', {
                trainerName: 'Unknown',
                trainerEmail: '',
                mobileNumber: '',
                whatsappNumber: '',
                city: '',
                profession: '',
                referenceName: '',
                error: 'Trainer not found',
                trialTests
            });
        }

        const trainerData = trainerSnapshot.docs[0].data();
        const trainerId = trainerSnapshot.docs[0].id;
        const trainerName = trainerData.trainerName;

        res.render('trainerDashboard', {
            trainerName,
            trainerEmail: trainerData.email || '',
            mobileNumber: trainerData.mobileNumber || '',
            whatsappNumber: trainerData.whatsappNumber || '',
            city: trainerData.city || '',
            profession: trainerData.profession || '',
            referenceName: trainerData.referenceName || '',
            error: null,
            trialTests
        });
    } catch (error) {
        console.error('Error in trainer-dashboard route:', error.message, error.stack);
        res.render('trainerDashboard', {
            trainerName: 'Unknown',
            trainerEmail: '',
            mobileNumber: '',
            whatsappNumber: '',
            city: '',
            profession: '',
            referenceName: '',
            error: 'Error loading trainer data.',
            trialTests
        });
    }
});
// Update trainer information
// Update trainer information
app.post('/trainer-dashboard/update', [
    body('mobileNumber').trim().matches(/^\d{10}$/).notEmpty().withMessage('Mobile number must be 10 digits'),
    body('whatsappNumber').trim().matches(/^\d{10}$/).notEmpty().withMessage('WhatsApp number must be 10 digits'),
    body('city').trim().notEmpty().withMessage('City is required'),
    body('profession').trim().notEmpty().withMessage('Profession is required'),
    body('referenceName').trim().notEmpty().withMessage('Reference name is required')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const trainerEmail = req.body.trainerEmail;
            return res.status(400).render('trainerDashboard', {
                trainerName: 'Unknown',
                trainerEmail,
                mobileNumber: req.body.mobileNumber,
                whatsappNumber: req.body.whatsappNumber,
                city: req.body.city,
                profession: req.body.profession,
                referenceName: req.body.referenceName,
                error: errors.array()[0].msg,
                trialTests
            });
        }

        const {
            trainerEmail,
            mobileNumber,
            whatsappNumber,
            city,
            profession,
            referenceName
        } = req.body;

        const trainerSnapshot = await db.collection('trainers')
            .where('email', '==', trainerEmail)
            .get();
        if (trainerSnapshot.empty) {
            return res.status(404).render('trainerDashboard', {
                trainerName: 'Unknown',
                trainerEmail,
                mobileNumber,
                whatsappNumber,
                city,
                profession,
                referenceName,
                error: 'Trainer not found',
                trialTests
            });
        }

        const trainerId = trainerSnapshot.docs[0].id;
        await db.collection('trainers').doc(trainerId).update({
            mobileNumber,
            whatsappNumber,
            city,
            profession,
            referenceName
        });

        res.redirect(`/trainer-dashboard?username=${encodeURIComponent(trainerEmail)}`);
    } catch (error) {
        console.error('Error in trainer-dashboard/update route:', error.message, error.stack);
        res.status(500).render('trainerDashboard', {
            trainerName: 'Unknown',
            trainerEmail: req.body.trainerEmail,
            mobileNumber: req.body.mobileNumber,
            whatsappNumber: req.body.whatsappNumber,
            city: req.body.city,
            profession: req.body.profession,
            referenceName: req.body.referenceName,
            error: 'Error updating trainer information',
            trialTests
        });
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
        res.render('participation', { type, schoolNames });
    } catch (error) {
        console.error('Error in participation route:', error.message, error.stack);
        res.status(500).send('Error loading participation form.');
    }
});

// Submit participation (renders studentConfirmation.ejs)
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
            hasCompletedTrial1: false,
            hasCompletedTrial2: false,
            hasCompletedMCQ: false,
            score: 0
        };

        const requiredFields = ['studentName', 'schoolNameDropdown', 'birthdate', 'studentClass', 'parentMobile1', 'parentEmail', 'address', 'city', 'pincode', 'type'];
        for (const field of requiredFields) {
            if (!participant[field]) {
                return res.status(400).send('All required fields must be filled.');
            }
        }

        if (!/^\d{6}$/.test(participant.pincode)) {
            return res.status(400).send('Pincode must be a 6-digit number.');
        }
        if (!/^\d{10}$/.test(participant.parentMobile1) || (participant.parentMobile2 && !/^\d{10}$/.test(participant.parentMobile2))) {
            return res.status(400).send('Phone numbers must be 10 digits.');
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(participant.parentEmail)) {
            return res.status(400).send('Invalid email address.');
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(participant.birthdate)) {
            return res.status(400).send('Birthdate must be in YYYY-MM-DD format.');
        }

        await db.collection('participants').add(participant);
        const [year, month, day] = participant.birthdate.split('-');
        const password = `${day}${month}${year}`;

        // Send student registration email
        if (participant.parentEmail) {
            await sendEmail(
                participant.parentEmail,
                emailTemplates.studentRegistration.subject,
                emailTemplates.studentRegistration.text(participant.studentName, participant.parentMobile1, password),
                emailTemplates.studentRegistration.html(participant.studentName, participant.parentMobile1, password)
            );
        }

        res.render('studentConfirmation', {
            studentName: participant.studentName,
            username: participant.parentMobile1,
            password
        });
    } catch (error) {
        console.error('Error in participate route:', error.message, error.stack);
        res.status(500).send('Error saving participant data.');
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

// Submit school participation (renders schoolParticipation.ejs on error, renders confirmation.ejs on success)
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
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const schoolsSnapshot = await db.collection('schools').get();
            const schools = schoolsSnapshot.docs.map(doc => doc.data());
            return res.status(400).render('schoolParticipation', { schools, errors: errors.array() });
        }

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

        // Send school registration email
        await sendEmail(
            schoolEmail,
            emailTemplates.schoolRegistration.subject,
            emailTemplates.schoolRegistration.text(schoolName, schoolEmail, principalNumber),
            emailTemplates.schoolRegistration.html(schoolName, schoolEmail, principalNumber)
        );

        res.render('confirmation', {
            schoolEmail,
            schoolName,
            principalNumber
        });
    } catch (error) {
        console.error('Error in school-participate route:', error.message, error.stack);
        const schoolsSnapshot = await db.collection('schools').get();
        const schools = schoolsSnapshot.docs.map(doc => doc.data());
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
        schoolName: 'Not provided',
        principalNumber: 'Not provided'
    });
});

// Admin login page (renders adminLogin.ejs)
app.get('/admin-login', (req, res) => {
    res.render('adminLogin', { error: null });
});

// Admin login (renders adminDashboard.ejs)
app.post('/admin-login', (req, res) => {
    const { username, password } = req.body;
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
        req.session.isAdmin = true;
        res.redirect('/admin-dashboard');
    } else {
        res.render('adminLogin', { error: 'Invalid username or password.' });
    }
});

// Admin dashboard (renders adminDashboard.ejs)
app.get('/admin-dashboard', requireAdmin, async (req, res) => {
    try {
        const schoolsSnapshot = await db.collection('schools').get();
        const schools = schoolsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const trainersSnapshot = await db.collection('trainers').get();
        const trainers = trainersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const participantsSnapshot = await db.collection('participants').get();
        const participants = participantsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        res.render('adminDashboard', { schools, trainers, participants, error: null });
    } catch (error) {
        console.error('Error in admin-dashboard route:', error.message, error.stack);
        res.render('adminDashboard', { schools: [], trainers: [], participants: [], error: 'Error fetching data.' });
    }
});

// Approve school (redirects to admin-dashboard)
app.post('/approve-school/:id', requireAdmin, async (req, res) => {
    try {
        const schoolId = req.params.id;
        const schoolRef = db.collection('schools').doc(schoolId);
        const schoolDoc = await schoolRef.get();
        if (!schoolDoc.exists) {
            return res.redirect('/admin-dashboard');
        }

        const schoolData = schoolDoc.data();
        await schoolRef.update({ isApproved: true });

        // Send approval email
        await sendEmail(
            schoolData.schoolEmail,
            emailTemplates.schoolApproval.subject,
            emailTemplates.schoolApproval.text(schoolData.schoolName),
            emailTemplates.schoolApproval.html(schoolData.schoolName)
        );

        res.redirect('/admin-dashboard');
    } catch (error) {
        console.error('Error in approve-school route:', error.message, error.stack);
        res.redirect('/admin-dashboard');
    }
});

// Approve trainer (redirects to admin-dashboard)
app.post('/approve-trainer/:id', requireAdmin, async (req, res) => {
    try {
        const trainerId = req.params.id;
        const trainerRef = db.collection('trainers').doc(trainerId);
        const trainerDoc = await trainerRef.get();
        if (!trainerDoc.exists) {
            return res.redirect('/admin-dashboard');
        }

        const trainerData = trainerDoc.data();
        await trainerRef.update({ isApproved: true });

        // Send approval email
        await sendEmail(
            trainerData.email,
            emailTemplates.trainerApproval.subject,
            emailTemplates.trainerApproval.text(trainerData.trainerName),
            emailTemplates.trainerApproval.html(trainerData.trainerName)
        );

        res.redirect('/admin-dashboard');
    } catch (error) {
        console.error('Error in approve-trainer route:', error.message, error.stack);
        res.redirect('/admin-dashboard');
    }
});

// Assign event date to school (redirects to admin-dashboard)
app.post('/assign-event-date-school/:id', requireAdmin, async (req, res) => {
    try {
        const schoolId = req.params.id;
        const { eventDate } = req.body;

        if (!eventDate || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
            return res.redirect('/admin-dashboard');
        }

        const eventDateObj = new Date(eventDate);
        if (isNaN(eventDateObj.getTime())) {
            return res.redirect('/admin-dashboard');
        }

        await db.collection('schools').doc(schoolId).update({
            eventDate: admin.firestore.Timestamp.fromDate(eventDateObj)
        });

        res.redirect('/admin-dashboard');
    } catch (error) {
        console.error('Error in assign-event-date-school route:', error.message, error.stack);
        res.redirect('/admin-dashboard');
    }
});

// Logout (redirects to /)
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Error during logout:', err.message, err.stack);
        }
        res.redirect('/');
    });
});

// Schedule daily email reminders at 10:30 PM IST
const schedule = require('node-schedule');
const IST_OFFSET = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30
const job = schedule.scheduleJob('30 22 * * *', () => {
    const now = new Date();
    const istTime = new Date(now.getTime() + IST_OFFSET);
    console.log(`Running email reminder job at ${istTime.toISOString()} IST`);
    checkAndSendWorkshopEmails();
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});