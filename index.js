const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
require('dotenv').config();

const app = express();

// Disable view cache for development
app.set('view cache', false);

const trialTests = {
    trial1: [
        {
            question: "What is 1 + 1?",
            options: ["1", "2", "3", "4"],
            correctAnswer: "2"
        },
        {
            question: "Which color is the sky on a clear day?",
            options: ["Red", "Blue", "Green", "Yellow"],
            correctAnswer: "Blue"
        }
    ],
    trial2: [
        {
            question: "What is 3 - 1?",
            options: ["1", "2", "3", "4"],
            correctAnswer: "2"
        },
        {
            question: "Which animal is known as man's best friend?",
            options: ["Cat", "Dog", "Bird", "Fish"],
            correctAnswer: "Dog"
        }
    ]
};

const requiredEnvVars = [
    'FIREBASE_PROJECT_ID',
    'FIREBASE_PRIVATE_KEY_ID',
    'FIREBASE_PRIVATE_KEY',
    'FIREBASE_CLIENT_EMAIL',
    'FIREBASE_CLIENT_ID',
    'FIREBASE_CLIENT_X509_CERT_URL'
];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingEnvVars.length > 0) {
    console.error(`Missing environment variables: ${missingEnvVars.join(', ')}`);
    process.exit(1);
}

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

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '.')));

async function getRandomQuestions(limit = 30) {
    try {
        const snapshot = await db.collection('mcqs').get();
        let allQuestions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log(`Total questions fetched from mcqs collection: ${allQuestions.length}`, allQuestions);

        // Validate questions
        allQuestions = allQuestions.filter(mcq => {
            const isValid =
                typeof mcq.question === 'string' &&
                Array.isArray(mcq.options) &&
                mcq.options.length >= 4 &&
                mcq.options.every(opt => typeof opt === 'string' && opt.trim()) &&
                typeof mcq.correctAnswer === 'string' &&
                mcq.correctAnswer.trim() &&
                mcq.options.includes(mcq.correctAnswer);
            if (!isValid) {
                console.warn(`Invalid MCQ filtered out: ${JSON.stringify(mcq)}`);
            }
            return isValid;
        });

        console.log(`Valid questions after filtering: ${allQuestions.length}`, allQuestions);

        // Fallback questions
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

        // If fewer than 30 valid questions, supplement with fallback questions
        if (allQuestions.length < limit) {
            console.warn(`Only ${allQuestions.length} valid questions available in Firestore. Supplementing with fallback questions.`);
            const remainingCount = limit - allQuestions.length;
            const shuffledFallbacks = [...fallbackQuestions].sort(() => Math.random() - 0.5);
            allQuestions = [...allQuestions, ...shuffledFallbacks.slice(0, remainingCount)];

            // If still not enough, duplicate fallback questions to reach exactly 30
            while (allQuestions.length < limit) {
                const additionalCount = limit - allQuestions.length;
                allQuestions = [...allQuestions, ...shuffledFallbacks.slice(0, additionalCount)];
            }
        }

        // Shuffle all questions
        for (let i = allQuestions.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [allQuestions[i], allQuestions[j]] = [allQuestions[j], allQuestions[i]];
        }

        // Ensure exactly 30 questions
        allQuestions = allQuestions.slice(0, limit);
        console.log(`Final number of questions returned: ${allQuestions.length}`);

        return allQuestions;
    } catch (error) {
        console.error('Error fetching questions from Firestore:', error.message, error.stack);
        throw error;
    }
}

async function getUserByParentMobile(parentMobile1) {
    const snapshot = await db.collection('participants')
        .where('parentMobile1', '==', parentMobile1)
        .get();
    if (snapshot.empty) {
        throw new Error(`No user found with parentMobile1: ${parentMobile1}`);
    }
    const user = snapshot.docs[0].data();
    const userId = snapshot.docs[0].id;
    return { user, userId };
}

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/login', (req, res) => {
    res.render('login', { error: null });
});

app.post('/student-login', async (req, res) => {
    const { username, password } = req.body;
    try {
        console.log(`Student login attempt for username: ${username}`);
        const { user, userId } = await getUserByParentMobile(username);
        const [year, month, day] = user.birthdate.split('-');
        const expectedPassword = `${day}${month}${year}`;
        if (password !== expectedPassword) {
            console.log(`Invalid password for username: ${username}`);
            return res.render('login', { error: 'Invalid username or password' });
        }

        let mcqs;
        // Use a transaction to ensure consistent read/write of currentMcqs
        await db.runTransaction(async (transaction) => {
            const userRef = db.collection('participants').doc(userId);
            const userDoc = await transaction.get(userRef);
            const userData = userDoc.data();
            mcqs = userData.currentMcqs || [];
            if (!userData.hasCompletedMCQ && mcqs.length === 0) {
                mcqs = await getRandomQuestions(30);
                transaction.update(userRef, { currentMcqs: mcqs });
            }
        });

        res.render('dashboard', {
            studentName: user.studentName,
            parentMobile1: username,
            hasCompletedMCQ: user.hasCompletedMCQ || false,
            hasCompletedTrial1: user.hasCompletedTrial1 || false,
            hasCompletedTrial2: user.hasCompletedTrial2 || false,
            trial1Score: user.trial1Score || 0,
            trial1TotalQuestions: user.trial1TotalQuestions || trialTests.trial1.length,
            trial1Percentage: user.trial1Percentage || 0,
            trial1CorrectAnswers: user.trial1CorrectAnswers || 0,
            trial1WrongAnswers: user.trial1WrongAnswers || 0,
            trial2Score: user.trial2Score || 0,
            trial2TotalQuestions: user.trial2TotalQuestions || trialTests.trial2.length,
            trial2Percentage: user.trial2Percentage || 0,
            trial2CorrectAnswers: user.trial2CorrectAnswers || 0,
            trial2WrongAnswers: user.trial2WrongAnswers || 0,
            score: user.score || 0,
            totalQuestions: user.totalQuestions || 30,
            percentage: user.percentage || 0,
            correctAnswers: user.correctAnswers || 0,
            wrongAnswers: user.wrongAnswers || 0,
            mcqs,
            trial1: trialTests.trial1,
            trial2: trialTests.trial2,
            showResults: user.hasCompletedMCQ || false
        });
    } catch (error) {
        console.error('Error during student login:', error.message, error.stack);
        res.render('login', { error: 'Login failed. Please try again later.' });
    }
});

app.get('/mcq-test/:parentMobile1', async (req, res) => {
    try {
        const parentMobile1 = req.params.parentMobile1;
        const { user, userId } = await getUserByParentMobile(parentMobile1);
        if (user.hasCompletedMCQ) {
            return res.status(400).send('You have already completed the MCQ test.');
        }
        if (!user.hasCompletedTrial1 || !user.hasCompletedTrial2) {
            return res.status(400).send('Please complete both trial tests before starting the main exam.');
        }

        let mcqs;
        // Use a transaction to ensure consistent read/write of currentMcqs
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

        // Validate mcqs before rendering
        mcqs = mcqs.filter(mcq => {
            const isValid =
                typeof mcq.question === 'string' &&
                Array.isArray(mcq.options) &&
                mcq.options.length >= 4 &&
                mcq.options.every(opt => typeof opt === 'string' && opt.trim()) &&
                typeof mcq.correctAnswer === 'string' &&
                mcq.correctAnswer.trim() &&
                mcq.options.includes(mcq.correctAnswer);
            if (!isValid) {
                console.warn(`Invalid MCQ in currentMcqs filtered out: ${JSON.stringify(mcq)}`);
            }
            return isValid;
        });
        if (mcqs.length === 0) {
            console.error('No valid questions available after filtering.');
            return res.status(400).send('No valid questions available for this test session.');
        }
        res.render('mcq', { parentMobile1, mcqs });
    } catch (error) {
        console.error('Error rendering MCQ test:', error.message, error.stack);
        res.status(error.message.includes('No user found') ? 404 : 500).send(
            error.message.includes('No user found') ? 'User not found.' : 'Error loading MCQ test.'
        );
    }
});

app.post('/submit-trial1', async (req, res) => {
    const { parentMobile1, ...answers } = req.body;
    try {
        const { user, userId } = await getUserByParentMobile(parentMobile1);
        let score = 0;
        let correctAnswers = 0;
        let wrongAnswers = 0;
        const trial1 = trialTests.trial1;
        trial1.forEach((mcq, index) => {
            const userAnswer = answers[`q${index}`]?.trim().toLowerCase();
            const correctAnswer = mcq.correctAnswer?.trim().toLowerCase();
            const isCorrect = userAnswer === correctAnswer;
            console.log(`Trial 1 Q${index}: User Answer="${userAnswer}", Correct Answer="${correctAnswer}", Is Correct=${isCorrect}`);
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
        res.render('dashboard', {
            studentName: updatedUser.studentName,
            parentMobile1,
            hasCompletedMCQ: updatedUser.hasCompletedMCQ || false,
            hasCompletedTrial1: true,
            hasCompletedTrial2: updatedUser.hasCompletedTrial2 || false,
            trial1Score: score,
            trial1TotalQuestions: totalQuestions,
            trial1Percentage: percentage,
            trial1CorrectAnswers: correctAnswers,
            trial1WrongAnswers: wrongAnswers,
            trial2Score: updatedUser.trial2Score || 0,
            trial2TotalQuestions: updatedUser.trial2TotalQuestions || trialTests.trial2.length,
            trial2Percentage: updatedUser.trial2Percentage || 0,
            trial2CorrectAnswers: updatedUser.trial2CorrectAnswers || 0,
            trial2WrongAnswers: updatedUser.trial2WrongAnswers || 0,
            score: updatedUser.score || 0,
            totalQuestions: updatedUser.totalQuestions || 30,
            percentage: updatedUser.percentage || 0,
            correctAnswers: updatedUser.correctAnswers || 0,
            wrongAnswers: updatedUser.wrongAnswers || 0,
            mcqs,
            trial1: trialTests.trial1,
            trial2: trialTests.trial2,
            showResults: updatedUser.hasCompletedMCQ || false
        });
    } catch (error) {
        console.error('Error processing Trial 1:', error.message, error.stack);
        res.status(500).send('Error processing trial test.');
    }
});

app.post('/submit-trial2', async (req, res) => {
    const { parentMobile1, ...answers } = req.body;
    try {
        const { user, userId } = await getUserByParentMobile(parentMobile1);
        let score = 0;
        let correctAnswers = 0;
        let wrongAnswers = 0;
        const trial2 = trialTests.trial2;
        trial2.forEach((mcq, index) => {
            const userAnswer = answers[`q${index}`]?.trim().toLowerCase();
            const correctAnswer = mcq.correctAnswer?.trim().toLowerCase();
            const isCorrect = userAnswer === correctAnswer;
            console.log(`Trial 2 Q${index}: User Answer="${userAnswer}", Correct Answer="${correctAnswer}", Is Correct=${isCorrect}`);
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
        res.render('dashboard', {
            studentName: updatedUser.studentName,
            parentMobile1,
            hasCompletedMCQ: updatedUser.hasCompletedMCQ || false,
            hasCompletedTrial1: updatedUser.hasCompletedTrial1 || false,
            hasCompletedTrial2: true,
            trial1Score: updatedUser.trial1Score || 0,
            trial1TotalQuestions: updatedUser.trial1TotalQuestions || trialTests.trial1.length,
            trial1Percentage: updatedUser.trial1Percentage || 0,
            trial1CorrectAnswers: updatedUser.trial1CorrectAnswers || 0,
            trial1WrongAnswers: updatedUser.trial1WrongAnswers || 0,
            trial2Score: score,
            trial2TotalQuestions: totalQuestions,
            trial2Percentage: percentage,
            trial2CorrectAnswers: correctAnswers,
            trial2WrongAnswers: wrongAnswers,
            score: updatedUser.score || 0,
            totalQuestions: updatedUser.totalQuestions || 30,
            percentage: updatedUser.percentage || 0,
            correctAnswers: updatedUser.correctAnswers || 0,
            wrongAnswers: updatedUser.wrongAnswers || 0,
            mcqs,
            trial1: trialTests.trial1,
            trial2: trialTests.trial2,
            showResults: updatedUser.hasCompletedMCQ || false
        });
    } catch (error) {
        console.error('Error processing Trial 2:', error.message, error.stack);
        res.status(500).send('Error processing trial test.');
    }
});

app.post('/submit-mcq', async (req, res) => {
    const { parentMobile1, ...answers } = req.body;
    try {
        const { user, userId } = await getUserByParentMobile(parentMobile1);
        let mcqs = user.currentMcqs || [];
        if (mcqs.length === 0) {
            return res.status(400).send('No questions found for this test session.');
        }
        // Validate mcqs before scoring
        mcqs = mcqs.filter(mcq => {
            const isValid =
                typeof mcq.question === 'string' &&
                Array.isArray(mcq.options) &&
                mcq.options.length >= 4 &&
                mcq.options.every(opt => typeof opt === 'string' && opt.trim()) &&
                typeof mcq.correctAnswer === 'string' &&
                mcq.correctAnswer.trim() &&
                mcq.options.includes(mcq.correctAnswer);
            if (!isValid) {
                console.warn(`Invalid MCQ in submit-mcq filtered out: ${JSON.stringify(mcq)}`);
            }
            return isValid;
        });
        if (mcqs.length === 0) {
            console.error('No valid questions available for scoring.');
            return res.status(400).send('No valid questions available for scoring.');
        }
        let score = 0;
        let correctAnswers = 0;
        let wrongAnswers = 0;
        let detailedResults = [];
        mcqs.forEach((mcq, index) => {
            const userAnswer = answers[`q${index}`]?.trim().toLowerCase();
            const correctAnswer = mcq.correctAnswer?.trim().toLowerCase();
            const isCorrect = userAnswer === correctAnswer;
            console.log(`MCQ Q${index}: User Answer="${userAnswer}", Correct Answer="${correctAnswer}", Is Correct=${isCorrect}`);
            if (isCorrect) {
                score++;
                correctAnswers++;
            } else {
                wrongAnswers++;
            }
            detailedResults.push({
                questionIndex: index,
                question: mcq.question,
                userAnswer: userAnswer || 'Not Answered',
                correctAnswer: mcq.correctAnswer,
                isCorrect: isCorrect
            });
        });
        const totalQuestions = mcqs.length;
        const percentage = Math.round((score / totalQuestions) * 100);
        const newMcqs = await getRandomQuestions(30);
        const updateData = {
            hasCompletedMCQ: true,
            score,
            totalQuestions,
            correctAnswers,
            wrongAnswers,
            percentage,
            completedAt: admin.firestore.FieldValue.serverTimestamp(),
            detailedResults,
            currentMcqs: newMcqs
        };
        await db.collection('participants').doc(userId).update(updateData);
        const updatedUser = (await db.collection('participants').doc(userId).get()).data();
        res.render('dashboard', {
            studentName: updatedUser.studentName,
            parentMobile1,
            hasCompletedMCQ: true,
            hasCompletedTrial1: updatedUser.hasCompletedTrial1 || false,
            hasCompletedTrial2: updatedUser.hasCompletedTrial2 || false,
            trial1Score: updatedUser.trial1Score || 0,
            trial1TotalQuestions: updatedUser.trial1TotalQuestions || trialTests.trial1.length,
            trial1Percentage: updatedUser.trial1Percentage || 0,
            trial1CorrectAnswers: updatedUser.trial1CorrectAnswers || 0,
            trial1WrongAnswers: updatedUser.trial1WrongAnswers || 0,
            trial2Score: updatedUser.trial2Score || 0,
            trial2TotalQuestions: updatedUser.trial2TotalQuestions || trialTests.trial2.length,
            trial2Percentage: updatedUser.trial2Percentage || 0,
            trial2CorrectAnswers: updatedUser.trial2CorrectAnswers || 0,
            trial2WrongAnswers: updatedUser.trial2WrongAnswers || 0,
            score,
            totalQuestions,
            percentage,
            correctAnswers,
            wrongAnswers,
            mcqs: newMcqs,
            trial1: trialTests.trial1,
            trial2: trialTests.trial2,
            showResults: true
        });
    } catch (error) {
        console.error('Error processing MCQ submission:', error.message, error.stack);
        res.status(500).render('error', {
            message: 'Error processing your exam submission. Please contact administrator.',
            error: error.message
        });
    }
});

app.get('/school-dashboard', async (req, res) => {
    let schoolName = 'Unknown'; // Default value in case of error
    let students = [];
    let error = null;

    try {
        // Fetch the school email from the query (passed after login)
        const schoolEmail = req.query.username;
        if (!schoolEmail) {
            error = 'Please login first';
            return res.render('schoolDashboard', { schoolName, students, error });
        }

        // Fetch the school to get the school name
        const schoolSnapshot = await db.collection('schools')
            .where('schoolEmail', '==', schoolEmail)
            .get();
        if (schoolSnapshot.empty) {
            error = 'School not found';
            return res.render('schoolDashboard', { schoolName, students, error });
        }
        schoolName = schoolSnapshot.docs[0].data().schoolName;

        // Fetch all students from the participants collection for this school
        const studentsSnapshot = await db.collection('participants')
            .where('schoolNameDropdown', '==', schoolName)
            .get();
        
        students = studentsSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                studentName: data.studentName || 'N/A',
                studentClass: data.studentClass || 'N/A',
                hasCompletedMCQ: data.hasCompletedMCQ || false,
                score: data.score || 0,
                totalQuestions: data.totalQuestions || 30,
                percentage: data.percentage || 0,
                trial1Score: data.trial1Score || 0,
                trial1Percentage: data.trial1Percentage || 0,
                trial2Score: data.trial2Score || 0,
                trial2Percentage: data.trial2Percentage || 0,
                completedAt: data.completedAt ? data.completedAt.toDate().toLocaleString() : 'Not Completed'
            };
        });

        res.render('schoolDashboard', { schoolName, students, error });
    } catch (err) {
        console.error('Error loading school dashboard:', err.message, err.stack);
        error = 'Error loading student data.';
        res.render('schoolDashboard', { schoolName, students, error });
    }
});

app.post('/school-login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const snapshot = await db.collection('schools')
            .where('schoolEmail', '==', username)
            .get();
        if (snapshot.empty) {
            return res.render('login', { error: 'Invalid username or password' });
        }
        const school = snapshot.docs[0].data();
        if (password !== school.principalNumber) {
            return res.render('login', { error: 'Invalid username or password' });
        }
        // Redirect to school dashboard with username (schoolEmail) as query param
        res.redirect(`/school-dashboard?username=${encodeURIComponent(username)}`);
    } catch (error) {
        console.error('Error during school login:', error.message, error.stack);
        res.render('login', { error: 'Login failed. Try again later.' });
    }
});

app.get('/participation', async (req, res) => {
    try {
        const type = req.query.type || 'Student';
        const snapshot = await db.collection('schools').get();
        const schoolNames = snapshot.docs.map(doc => doc.data().schoolName);
        res.render('participation', { type, schoolNames });
    } catch (error) {
        console.error('Error fetching school names:', error.message, error.stack);
        res.status(500).send('Error loading participation form.');
    }
});

app.post('/participate', async (req, res) => {
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
    if (!participant.studentName || !participant.birthdate || !participant.studentClass ||
        !participant.parentMobile1 || !participant.parentEmail || !participant.address ||
        !participant.city || !participant.pincode || !participant.type || !participant.schoolNameDropdown) {
        return res.status(400).send('All required fields must be filled.');
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
    try {
        await db.collection('participants').add(participant);
        const [year, month, day] = participant.birthdate.split('-');
        const password = `${day}${month}${year}`;
        res.render('studentConfirmation', {
            studentName: participant.studentName,
            username: participant.parentMobile1,
            password
        });
    } catch (error) {
        console.error('Error saving participant:', error.message, error.stack);
        res.status(500).send('Error saving participant data.');
    }
});

app.get('/school-participation', async (req, res) => {
    try {
        const snapshot = await db.collection('schools').get();
        const schools = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.render('schoolParticipation', { schools });
    } catch (error) {
        console.error('Error fetching schools:', error.message, error.stack);
        res.status(500).send('Error fetching school data.');
    }
});

app.post('/school-participate', async (req, res) => {
    const school = {
        schoolName: req.body.schoolName,
        city: req.body.city,
        district: req.body.district,
        pincode: req.body.pincode,
        schoolPhoneNumber: req.body.schoolPhoneNumber,
        schoolEmail: req.body.schoolEmail,
        principalNumber: req.body.principalNumber,
        principalEmail: req.body.principalEmail,
        civicsTeacherNumber: req.body.civicsTeacherNumber,
        civicsTeacherEmail: req.body.civicsTeacherEmail
    };
    if (!school.schoolName || !school.city || !school.district || !school.pincode ||
        !school.schoolPhoneNumber || !school.schoolEmail || !school.principalNumber ||
        !school.principalEmail || !school.civicsTeacherNumber || !school.civicsTeacherEmail) {
        return res.status(400).send('All required fields must be filled.');
    }
    if (!/^\d{6}$/.test(school.pincode)) {
        return res.status(400).send('Pincode must be a 6-digit number.');
    }
    if (!/^\d{10}$/.test(school.schoolPhoneNumber) || !/^\d{10}$/.test(school.principalNumber) ||
        !/^\d{10}$/.test(school.civicsTeacherNumber)) {
        return res.status(400).send('Phone numbers must be 10 digits.');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(school.schoolEmail) ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(school.principalEmail) ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(school.civicsTeacherEmail)) {
        return res.status(400).send('Invalid email format.');
    }
    try {
        await db.collection('schools').add(school);
        res.render('confirmation');
    } catch (error) {
        console.error('Error saving school:', error.message, error.stack);
        res.status(500).send('Error saving school data.');
    }
});

app.get('/school-students', async (req, res) => {
    const schoolName = req.query.schoolName;
    if (!schoolName) {
        return res.status(400).send('School name is required.');
    }
    try {
        const snapshot = await db.collection('participants')
            .where('schoolName', '==', schoolName)
            .get();
        const students = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.render('schoolStudents', { schoolName, students });
    } catch (error) {
        console.error('Error fetching students:', error.message, error.stack);
        res.status(500).send('Error fetching student data.');
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});