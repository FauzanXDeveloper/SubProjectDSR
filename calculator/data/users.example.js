/* ============================================================
   users.example.js - template for the local user list.

   The real file (data/users.js) is deliberately NOT committed:
   this repository is public and the real file contains working
   passwords.

   Setup:
     1. copy this file to  data/users.js
     2. replace the accounts below with your own
     3. keep data/users.js out of git (already in .gitignore)

   Format: { username, password, name, staffId }
   ============================================================ */
window.DSR_USERS = [
  { username: 'officer1', password: 'ChangeMe#1', name: 'Officer One', staffId: 'S0001' },
  { username: 'officer2', password: 'ChangeMe#2', name: 'Officer Two', staffId: 'S0002' }
];
