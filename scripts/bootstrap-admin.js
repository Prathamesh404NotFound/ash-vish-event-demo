const admin = require('firebase-admin');

// IMPORTANT: Download your Firebase Service Account JSON file from:
// Firebase Console -> Project Settings -> Service Accounts -> Generate new private key
// Then set the environment variable FIREBASE_SERVICE_ACCOUNT to the path of that JSON file
// Example: export FIREBASE_SERVICE_ACCOUNT="/path/to/service-account.json"
// Also set ADMIN_UID and ADMIN_EMAIL
// Example: export ADMIN_UID="your-firebase-uid"
// Example: export ADMIN_EMAIL="your.email@example.com"

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT;
const adminUid = process.env.ADMIN_UID;
const adminEmail = process.env.ADMIN_EMAIL;

if (!serviceAccountPath || !adminUid || !adminEmail) {
  console.error("Missing environment variables. Please set FIREBASE_SERVICE_ACCOUNT, ADMIN_UID, and ADMIN_EMAIL");
  process.exit(1);
}

const serviceAccount = require(serviceAccountPath);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://ashevents-aa490-default-rtdb.asia-southeast1.firebasedatabase.app"
});

const rtdb = admin.database();

async function bootstrap() {
  try {
    console.log(`Bootstrapping admin role for UID: ${adminUid} (${adminEmail})...`);
    
    // Set the staff record
    await rtdb.ref(`staff/${adminUid}`).set({
      role: 'admin',
      email: adminEmail,
      assignedBy: 'bootstrap-script',
      assignedAt: new Date().toISOString()
    });

    // Set the user's role
    await rtdb.ref(`users/${adminUid}/role`).set('admin');

    console.log("Success! You are now an admin in the database.");
    process.exit(0);
  } catch (e) {
    console.error("Failed to bootstrap admin:", e);
    process.exit(1);
  }
}

bootstrap();
