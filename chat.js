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
  set,
  update,
  onValue,
  onChildAdded,
  onDisconnect,
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
const START_TIME = Date.now(); // used to skip notifying for history on load

// ---------- DOM ----------
const messagesDiv = document.getElementById('messages');
const composer = document.getElementById('composer');
const msgInput = document.getElementById('msgInput');
const logoutBtn = document.getElementById('logoutBtn');
const userListDiv = document.getElementById('userList');
const publicRoomBtn = document.getElementById('publicRoomBtn');
const meLabel = document.getElementById('meLabel');
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('overlay');
const menuBtn = document.getElementById('menuBtn');
const closeSidebarBtn = document.getElementById('closeSidebar');
const chatTitleName = document.getElementById('chatTitleName');
const chatTitleSub = document.getElementById('chatTitleSub');
const chatAvatar = document.getElementById('chatAvatar');
const bellBtn = document.getElementById('bellBtn');
const toastsDiv = document.getElementById('toasts');

let currentUser = null;
let currentView = { type: 'public' };   // {type:'public'} or {type:'dm', uid, email}
let renderUnsub = null;                 // listener that paints the open room
let unreadCounts = { public: 0 };       // 'public' or uid -> count
let usersCache = {};
const attachedDmThreads = new Set();
let publicGlobalAttached = false;

// ---------- Auth guard ----------
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }
  currentUser = user;
  meLabel.textContent = user.email;
  setupPresence(user);
  listenUsers();
  listenGlobalPublic();
  listenGlobalDmThreads();
  openPublicRoom();
});

logoutBtn.addEventListener('click', () => {
  const myRef = ref(db, `users/${currentUser.uid}`);
  update(myRef, { online: false, lastSeen: serverTimestamp() }).finally(() => {
    signOut(auth).then(() => window.location.href = "index.html");
  });
});

// ---------- Presence ----------
function setupPresence(user) {
  const myRef = ref(db, `users/${user.uid}`);
  const connectedRef = ref(db, '.info/connected');
  onValue(connectedRef, (snap) => {
    if (snap.val() === true) {
      onDisconnect(myRef).update({ online: false, lastSeen: serverTimestamp() });
      set(myRef, { email: user.email, online: true, lastSeen: serverTimestamp() });
    }
  });
}

// ---------- User list / DMs sidebar ----------
function listenUsers() {
  onValue(ref(db, 'users'), (snap) => {
    usersCache = snap.val() || {};
    renderUserList();
    if (currentView.type === 'dm' && usersCache[currentView.uid]) {
      chatTitleSub.textContent = usersCache[currentView.uid].online ? 'Online' : 'Offline';
    }
  });
}

function initials(email) {
  return (email || '?').charAt(0).toUpperCase();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderUserList() {
  userListDiv.innerHTML = '';
  const entries = Object.entries(usersCache)
    .filter(([uid]) => uid !== currentUser.uid)
    .sort((a, b) => (a[1].email || '').localeCompare(b[1].email || ''));

  if (entries.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.style.padding = '10px 8px';
    empty.style.margin = '0';
    empty.textContent = 'No one else here yet.';
    userListDiv.appendChild(empty);
    return;
  }

  entries.forEach(([uid, info]) => {
    const item = document.createElement('div');
    item.className = 'user-item';
    if (currentView.type === 'dm' && currentView.uid === uid) item.classList.add('active');
    item.dataset.uid = uid;

    const count = unreadCounts[uid] || 0;
    item.innerHTML = `
      <div class="avatar">${initials(info.email)}<span class="dot ${info.online ? '' : 'off'}"></span></div>
      <span class="uname">${escapeHtml(info.email || 'Unknown')}</span>
      ${count > 0 ? `<span class="unread">${count}</span>` : ''}
    `;
    item.addEventListener('click', () => openDm(uid, info.email));
    userListDiv.appendChild(item);
  });
}

function updatePublicBadge() {
  const existing = publicRoomBtn.querySelector('.unread');
  if (existing) existing.remove();
  const count = unreadCounts.public || 0;
  if (count > 0) {
    const span = document.createElement('span');
    span.className = 'unread';
    span.textContent = count;
    publicRoomBtn.appendChild(span);
  }
}

// ---------- Room switching ----------
publicRoomBtn.addEventListener('click', openPublicRoom);

function openPublicRoom() {
  currentView = { type: 'public' };
  unreadCounts.public = 0;
  updatePublicBadge();
  publicRoomBtn.classList.add('active');
  chatTitleName.textContent = 'General';
  chatTitleSub.textContent = 'Public room';
  chatAvatar.textContent = '#';
  renderUserList();
  closeMobileSidebar();
  paintRoom(ref(db, 'messages/public'));
}

function openDm(uid, email) {
  currentView = { type: 'dm', uid, email };
  unreadCounts[uid] = 0;
  publicRoomBtn.classList.remove('active');
  chatTitleName.textContent = email;
  chatTitleSub.textContent = usersCache[uid] && usersCache[uid].online ? 'Online' : 'Offline';
  chatAvatar.textContent = initials(email);
  renderUserList();
  closeMobileSidebar();
  paintRoom(ref(db, `messages/dm/${dmKey(currentUser.uid, uid)}`));
}

function dmKey(uidA, uidB) {
  return [uidA, uidB].sort().join('_');
}

// ---------- Painting the currently open room ----------
function paintRoom(roomRef) {
  if (renderUnsub) renderUnsub();
  messagesDiv.innerHTML = '<div class="empty-state">Loading messages...</div>';

  let first = true;
  renderUnsub = onChildAdded(roomRef, (snapshot) => {
    if (first) {
      messagesDiv.innerHTML = '';
      first = false;
    }
    const data = snapshot.val();
    addMessageToDom(data, data.senderUid === currentUser.uid);
  });

  setTimeout(() => {
    if (first) messagesDiv.innerHTML = '<div class="empty-state">No messages yet. Say hi \ud83d\udc4b</div>';
  }, 600);
}

function addMessageToDom(msgData, isSelf) {
  if (messagesDiv.querySelector('.empty-state')) messagesDiv.innerHTML = '';
  const div = document.createElement('div');
  div.classList.add('msg');
  if (isSelf) div.classList.add('self');

  const meta = document.createElement('div');
  meta.classList.add('meta');
  const time = new Date(msgData.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  meta.textContent = `${isSelf ? 'You' : msgData.senderEmail} \u2022 ${time}`;

  const text = document.createElement('div');
  text.textContent = msgData.text;

  div.appendChild(meta);
  div.appendChild(text);
  messagesDiv.appendChild(div);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// ---------- Sending ----------
composer.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = msgInput.value.trim();
  if (!text) return;

  const payload = {
    senderUid: currentUser.uid,
    senderEmail: currentUser.email,
    text,
    timestamp: Date.now()
  };

  const targetRef = currentView.type === 'public'
    ? ref(db, 'messages/public')
    : ref(db, `messages/dm/${dmKey(currentUser.uid, currentView.uid)}`);

  push(targetRef, payload)
    .then(() => { msgInput.value = ''; })
    .catch((err) => showToast('Message failed to send', err.message));
});

// ---------- Global listeners: unread badges + notifications ----------
// These run independently of which room is painted on screen, so DMs and the
// public room can badge/notify even while you're looking somewhere else.

function listenGlobalPublic() {
  if (publicGlobalAttached) return;
  publicGlobalAttached = true;
  onChildAdded(ref(db, 'messages/public'), (snap) => {
    const data = snap.val();
    if (data.senderUid === currentUser.uid) return;
    if (data.timestamp < START_TIME) return; // skip existing history
    const isOpen = currentView.type === 'public';
    if (!isOpen) {
      unreadCounts.public = (unreadCounts.public || 0) + 1;
      updatePublicBadge();
    }
    if (!isOpen || document.hidden) {
      showToast(data.senderEmail, data.text);
      sendBrowserNotification(data.senderEmail, data.text);
    }
  });
}

function listenGlobalDmThreads() {
  onValue(ref(db, 'messages/dm'), (snap) => {
    const all = snap.val() || {};
    Object.keys(all).forEach((key) => {
      if (!key.includes(currentUser.uid) || attachedDmThreads.has(key)) return;
      attachedDmThreads.add(key);
      const otherUid = key.split('_').find((u) => u !== currentUser.uid);

      onChildAdded(ref(db, `messages/dm/${key}`), (msgSnap) => {
        const data = msgSnap.val();
        if (data.senderUid === currentUser.uid) return;
        if (data.timestamp < START_TIME) return;
        const isOpen = currentView.type === 'dm' && currentView.uid === otherUid;
        if (!isOpen) {
          unreadCounts[otherUid] = (unreadCounts[otherUid] || 0) + 1;
          renderUserList();
        }
        if (!isOpen || document.hidden) {
          showToast(data.senderEmail, data.text);
          sendBrowserNotification(data.senderEmail, data.text);
        }
      });
    });
  });
}

// ---------- Toasts + browser notifications ----------
function showToast(title, body) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<strong>${escapeHtml(title)}</strong>${escapeHtml(body || '')}`;
  el.addEventListener('click', () => el.remove());
  toastsDiv.appendChild(el);
  setTimeout(() => el.remove(), 5000);
}

function sendBrowserNotification(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const icon = 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect width=%22100%22 height=%22100%22 rx=%2222%22 fill=%22%237C5CFF%22/><text x=%2250%22 y=%2270%22 font-size=%2260%22 font-family=%22sans-serif%22 font-weight=%22900%22 fill=%22white%22 text-anchor=%22middle%22>Z</text></svg>';
  new Notification(title, { body, icon });
}

function updateBellState() {
  const on = 'Notification' in window && Notification.permission === 'granted';
  bellBtn.classList.toggle('on', on);
}
bellBtn.addEventListener('click', () => {
  if (!('Notification' in window)) {
    showToast('Not supported', 'Your browser doesn\u2019t support notifications.');
    return;
  }
  if (Notification.permission === 'granted') {
    showToast('Notifications are on', 'You\u2019ll get alerts for new messages.');
    return;
  }
  Notification.requestPermission().then((perm) => {
    updateBellState();
    if (perm === 'granted') showToast('Notifications on', 'You\u2019ll get alerts for new messages.');
  });
});
updateBellState();

// ---------- Mobile sidebar ----------
menuBtn.addEventListener('click', () => {
  sidebar.classList.add('open');
  overlay.classList.add('show');
});
closeSidebarBtn.addEventListener('click', closeMobileSidebar);
overlay.addEventListener('click', closeMobileSidebar);
function closeMobileSidebar() {
  sidebar.classList.remove('open');
  overlay.classList.remove('show');
}
