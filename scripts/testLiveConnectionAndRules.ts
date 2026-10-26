import { initializeApp } from 'firebase/app';
import { getAuth, inMemoryPersistence } from 'firebase/auth';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

async function main() {
  console.log('Testing live Firebase config connection...');
  console.log('Project ID:', firebaseConfig.projectId);
  console.log('Database ID:', firebaseConfig.firestoreDatabaseId);

  const app = initializeApp(firebaseConfig, 'live-test-app');
  const db = firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
    ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
    : getFirestore(app);

  console.log('Initialized Firestore instance successfully.');
  try {
    const testDoc = await getDoc(doc(db, 'subscription_packages', 'trial'));
    console.log('subscription_packages/trial exists:', testDoc.exists(), testDoc.data());
  } catch (err: any) {
    console.log('Error reading subscription_packages/trial:', err.code, err.message);
  }
}

main().catch(console.error);
