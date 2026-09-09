import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// If already logged in (persisted session), skip straight to chat.
onAuthStateChanged(auth, (user) => {
  if (user) window.location.href = "chat.html";
});

function isValidEmail(email) {
  return /\S+@\S+\.\S+/.test(email);
}

function showError(id, message) {
  const el = document.getElementById(id);
  el.textContent = message;
  el.classList.add("show");
}
function clearError(id) {
  document.getElementById(id).classList.remove("show");
}
function friendlyError(error) {
  const map = {
    "auth/email-already-in-use": "That email already has an account. Try logging in instead.",
    "auth/invalid-email": "That email address doesn't look right.",
    "auth/weak-password": "Password needs to be at least 6 characters.",
    "auth/invalid-credential": "Email or password is incorrect.",
    "auth/wrong-password": "Email or password is incorrect.",
    "auth/user-not-found": "No account found with that email.",
    "auth/too-many-requests": "Too many attempts. Wait a moment and try again."
  };
  return map[error.code] || error.message;
}
function setLoading(btn, loading, label) {
  btn.disabled = loading;
  btn.textContent = loading ? "Please wait..." : label;
}

window.register = function () {
  clearError("registerError");
  const email = document.getElementById("register-email").value.trim().slice(0, 254);
  const password = document.getElementById("register-password").value;

  if (!isValidEmail(email)) return showError("registerError", "That email address doesn't look right.");
  if (password.length < 6) return showError("registerError", "Password needs to be at least 6 characters.");

  const btn = document.getElementById("registerBtn");
  setLoading(btn, true, "Create account");
  setPersistence(auth, browserLocalPersistence)
    .then(() => createUserWithEmailAndPassword(auth, email, password))
    .then(() => {
      window.location.href = "chat.html";
    })
    .catch((error) => {
      setLoading(btn, false, "Create account");
      showError("registerError", friendlyError(error));
    });
};

window.login = function () {
  clearError("loginError");
  const email = document.getElementById("login-email").value.trim().slice(0, 254);
  const password = document.getElementById("login-password").value;
  const remember = document.getElementById("remember-me").checked;
  const btn = document.getElementById("loginBtn");

  if (!isValidEmail(email)) return showError("loginError", "That email address doesn't look right.");
  if (password.length < 6) return showError("loginError", "Password needs to be at least 6 characters.");

  setLoading(btn, true, "Log in");
  setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence)
    .then(() => signInWithEmailAndPassword(auth, email, password))
    .then(() => {
      window.location.href = "chat.html";
    })
    .catch((error) => {
      setLoading(btn, false, "Log in");
      showError("loginError", friendlyError(error));
    });
};

document.getElementById("loginForm").addEventListener("submit", (e) => {
  e.preventDefault();
  window.login();
});
document.getElementById("registerForm").addEventListener("submit", (e) => {
  e.preventDefault();
  window.register();
});
