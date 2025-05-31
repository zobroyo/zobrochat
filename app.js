import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCvmzzIhl0lsDLKqtMB8GUGz8HZOMZwrFU",
  authDomain: "zobrochat.firebaseapp.com",
  projectId: "zobrochat",
  storageBucket: "zobrochat.firebasestorage.app",
  messagingSenderId: "308792787278",
  appId: "1:308792787278:web:e380ae3064d26f6a995e1f"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

function isValidEmail(email) {
  return /\S+@\S+\.\S+/.test(email);
}

window.register = function () {
  const email = document.getElementById("register-email").value.trim();
  const password = document.getElementById("register-password").value;

  if (!isValidEmail(email)) {
    alert("❌ that email looks sus");
    return;
  }
  if (password.length < 6) {
    alert("❌ password needs 6+ chars");
    return;
  }

  createUserWithEmailAndPassword(auth, email, password)
    .then((cred) => {
      alert("✅ Registered: " + cred.user.email);
      window.location.href = "chat.html";
    })
    .catch((error) => {
      alert("❌ " + error.message);
    });
};

window.login = function () {
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;

  if (!isValidEmail(email)) {
    alert("❌ that email looks sus");
    return;
  }
  if (password.length < 6) {
    alert("❌ password needs 6+ chars");
    return;
  }

  signInWithEmailAndPassword(auth, email, password)
    .then((cred) => {
      alert("✅ Logged in as: " + cred.user.email);
      window.location.href = "chat.html";
    })
    .catch((error) => {
      alert("❌ " + error.message);
    });
};
