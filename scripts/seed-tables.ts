import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, serverTimestamp } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function seedTables() {
  console.log('🌱 Seeding tables...');

  const tables = [];
  
  // Create 20 tables
  for (let i = 1; i <= 20; i++) {
    const tableData = {
      tableNumber: i,
      tableId: i.toString(),
      capacity: i <= 10 ? 4 : 6,
      status: 'VACANT',
      activeOrders: [],
      currentSessionId: null,
      totalAmount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const tableRef = doc(db, 'tables', i.toString());
    await setDoc(tableRef, tableData);
    tables.push(tableData);
    console.log(`✅ Created Table ${i}`);
  }

  console.log(`🎉 Successfully created ${tables.length} tables!`);
}

seedTables()
  .then(() => {
    console.log('✅ Seeding complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error seeding:', error);
    process.exit(1);
  });
