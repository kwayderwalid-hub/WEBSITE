// --- FIREBASE IMPORTS (CDN ES-Module) ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    getFirestore, 
    collection, 
    addDoc, 
    onSnapshot, 
    doc, 
    updateDoc, 
    query, 
    where 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// --- DEINE FIREBASE KONFIGURATION (Aus deinem Screenshot) ---
const firebaseConfig = {
    apiKey: "AIzaSyDhNjYpiyD3ju1re94bJJfvnukr26cIAHI",
    authDomain: "fir-buchung.firebaseapp.com",
    projectId: "fir-buchung",
    storageBucket: "fir-buchung.firebasestorage.app",
    messagingSenderId: "108430291131",
    appId: "1:108430291131:web:06ca649df4056d9200b99e",
    measurementId: "G-1CRK55P0VY"
};

// Firebase initialisieren
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- FIRMEN CONFIG (White-Label Vorlage) ---
const config = {
    companyName: "Hair & Style Lounge",
    mapQuery: "Friseur Bremerhaven",
    services: [
        { id: 's1', name: 'Spitzen schneiden', duration: 15 },
        { id: 's2', name: 'Waschen & Schneiden', duration: 30 },
        { id: 's3', name: 'Färben & Komplett-Styling', duration: 90 }
    ],
    employees: [
        { id: 'emp1', name: 'Alex' },
        { id: 'emp2', name: 'Sam' }
    ],
    workStartHour: 8,
    workEndHour: 16
};

// Globaler Status
let currentUser = null;
let currentRole = 'customer'; // 'customer' oder 'employee'
let unsubSnapshot = null; // Für das Echtzeit-Abo

// --- INITIALISIERUNG ---
document.addEventListener('DOMContentLoaded', () => {
    document.querySelector('.logo').innerText = `🚀 ${config.companyName}`;
    document.getElementById('hero-title').innerText = `Willkommen bei ${config.companyName}`;
    
    // Services befüllen
    const select = document.getElementById('serviceSelect');
    config.services.forEach(s => {
        select.innerHTML += `<option value="${s.id}">${s.name} (${s.duration} Min)</option>`;
    });

    // Event Listener für Navigation
    document.getElementById('nav-home').onclick = () => showView('home');
    document.getElementById('hero-book-btn').onclick = () => showView('auth');
    document.getElementById('nav-auth').onclick = () => showView('auth');
    document.getElementById('nav-dash-link').onclick = () => routeDashboard();
    document.getElementById('nav-logout-btn').onclick = () => signOut(auth);
    document.getElementById('nav-maps').onclick = () => {
        window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(config.mapQuery)}`, '_blank');
    };

    // Role Tabs
    document.getElementById('tab-customer').onclick = () => setRole('customer');
    document.getElementById('tab-employee').onclick = () => setRole('employee');
    
    // Buttons
    document.getElementById('btn-register').onclick = handleRegister;
    document.getElementById('authForm').onsubmit = handleLogin;
    document.getElementById('btn-check-slots').onclick = checkAvailability;

    // Firebase Auth Observer
    onAuthStateChanged(auth, (user) => {
        currentUser = user;
        if (user) {
            document.getElementById('nav-login').classList.add('hidden');
            document.getElementById('nav-dashboard').classList.remove('hidden');
            document.getElementById('nav-logout').classList.remove('hidden');
            routeDashboard();
        } else {
            document.getElementById('nav-login').classList.remove('hidden');
            document.getElementById('nav-dashboard').classList.add('hidden');
            document.getElementById('nav-logout').classList.add('hidden');
            if (unsubSnapshot) unsubSnapshot(); // Live-Verbindung trennen
            showView('home');
        }
    });
});

// --- VIEWS & LOGIC ---
function showView(viewId) {
    document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
}

function setRole(role) {
    currentRole = role;
    document.getElementById('tab-customer').classList.toggle('active', role === 'customer');
    document.getElementById('tab-employee').classList.toggle('active', role === 'employee');
}

// --- AUTHENTIFIZIERUNG MIT FIREBASE ---
async function handleRegister() {
    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPassword').value;
    try {
        await createUserWithEmailAndPassword(auth, email, password);
        alert("Account erfolgreich registriert!");
    } catch (error) {
        alert("Fehler bei Registrierung: " + error.message);
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPassword').value;
    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        alert("Login fehlgeschlagen: " + error.message);
    }
}

function routeDashboard() {
    if (currentRole === 'customer') {
        document.getElementById('cust-email-display').innerText = currentUser.email;
        showView('customer-dashboard');
        listenCustomerAppointments();
    } else {
        document.getElementById('emp-email-display').innerText = currentUser.email;
        showView('employee-dashboard');
        listenEmployeeAppointments();
    }
}

// --- ECHTZEIT-DATENBANK (FIRESTORE) ---

// 1. Freie Termine berechnen
async function checkAvailability() {
    const date = document.getElementById('bookDate').value;
    const serviceId = document.getElementById('serviceSelect').value;
    const empId = document.getElementById('employeeSelect').value;
    
    if (!date) return alert("Bitte wähle ein Datum aus!");

    const service = config.services.find(s => s.id === serviceId);

    const q = query(collection(db, "appointments"), where("date", "==", date));
    
    const slotsContainer = document.getElementById('timeSlots');
    slotsContainer.innerHTML = 'Prüfe Verfügbarkeit...';
    slotsContainer.classList.remove('hidden');

    onSnapshot(q, (snapshot) => {
        let dayApps = [];
        snapshot.forEach(doc => {
            let data = doc.data();
            if(data.status !== 'storniert') dayApps.push(data);
        });

        slotsContainer.innerHTML = '';
        const startMins = config.workStartHour * 60;
        const endMins = config.workEndHour * 60;
        let foundSlots = false;

        for (let time = startMins; time <= (endMins - service.duration); time += 15) {
            let isFree = false;
            let assignedEmp = null;
            const empsToCheck = empId === 'any' ? config.employees : [{id: empId}];

            for (let emp of empsToCheck) {
                let conflict = dayApps.some(app => {
                    return app.empId === emp.id && 
                           ((time >= app.startMins && time < app.endMins) || 
                           ((time + service.duration) > app.startMins && (time + service.duration) <= app.endMins));
                });

                if (!conflict) {
                    isFree = true;
                    assignedEmp = emp.id;
                    break;
                }
            }

            if (isFree) {
                foundSlots = true;
                let hour = Math.floor(time / 60).toString().padStart(2, '0');
                let min = (time % 60).toString().padStart(2, '0');
                let timeString = `${hour}:${min}`;

                let btn = document.createElement('button');
                btn.className = 'slot-btn';
                btn.innerText = timeString;
                btn.type = 'button';
                btn.onclick = () => bookSlot(date, timeString, time, time + service.duration, service, assignedEmp);
                slotsContainer.appendChild(btn);
            }
        }

        if (!foundSlots) slotsContainer.innerHTML = '<p>An diesem Tag sind leider keine Zeiten frei.</p>';
    }, { once: true });
}

// 2. Termin speichern
async function bookSlot(date, timeString, startMins, endMins, service, empId) {
    if (!confirm(`Termin für ${service.name} am ${date} um ${timeString} Uhr verbindlich buchen?`)) return;

    try {
        await addDoc(collection(db, "appointments"), {
            customerEmail: currentUser.email,
            customerId: currentUser.uid,
            empId: empId,
            serviceName: service.name,
            date: date,
            timeString: timeString,
            startMins: startMins,
            endMins: endMins,
            status: 'Ausstehend',
            createdAt: new Date().toISOString()
        });
        alert("Termin erfolgreich in der Cloud gespeichert!");
        document.getElementById('timeSlots').classList.add('hidden');
    } catch (e) {
        alert("Fehler beim Buchen: " + e.message);
    }
}

// 3. Live-Stream Kunden
function listenCustomerAppointments() {
    if (unsubSnapshot) unsubSnapshot();

    const q = query(collection(db, "appointments"), where("customerId", "==", currentUser.uid));
    const container = document.getElementById('customer-appointments');

    unsubSnapshot = onSnapshot(q, (snapshot) => {
        container.innerHTML = '';
        if (snapshot.empty) {
            container.innerHTML = '<p>Du hast noch keine Termine gebucht.</p>';
            return;
        }

        snapshot.forEach(docSnap => {
            let app = docSnap.data();
            let appId = docSnap.id;
            let empName = config.employees.find(e => e.id === app.empId)?.name || 'Mitarbeiter';

            let appDate = new Date(`${app.date}T${app.timeString}`);
            let hoursDiff = (appDate - new Date()) / (1000 * 60 * 60);
            let canCancel = hoursDiff > 48 && app.status !== 'storniert';

            let card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = `
                <div>
                    <strong>${app.date} | ${app.timeString} Uhr</strong> - ${app.serviceName}<br>
                    Bei: ${empName} | Status: <b style="color:${app.status === 'Bestätigt' ? 'green' : 'orange'}">${app.status}</b>
                </div>
            `;

            if (canCancel) {
                let btn = document.createElement('button');
                btn.className = 'btn-danger';
                btn.innerText = 'Stornieren';
                btn.onclick = () => updateStatus(appId, 'storniert');
                card.appendChild(btn);
            } else if(app.status !== 'storniert') {
                card.innerHTML += `<small style="color:gray;">Storno nicht mehr möglich (<48h)</small>`;
            }

            container.appendChild(card);
        });
    });
}

// 4. Live-Stream Mitarbeiter
function listenEmployeeAppointments() {
    if (unsubSnapshot) unsubSnapshot();

    const q = collection(db, "appointments");
    const container = document.getElementById('employee-appointments');

    unsubSnapshot = onSnapshot(q, (snapshot) => {
        container.innerHTML = '';
        if (snapshot.empty) {
            container.innerHTML = '<p>Keine Buchungen im System.</p>';
            return;
        }

        snapshot.forEach(docSnap => {
            let app = docSnap.data();
            let appId = docSnap.id;

            let card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = `
                <div>
                    <strong>${app.date} | ${app.timeString} Uhr</strong><br>
                    Kunde: ${app.customerEmail}<br>
                    Leistung: ${app.serviceName} | Status: <b>${app.status}</b>
                </div>
                <div id="actions-${appId}"></div>
            `;

            container.appendChild(card);
            let actionBox = document.getElementById(`actions-${appId}`);

            if (app.status === 'Ausstehend') {
                let btnAcc = document.createElement('button');
                btnAcc.className = 'btn-success';
                btnAcc.innerText = 'Akzeptieren';
                btnAcc.onclick = () => updateStatus(appId, 'Bestätigt');
                actionBox.appendChild(btnAcc);
            }

            if (app.status !== 'storniert') {
                let btnCancel = document.createElement('button');
                btnCancel.className = 'btn-danger';
                btnCancel.innerText = 'Absagen';
                btnCancel.onclick = () => updateStatus(appId, 'storniert');
                actionBox.appendChild(btnCancel);
            }
        });
    });
}

// Status-Update in Firestore
async function updateStatus(appId, newStatus) {
    try {
        const docRef = doc(db, "appointments", appId);
        await updateDoc(docRef, { status: newStatus });
    } catch (e) {
        alert("Fehler beim Aktualisieren: " + e.message);
    }
}