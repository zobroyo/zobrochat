import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getDatabase,
  ref,
  push,
  onChildAdded,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

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
const db = getDatabase(app);

const messagesRef = ref(db, 'messages');

const messagesDiv = document.getElementById('messages');
const msgForm = document.getElementById('msgForm');
const msgInput = document.getElementById('msgInput');
const logoutBtn = document.getElementById('logoutBtn');

let currentUserEmail = null;

onAuthStateChanged(auth, (user) => {
  if (!user) {
    // not logged in, redirect to login
    window.location.href = "index.html";
  } else {
    currentUserEmail = user.email;
  }
});

logoutBtn.addEventListener('click', () => {
  signOut(auth).then(() => {
    window.location.href = "index.html";
  });
});

function addMessageToDom(msgData, isSelf) {
  const div = document.createElement('div');
  div.classList.add('message');
  if (isSelf) div.classList.add('self');

  const meta = document.createElement('div');
  meta.classList.add('meta');
  meta.textContent = `${msgData.sender} • ${new Date(msgData.timestamp).toLocaleTimeString()}`;

  const text = document.createElement('div');
  text.textContent = msgData.text;

  div.appendChild(meta);
  div.appendChild(text);
  messagesDiv.appendChild(div);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

onChildAdded(messagesRef, (snapshot) => {
  const data = snapshot.val();
  addMessageToDom(data, data.sender === currentUserEmail);
});

msgForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = msgInput.value.trim();
  if (!text) return;

  push(messagesRef, {
    sender: currentUserEmail,
    text,
    timestamp: Date.now()
  }).then(() => {
    msgInput.value = '';
  }).catch(console.error);
});
