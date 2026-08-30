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

const firebaseConfig = {
    apiKey: "AIzaSyDhNjYpiyD3ju1re94bJJfvnukr26cIAHI",
    authDomain: "fir-buchung.firebaseapp.com",
    projectId: "fir-buchung",
    storageBucket: "fir-buchung.firebasestorage.app",
    messagingSenderId: "108430291131",
    appId: "1:108430291131:web:06ca649df4056d9200b99e",
    measurementId: "G-1CRK55P0VY"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

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

let currentUser = null;
let currentRole = 'customer';
let unsubSnapshot = null;

function showView(viewId) {
    document.querySelectorAll('.view-section').forEach(sec => {
        sec.classList.add('hidden');
        sec.classList.remove('active');
    });
    const target = document.getElementById(viewId);
    if (target) {
        target.classList.remove('hidden');
        target.classList.add('active');
    }
}

function setRole(role) {
    currentRole = role;
    const tabCust = document.getElementById('tab-customer');
    const tabEmp = document.getElementById('tab-employee');
    if (tabCust) tabCust.classList.toggle('active', role === 'customer');
    if (tabEmp) tabEmp.classList.toggle('active', role === 'employee');
}

document.addEventListener('click', async (e) => {
    const id = e.target.id;

    if (id === 'nav-home') {
        e.preventDefault();
        showView('home');
    }
    if (id === 'hero-book-btn' || id === 'nav-auth') {
        e.preventDefault();
        showView('auth');
    }
    if (id === 'nav-dash-link') {
        e.preventDefault();
        routeDashboard();
    }
    if (id === 'nav-logout-btn') {
        e.preventDefault();
        signOut(auth);
    }
    if (id === 'nav-maps') {
        e.preventDefault();
        window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(config.mapQuery)}`, '_blank');
    }
    if (id === 'tab-customer') {
        setRole('customer');
    }
    if (id === 'tab-employee') {
        setRole('employee');
    }
    if (id === 'btn-register') {
        e.preventDefault();
        handleRegister();
    }
    if (id === 'btn-check-slots') {
        e.preventDefault();
        checkAvailability();
    }
});

document.addEventListener('submit', (e) => {
    if (e.target.id === 'authForm') {
        e.preventDefault();
        handleLogin();
    }
});

async function handleRegister() {
    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPassword').value;
    if (!email || !password) return alert("Bitte E-Mail und Passwort eingeben!");
    
    try {
        await createUserWithEmailAndPassword(auth, email, password);
        alert("Account erfolgreich erstellt!");
    } catch (error) {
        alert("Fehler: " + error.message);
    }
}

async function handleLogin() {
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

async function checkAvailability() {
    const date = document.getElementById('bookDate').value;
    const serviceId = document.getElementById('serviceSelect').value;
    const empId = document.getElementById('employeeSelect').value;
    
    if (!date) return alert("Bitte wähle ein Datum aus!");

    const service = config.services.find(s => s.id === serviceId) || config.services[0];
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

        if (!foundSlots) slotsContainer.innerHTML = '<p>An diesem Tag sind keine Zeiten frei.</p>';
    }, { once: true });
}

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
        alert("Termin erfolgreich gebucht!");
        document.getElementById('timeSlots').classList.add('hidden');
    } catch (e) {
        alert("Fehler beim Buchen: " + e.message);
    }
}

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

            let card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = `
                <div>
                    <strong>${app.date} | ${app.timeString} Uhr</strong> - ${app.serviceName}<br>
                    Bei: ${empName} | Status: <b>${app.status}</b>
                </div>
            `;

            if (app.status !== 'storniert') {
                let btn = document.createElement('button');
                btn.className = 'btn-danger';
                btn.innerText = 'Stornieren';
                btn.onclick = () => updateStatus(appId, 'storniert');
                card.appendChild(btn);
            }

            container.appendChild(card);
        });
    });
}

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
            `;

            if (app.status === 'Ausstehend') {
                let btnAcc = document.createElement('button');
                btnAcc.className = 'btn-success';
                btnAcc.innerText = 'Akzeptieren';
                btnAcc.onclick = () => updateStatus(appId, 'Bestätigt');
                card.appendChild(btnAcc);
            }

            container.appendChild(card);
        });
    });
}

async function updateStatus(appId, newStatus) {
    try {
        await updateDoc(doc(db, "appointments", appId), { status: newStatus });
    } catch (e) {
        alert("Fehler: " + e.message);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const select = document.getElementById('serviceSelect');
    if (select) {
        select.innerHTML = '';
        config.services.forEach(s => {
            select.innerHTML += `<option value="${s.id}">${s.name} (${s.duration} Min)</option>`;
        });
    }

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
            if (unsubSnapshot) unsubSnapshot();
            showView('home');
        }
    });
});
