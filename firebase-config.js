// Single shared Firebase config for the ZChat static app (no build step).
// chat.js and app.js both import from here — do not duplicate the config.
export const firebaseConfig = {
  apiKey: "AIzaSyCvmzzIhl0lsDLKqtMB8GUGz8HZOMZwrFU",
  authDomain: "zobrochat.firebaseapp.com",
  databaseURL: "https://zobrochat-default-rtdb.firebaseio.com",
  projectId: "zobrochat",
  storageBucket: "zobrochat.firebasestorage.app",
  messagingSenderId: "308792787278",
  appId: "1:308792787278:web:e380ae3064d26f6a995e1f"
};

// Client-side validation caps (defense in depth — real enforcement needs
// Firebase console security rules, see zobrochat-mvp-notes.md).
export const LIMITS = {
  displayName: 30,
  messageText: 1000,
  imageCaption: 280,
  groupName: 40,
  groupMembers: 50
};
