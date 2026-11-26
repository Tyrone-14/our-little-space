import { initializeApp } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js";

import {
    getAuth,
    setPersistence,
    browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";

import { getFirestore } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";
const firebaseConfig = {
    apiKey: "AIzaSyAMpEuH1_beC6MaZObclDFDWdE7vBmwMjg",
    authDomain: "our-little-space-f2537.firebaseapp.com",
    projectId: "our-little-space-f2537",
    storageBucket: "our-little-space-f2537.firebasestorage.app",
    messagingSenderId: "952203210625",
    appId: "1:952203210625:web:dab19a17ad8921408ec280"
};

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);

const authReady = setPersistence(auth, browserLocalPersistence)
    .then(() => {
        console.log("Login persistence enabled!");
    })
    .catch((error) => {
        console.error("Login persistence error:", error);
        throw error;
    });
const db = getFirestore(app);

export { app, auth, db, authReady };

console.log("Our Little Space connected to Firebase!");