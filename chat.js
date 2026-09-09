import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getDatabase,
  ref,
  push,
  update,
  onValue,
  onChildAdded,
  onDisconnect,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";
import { firebaseConfig, LIMITS } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
const START_TIME = Date.now(); // used to skip notifying for history on load

// Storage is optional: if the bucket isn't provisioned, image/profile uploads
// fall back to localStorage data-URLs so the feature still works today.
let storage = null;
try { storage = getStorage(app); } catch { storage = null; }
let storageOK = !!storage;

// ---------- DOM ----------
const messagesDiv = document.getElementById('messages');
const composer = document.getElementById('composer');
const msgInput = document.getElementById('msgInput');
const imgBtn = document.getElementById('imgBtn');
const imgInput = document.getElementById('imgInput');
const logoutBtn = document.getElementById('logoutBtn');
const userListDiv = document.getElementById('userList');
const groupListDiv = document.getElementById('groupList');
const publicRoomBtn = document.getElementById('publicRoomBtn');
const meLabel = document.getElementById('meLabel');
const meAvatar = document.getElementById('meAvatar');
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('overlay');
const menuBtn = document.getElementById('menuBtn');
const closeSidebarBtn = document.getElementById('closeSidebar');
const chatTitleName = document.getElementById('chatTitleName');
const chatTitleSub = document.getElementById('chatTitleSub');
const chatAvatar = document.getElementById('chatAvatar');
const bellBtn = document.getElementById('bellBtn');
const toastsDiv = document.getElementById('toasts');
// notification modal
const notifModal = document.getElementById('notifModal');
const notifAllow = document.getElementById('notifAllow');
const notifLater = document.getElementById('notifLater');
// profile modal
const profileBtn = document.getElementById('profileBtn');
const profileModal = document.getElementById('profileModal');
const profileName = document.getElementById('profileName');
const profilePhoto = document.getElementById('profilePhoto');
const profilePreview = document.getElementById('profilePreview');
const profileSave = document.getElementById('profileSave');
const profileCancel = document.getElementById('profileCancel');
const photoStoreNote = document.getElementById('photoStoreNote');
// group modal
const newGroupBtn = document.getElementById('newGroupBtn');
const groupModal = document.getElementById('groupModal');
const groupNameInput = document.getElementById('groupName');
const memberListDiv = document.getElementById('memberList');
const groupCreate = document.getElementById('groupCreate');
const groupCancel = document.getElementById('groupCancel');
// install banner
const installBanner = document.getElementById('installBanner');
const installText = document.getElementById('installText');
const installSub = document.getElementById('installSub');
const installBtn = document.getElementById('installBtn');
const installDismiss = document.getElementById('installDismiss');

let currentUser = null;
let myProfile = { displayName: '', photoURL: '' }; // from users/{uid}
let currentView = { type: 'public' };   // {type:'public'} | {type:'dm', uid} | {type:'group', gid}
let renderUnsub = null;
let unreadCounts = { public: 0 };
let usersCache = {};
let groupsCache = {};
const attachedDmThreads = new Set();
const attachedGroupRooms = new Set();
let publicGlobalAttached = false;
let deferredPrompt = null;
let pendingPhotoDataUrl = null; // chosen profile photo (preview), saved on Save

// ---------- Helpers ----------
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}
function initials(name) {
  return (name || '?').trim().charAt(0).toUpperCase() || '?';
}
function displayNameFor(uid, info) {
  if (uid === currentUser?.uid && myProfile.displayName) return myProfile.displayName;
  return info?.displayName || info?.email || 'Unknown';
}
function photoFor(uid, info) {
  if (uid === currentUser?.uid) return myProfile.photoURL || info?.photoURL || '';
  return info?.photoURL || '';
}
function fmtTime(ts) {
  const n = Number(ts);
  if (!n) return '';
  return new Date(n).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function isSafeImageUrl(url) {
  return typeof url === 'string' && (
    url.startsWith('https://') ||
    url.startsWith('data:image/')
  );
}
function avatarHTML(name, photoUrl, online) {
  const dot = (online === undefined) ? '' : `<span class="dot ${online ? '' : 'off'}"></span>`;
  if (photoUrl && isSafeImageUrl(photoUrl)) {
    // photoURL comes from the DB; treat as URL attribute, never as HTML
    const img = document.createElement('img');
    img.src = photoUrl;
    img.alt = '';
    img.loading = 'lazy';
    const wrap = document.createElement('div');
    wrap.className = 'avatar';
    wrap.appendChild(img);
    const tmp = document.createElement('div');
    tmp.appendChild(wrap);
    return wrap.outerHTML.replace('</div>', dot + '</div>');
  }
  return `<div class="avatar">${escapeHtml(initials(name))}${dot}</div>`;
}
function setAvatar(el, name, photoUrl) {
  el.textContent = '';
  if (photoUrl && isSafeImageUrl(photoUrl)) {
    const img = document.createElement('img');
    img.src = photoUrl;
    img.alt = '';
    el.appendChild(img);
  } else {
    el.textContent = initials(name);
  }
}

// ---------- Auth guard ----------
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }
  currentUser = user;
  loadMyProfile(() => {
    renderMe();
    setupPresence();
    listenUsers();
    listenGroups();
    listenGlobalPublic();
    listenGlobalDmThreads();
    maybeShowNotifPopup();
    openPublicRoom();
  });
});

logoutBtn.addEventListener('click', () => {
  update(ref(db, `users/${currentUser.uid}`), { online: false, lastSeen: serverTimestamp() }).finally(() => {
    signOut(auth).then(() => window.location.href = "index.html");
  });
});

// ---------- Presence (update, never set — preserves profile fields) ----------
function setupPresence() {
  const myRef = ref(db, `users/${currentUser.uid}`);
  const connectedRef = ref(db, '.info/connected');
  onValue(connectedRef, (snap) => {
    if (snap.val() === true) {
      onDisconnect(myRef).update({ online: false, lastSeen: serverTimestamp() });
      update(myRef, {
        email: currentUser.email,
        displayName: myProfile.displayName || currentUser.displayName || '',
        photoURL: myProfile.photoURL || currentUser.photoURL || '',
        online: true,
        lastSeen: serverTimestamp()
      });
      loadMyProfile(renderMe);
    }
  });
}

// ---------- Profile ----------
function loadMyProfile(done) {
  onValue(ref(db, `users/${currentUser.uid}`), (snap) => {
    const v = snap.val() || {};
    myProfile = {
      displayName: (v.displayName || currentUser.displayName || '').slice(0, LIMITS.displayName),
      photoURL: v.photoURL || currentUser.photoURL || localStorage.getItem('zchat-photo-fallback') || ''
    };
    renderMe();
    if (done) { const cb = done; done = null; cb(); }
  }, { onlyOnce: true });
}
function renderMe() {
  const name = myProfile.displayName || currentUser.email;
  meLabel.textContent = name; // textContent = XSS-safe
  setAvatar(meAvatar, name, myProfile.photoURL);
  if (currentView.type === 'public') { /* header stays */ }
}

profileBtn.addEventListener('click', () => {
  profileName.value = myProfile.displayName || '';
  profilePreview.src = myProfile.photoURL || '';
  profilePreview.style.visibility = myProfile.photoURL ? 'visible' : 'hidden';
  pendingPhotoDataUrl = null;
  profilePhoto.value = '';
  photoStoreNote.textContent = storageOK
    ? 'Stored in Firebase Storage.'
    : 'Storage not set up — stored on this device only (localStorage fallback).';
  profileModal.classList.add('show');
});
profileCancel.addEventListener('click', () => profileModal.classList.remove('show'));
profileModal.addEventListener('click', (e) => { if (e.target === profileModal) profileModal.classList.remove('show'); });

profilePhoto.addEventListener('change', () => {
  const f = profilePhoto.files[0];
  if (!f || !f.type.startsWith('image/')) return;
  if (f.size > 2 * 1024 * 1024) { showToast('Photo too large', 'Pick an image under 2 MB.'); profilePhoto.value = ''; return; }
  const reader = new FileReader();
  reader.onload = () => {
    pendingPhotoDataUrl = reader.result;
    profilePreview.src = pendingPhotoDataUrl;
    profilePreview.style.visibility = 'visible';
  };
  reader.readAsDataURL(f); // preview as data-URL (downscaled below on save)
});
function downscale(dataUrl, maxDim = 256) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * scale));
      c.height = Math.max(1, Math.round(img.height * scale));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}
profileSave.addEventListener('click', async () => {
  const name = profileName.value.trim().slice(0, LIMITS.displayName);
  if (!name) { showToast('Name required', 'Enter a display name.'); return; }
  profileSave.disabled = true;
  try {
    let photoURL = myProfile.photoURL || '';
    if (pendingPhotoDataUrl) {
      const small = await downscale(pendingPhotoDataUrl);
      // Try Firebase Storage first; fall back to localStorage data-URL.
      if (storage) {
        try {
          const blob = await (await fetch(small)).blob();
          const sref = storageRef(storage, `avatars/${currentUser.uid}.jpg`);
          await uploadBytes(sref, blob, { contentType: 'image/jpeg' });
          photoURL = await getDownloadURL(sref);
          localStorage.removeItem('zchat-photo-fallback');
          storageOK = true;
        } catch (err) {
          storageOK = false; // bucket missing / rules — use device fallback
          photoURL = small;
          try { localStorage.setItem('zchat-photo-fallback', small); } catch {}
        }
      } else {
        photoURL = small;
        try { localStorage.setItem('zchat-photo-fallback', small); } catch {}
      }
    }
    await updateProfile(currentUser, { displayName: name, photoURL: photoURL || null }).catch(() => {});
    await update(ref(db, `users/${currentUser.uid}`), {
      displayName: name, photoURL, email: currentUser.email, lastSeen: serverTimestamp()
    });
    myProfile = { displayName: name, photoURL };
    renderMe();
    renderUserList();
    profileModal.classList.remove('show');
    showToast('Profile saved', storageOK ? 'Name and photo updated.' : 'Saved on this device (Storage fallback).');
  } catch (err) {
    showToast('Save failed', err.message);
  } finally {
    profileSave.disabled = false;
  }
});

// ---------- User list / DMs sidebar ----------
function listenUsers() {
  onValue(ref(db, 'users'), (snap) => {
    usersCache = snap.val() || {};
    renderUserList();
    if (currentView.type === 'dm') {
      const info = usersCache[currentView.uid];
      chatTitleSub.textContent = info && info.online ? 'Online' : 'Offline';
      chatTitleName.textContent = displayNameFor(currentView.uid, info);
    }
  });
}

function renderUserList() {
  userListDiv.innerHTML = '';
  const entries = Object.entries(usersCache)
    .filter(([uid]) => uid !== currentUser.uid)
    .sort((a, b) => displayNameFor(a[0], a[1]).localeCompare(displayNameFor(b[0], b[1])));

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

    const av = document.createElement('div');
    av.innerHTML = avatarHTML(displayNameFor(uid, info), photoFor(uid, info), info.online);
    const nm = document.createElement('span');
    nm.className = 'uname';
    nm.textContent = displayNameFor(uid, info); // textContent = XSS-safe
    item.appendChild(av.firstChild);
    item.appendChild(nm);
    const count = unreadCounts[uid] || 0;
    if (count > 0) {
      const b = document.createElement('span');
      b.className = 'unread';
      b.textContent = count;
      item.appendChild(b);
    }
    item.addEventListener('click', () => openDm(uid));
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

// ---------- Groups ----------
function listenGroups() {
  onValue(ref(db, 'groups'), (snap) => {
    groupsCache = snap.val() || {};
    renderGroupList();
    // attach watchers for groups I'm in (for badges + notifications)
    Object.entries(groupsCache).forEach(([gid, g]) => {
      if (g && g.members && g.members[currentUser.uid] && !attachedGroupRooms.has(gid)) {
        attachedGroupRooms.add(gid);
        watchGroupRoom(gid);
      }
    });
  });
}
function myGroups() {
  return Object.entries(groupsCache)
    .filter(([, g]) => g && g.members && g.members[currentUser.uid])
    .sort((a, b) => (a[1].name || '').localeCompare(b[1].name || ''));
}
function renderGroupList() {
  groupListDiv.innerHTML = '';
  const mine = myGroups();
  if (mine.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.style.padding = '6px 8px';
    empty.style.margin = '0';
    empty.textContent = 'No groups yet — tap + New.';
    groupListDiv.appendChild(empty);
    return;
  }
  mine.forEach(([gid, g]) => {
    const item = document.createElement('div');
    item.className = 'user-item';
    if (currentView.type === 'group' && currentView.gid === gid) item.classList.add('active');
    const av = document.createElement('div');
    av.innerHTML = avatarHTML(g.name, '', undefined);
    const nm = document.createElement('span');
    nm.className = 'uname';
    nm.textContent = (g.name || 'Group').slice(0, LIMITS.groupName);
    item.appendChild(av.firstChild);
    item.appendChild(nm);
    const count = unreadCounts['g:' + gid] || 0;
    if (count > 0) {
      const b = document.createElement('span');
      b.className = 'unread';
      b.textContent = count;
      item.appendChild(b);
    }
    item.addEventListener('click', () => openGroup(gid));
    groupListDiv.appendChild(item);
  });
}
function watchGroupRoom(gid) {
  onChildAdded(ref(db, `messages/group/${gid}`), (msgSnap) => {
    const data = msgSnap.val() || {};
    if (data.senderUid === currentUser.uid) return;
    if (Number(data.timestamp) < START_TIME) return;
    const isOpen = currentView.type === 'group' && currentView.gid === gid;
    const gname = (groupsCache[gid] && groupsCache[gid].name) || 'Group';
    if (!isOpen) {
      unreadCounts['g:' + gid] = (unreadCounts['g:' + gid] || 0) + 1;
      renderGroupList();
    }
    if (!isOpen || document.hidden) {
      const preview = data.type === 'image' ? (data.caption || '📷 Photo') : (data.text || '');
      showToast(`${data.senderName || data.senderEmail || 'Someone'} (${gname})`, preview);
      sendBrowserNotification(`${data.senderName || data.senderEmail || 'Someone'} · ${gname}`, preview);
    }
  });
}

newGroupBtn.addEventListener('click', () => {
  groupNameInput.value = '';
  memberListDiv.innerHTML = '';
  const entries = Object.entries(usersCache).filter(([uid]) => uid !== currentUser.uid);
  if (entries.length === 0) {
    memberListDiv.textContent = 'No other users yet — invite someone first.';
  } else {
    entries.forEach(([uid, info]) => {
      const label = document.createElement('label');
      label.className = 'member-pick';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = uid;
      label.appendChild(cb);
      const nm = document.createElement('span');
      nm.textContent = displayNameFor(uid, info); // safe
      label.appendChild(nm);
      memberListDiv.appendChild(label);
    });
  }
  groupModal.classList.add('show');
});
groupCancel.addEventListener('click', () => groupModal.classList.remove('show'));
groupModal.addEventListener('click', (e) => { if (e.target === groupModal) groupModal.classList.remove('show'); });

groupCreate.addEventListener('click', async () => {
  const name = groupNameInput.value.trim().slice(0, LIMITS.groupName);
  const picked = [...memberListDiv.querySelectorAll('input:checked')].map((c) => c.value).slice(0, LIMITS.groupMembers - 1);
  if (!name) { showToast('Name required', 'Give the group a name.'); return; }
  groupCreate.disabled = true;
  try {
    const members = { [currentUser.uid]: true };
    picked.forEach((uid) => { members[uid] = true; });
    const gref = push(ref(db, 'groups'), {
      name,
      members,
      createdBy: currentUser.uid,
      createdAt: serverTimestamp()
    });
    groupModal.classList.remove('show');
    openGroup(gref.key);
  } catch (err) {
    showToast('Could not create group', err.message);
  } finally {
    groupCreate.disabled = false;
  }
});

// ---------- Room switching ----------
publicRoomBtn.addEventListener('click', openPublicRoom);

function markActive() {
  publicRoomBtn.classList.toggle('active', currentView.type === 'public');
  renderUserList();
  renderGroupList();
}

function openPublicRoom() {
  currentView = { type: 'public' };
  unreadCounts.public = 0;
  updatePublicBadge();
  chatTitleName.textContent = 'General';
  chatTitleSub.textContent = 'Public room';
  setAvatar(chatAvatar, 'General', '');
  markActive();
  closeMobileSidebar();
  paintRoom(ref(db, 'messages/public'));
}

function openDm(uid) {
  currentView = { type: 'dm', uid };
  unreadCounts[uid] = 0;
  publicRoomBtn.classList.remove('active');
  const info = usersCache[uid] || {};
  chatTitleName.textContent = displayNameFor(uid, info);
  chatTitleSub.textContent = info.online ? 'Online' : 'Offline';
  setAvatar(chatAvatar, displayNameFor(uid, info), photoFor(uid, info));
  markActive();
  closeMobileSidebar();
  paintRoom(ref(db, `messages/dm/${dmKey(currentUser.uid, uid)}`));
}

function openGroup(gid) {
  currentView = { type: 'group', gid };
  unreadCounts['g:' + gid] = 0;
  publicRoomBtn.classList.remove('active');
  const g = groupsCache[gid] || {};
  chatTitleName.textContent = (g.name || 'Group').slice(0, LIMITS.groupName);
  const n = g.members ? Object.keys(g.members).length : 0;
  chatTitleSub.textContent = n ? `${n} member${n === 1 ? '' : 's'}` : 'Group';
  setAvatar(chatAvatar, g.name || 'G', '');
  markActive();
  closeMobileSidebar();
  paintRoom(ref(db, `messages/group/${gid}`));
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
    const data = snapshot.val() || {};
    addMessageToDom(data, data.senderUid === currentUser.uid);
  });

  setTimeout(() => {
    if (first) messagesDiv.innerHTML = '<div class="empty-state">No messages yet. Say hi 👋</div>';
  }, 600);
}

function addMessageToDom(msgData, isSelf) {
  if (messagesDiv.querySelector('.empty-state')) messagesDiv.innerHTML = '';
  const div = document.createElement('div');
  div.classList.add('msg');
  if (isSelf) div.classList.add('self');

  const meta = document.createElement('div');
  meta.classList.add('meta');
  const who = isSelf ? 'You' : (msgData.senderName || msgData.senderEmail || 'Unknown');
  meta.textContent = `${who} • ${fmtTime(msgData.timestamp)}`;

  div.appendChild(meta);

  if (msgData.type === 'image' && isSafeImageUrl(msgData.imageUrl)) {
    const img = document.createElement('img');
    img.className = 'thumb';
    img.src = msgData.imageUrl;
    img.alt = 'Shared image';
    img.loading = 'lazy';
    img.addEventListener('click', () => window.open(msgData.imageUrl, '_blank', 'noopener'));
    div.appendChild(img);
    if (msgData.caption) {
      const cap = document.createElement('div');
      cap.className = 'cap';
      cap.textContent = String(msgData.caption).slice(0, LIMITS.imageCaption); // safe
      div.appendChild(cap);
    }
  } else {
    const text = document.createElement('div');
    text.textContent = msgData.text || (msgData.type === 'image' ? '📷 Photo' : '');
    div.appendChild(text);
  }
  messagesDiv.appendChild(div);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// ---------- Sending (text + images) ----------
function currentTargetRef() {
  if (currentView.type === 'dm') return ref(db, `messages/dm/${dmKey(currentUser.uid, currentView.uid)}`);
  if (currentView.type === 'group') return ref(db, `messages/group/${currentView.gid}`);
  return ref(db, 'messages/public');
}
function basePayload() {
  return {
    senderUid: currentUser.uid,
    senderEmail: currentUser.email,
    senderName: (myProfile.displayName || currentUser.email).slice(0, LIMITS.displayName),
    senderPhoto: (myProfile.photoURL || '').slice(0, 2000),
    timestamp: serverTimestamp()
  };
}

composer.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = msgInput.value.trim().slice(0, LIMITS.messageText);
  if (!text) return;
  msgInput.value = '';
  push(currentTargetRef(), { ...basePayload(), type: 'text', text })
    .catch((err) => showToast('Message failed to send', err.message));
});

imgBtn.addEventListener('click', () => imgInput.click());
imgInput.addEventListener('change', async () => {
  const f = imgInput.files[0];
  imgInput.value = '';
  if (!f) return;
  if (!f.type.startsWith('image/')) { showToast('Not an image', 'Pick an image file.'); return; }
  if (f.size > 5 * 1024 * 1024) { showToast('Image too large', 'Pick an image under 5 MB.'); return; }
  const caption = msgInput.value.trim().slice(0, LIMITS.imageCaption);
  showToast('Uploading…', 'Your photo is on its way.');
  try {
    let imageUrl;
    if (storage) {
      try {
        const sref = storageRef(storage, `images/${currentUser.uid}/${Date.now()}_${f.name.slice(0, 60)}`);
        await uploadBytes(sref, f, { contentType: f.type });
        imageUrl = await getDownloadURL(sref);
        storageOK = true;
      } catch {
        storageOK = false;
        imageUrl = await fileToSmallDataUrl(f); // Storage fallback: local data-URL
      }
    } else {
      imageUrl = await fileToSmallDataUrl(f);
    }
    await push(currentTargetRef(), { ...basePayload(), type: 'image', imageUrl, caption });
    msgInput.value = '';
  } catch (err) {
    showToast('Photo failed to send', err.message);
  }
});
function fileToSmallDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 800 / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * scale));
        c.height = Math.max(1, Math.round(img.height * scale));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.8)); // small data-URL fallback path
      };
      img.onerror = () => resolve(reader.result);
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ---------- Global listeners: unread badges + notifications ----------
function notifyPreview(data) {
  return data.type === 'image' ? (data.caption || '📷 Photo') : (data.text || '');
}
function notifyFrom(data) {
  return data.senderName || data.senderEmail || 'Someone';
}

function listenGlobalPublic() {
  if (publicGlobalAttached) return;
  publicGlobalAttached = true;
  onChildAdded(ref(db, 'messages/public'), (snap) => {
    const data = snap.val() || {};
    if (data.senderUid === currentUser.uid) return;
    if (Number(data.timestamp) < START_TIME) return; // skip existing history
    const isOpen = currentView.type === 'public';
    if (!isOpen) {
      unreadCounts.public = (unreadCounts.public || 0) + 1;
      updatePublicBadge();
    }
    if (!isOpen || document.hidden) {
      showToast(notifyFrom(data), notifyPreview(data));
      sendBrowserNotification(notifyFrom(data), notifyPreview(data));
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
        const data = msgSnap.val() || {};
        if (data.senderUid === currentUser.uid) return;
        if (Number(data.timestamp) < START_TIME) return;
        const isOpen = currentView.type === 'dm' && currentView.uid === otherUid;
        if (!isOpen) {
          unreadCounts[otherUid] = (unreadCounts[otherUid] || 0) + 1;
          renderUserList();
        }
        if (!isOpen || document.hidden) {
          showToast(notifyFrom(data), notifyPreview(data));
          sendBrowserNotification(notifyFrom(data), notifyPreview(data));
        }
      });
    });
  });
}

// ---------- Toasts + browser notifications ----------
function showToast(title, body) {
  const el = document.createElement('div');
  el.className = 'toast';
  const strong = document.createElement('strong');
  strong.textContent = title || ''; // textContent = XSS-safe
  const span = document.createElement('span');
  span.textContent = body || '';
  el.appendChild(strong);
  el.appendChild(span);
  el.addEventListener('click', () => el.remove());
  toastsDiv.appendChild(el);
  setTimeout(() => el.remove(), 5000);
}

function sendBrowserNotification(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const icon = 'icon-192.svg';
  try {
    new Notification(title, { body, icon });
  } catch { /* some browsers block without user gesture */ }
}

function updateBellState() {
  const on = 'Notification' in window && Notification.permission === 'granted';
  bellBtn.classList.toggle('on', on);
}
bellBtn.addEventListener('click', () => {
  if (!('Notification' in window)) {
    showToast('Not supported', 'Your browser doesn’t support notifications.');
    return;
  }
  if (Notification.permission === 'granted') {
    showToast('Notifications are on', 'You’ll get alerts for new messages.');
    return;
  }
  // If denied, keep the bell as a silent fallback — do not nag.
  if (Notification.permission === 'denied') {
    showToast('Notifications blocked', 'Allow them in your browser site settings to get alerts.');
    return;
  }
  Notification.requestPermission().then((perm) => {
    updateBellState();
    if (perm === 'granted') showToast('Notifications on', 'You’ll get alerts for new messages.');
  });
});
updateBellState();

// Notification opt-in popup: re-show every chat open while permission is 'default'.
// Dismiss ("Not now") only hides it for this visit; 'denied' never nags.
function maybeShowNotifPopup() {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'default') return;
  if (sessionStorage.getItem('zchat-notif-dismissed')) return; // dismissed this visit only
  notifModal.classList.add('show');
}
notifAllow.addEventListener('click', () => {
  Notification.requestPermission().then(() => {
    updateBellState();
    notifModal.classList.remove('show');
  });
});
notifLater.addEventListener('click', () => {
  sessionStorage.setItem('zchat-notif-dismissed', '1');
  notifModal.classList.remove('show');
});

// ---------- Add-to-homescreen nudge ----------
(function initInstall() {
  // Dismissed this visit only (sessionStorage) so it re-shows next visit.
  const dismissed = sessionStorage.getItem('zchat-install-dismissed');
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.innerWidth < 780;
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (!isMobile || isStandalone || dismissed) return;

  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installText.textContent = 'Install Z Chat';
    installSub.textContent = 'Add it to your home screen for the full app feel.';
    installBtn.textContent = 'Install';
    installBanner.classList.add('show');
  });

  // iOS has no beforeinstallprompt — show manual instructions instead.
  if (isIOS) {
    installText.textContent = 'Add Z Chat to your Home Screen';
    installSub.textContent = 'Tap Share → Add to Home Screen.';
    installBtn.textContent = 'Got it';
    installBanner.classList.add('show');
  }
})();
installBtn.addEventListener('click', async () => {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    await deferredPrompt.userChoice.catch(() => {});
    deferredPrompt = null;
  }
  installBanner.classList.remove('show');
});
installDismiss.addEventListener('click', () => {
  // Dismissible but re-shown next visit (session-only flag, not permanent).
  sessionStorage.setItem('zchat-install-dismissed', '1');
  installBanner.classList.remove('show');
});
// Register the minimal service worker stub (installability requirement).
if ('serviceWorker' in navigator && (location.protocol === 'http:' || location.protocol === 'https:')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

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
