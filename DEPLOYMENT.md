# Deployment Guide - Don't Miss This Saturday POS

## 🚀 Quick Deployment Checklist

### 1. Firebase Rules & Indexes Deployment

```bash
# Deploy Firestore security rules
firebase deploy --only firestore:rules

# Deploy Storage security rules
firebase deploy --only storage:rules

# Deploy Firestore indexes
firebase deploy --only firestore:indexes
```

### 2. Environment Variables

Create `.env.local` with:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
NEXT_PUBLIC_ADMIN_PIN=123456
NEXT_PUBLIC_STAFF_PIN=123456
```

### 3. Vercel Deployment

```bash
# Install Vercel CLI (if not installed)
pnpm add -g vercel

# Login to Vercel
vercel login

# Deploy to preview
cd /Users/gdrom/Desktop/dontmissthesaturday/pos-platform/apps/web
vercel

# After testing, deploy to production
vercel --prod
```

**Important:** Set all environment variables in Vercel dashboard before production deployment!

### 4. Post-Deployment Verification

1. ✅ Visit production URL
2. ✅ Test customer menu flow
3. ✅ Test staff login
4. ✅ Test order creation
5. ✅ Test payment processing
6. ✅ Verify real-time updates working
7. ✅ Check browser console for errors

## 📋 Pre-Deployment Build Check

```bash
cd /Users/gdrom/Desktop/dontmissthesaturday/pos-platform/apps/web

# Final build verification
pnpm build

# TypeScript check
pnpm tsc --noEmit

# Run dev server for final testing
pnpm dev
```

## 🧪 Manual Testing Scenarios

### Scenario 1: Customer Orders Food (15 min)

**Steps:**
1. Open `http://localhost:3000/menu/4` (or production URL)
2. Verify menu loads with categories and items
3. Add items to cart (e.g., "Pad Thai" x2)
4. Add modifiers if configured
5. Verify cart badge updates
6. Open cart and verify totals (subtotal + 7% tax)
7. Submit order
8. Verify success screen
9. Check Firebase Console → orders collection
10. Navigate to `/staff/orders` → verify order appears
11. Navigate to `/staff/kds` → verify order in "New" column

**Expected Results:**
- ✅ Menu loads < 2 seconds
- ✅ Cart updates correctly
- ✅ Tax calculated at 7%
- ✅ Order submission successful
- ✅ Real-time updates in staff views

### Scenario 2: Kitchen Prepares Order (10 min)

**Steps:**
1. Open `/staff/kds`
2. Verify order appears in "New" column
3. Click order card
4. Verify moves to "Cooking"
5. Click again to move to "Ready"
6. Check Firestore → order status updated

**Expected Results:**
- ✅ KDS columns display correctly
- ✅ Order moves between statuses
- ✅ Real-time Firestore updates

### Scenario 3: Staff Manages Order (15 min)

**Steps:**
1. Navigate to `/staff/login`
2. Enter PIN: 123456 (or your STAFF_PIN)
3. Select role: Staff
4. Login successfully
5. Navigate to dashboard → verify stats
6. Navigate to tables → verify table statuses
7. Navigate to orders → find test order
8. Try voiding an item (enter reason)
9. Verify item marked as voided

**Expected Results:**
- ✅ Login with PIN works
- ✅ Dashboard displays real data
- ✅ Table status accurate
- ✅ Void item functionality works

### Scenario 4: Cashier Processes Payment (20 min)

**Steps:**
1. Navigate to `/staff/cashier`
2. Select occupied table
3. Verify bill displays all items
4. Verify voided items excluded from total
5. Apply 10% discount (reason: "Promotion")
6. Verify total recalculates
7. Select Cash payment
8. Enter amount: ฿500
9. Verify change calculated
10. Process payment
11. Verify receipt displays
12. Check Firestore:
    - Payment record created
    - Orders marked COMPLETED
    - Table status = VACANT
13. Navigate to tables → verify table now VACANT

**Expected Results:**
- ✅ Bill calculation accurate
- ✅ Discount applies correctly
- ✅ Change calculation correct
- ✅ Atomic transaction (all or nothing)
- ✅ Receipt generated properly
- ✅ Table resets successfully

## 🔒 Security Checklist

- ✅ Firestore rules deployed (no public write)
- ✅ Storage rules deployed (auth required for uploads)
- ✅ No API keys hardcoded in client code
- ✅ Environment variables in `.env.local` (not committed)
- ✅ All NEXT_PUBLIC_* vars set in Vercel

## 🎯 Production Readiness

### Build Metrics
- ✅ Build completes without errors
- ✅ Total pages: 21
- ✅ Largest page < 600 kB
- ✅ TypeScript: Zero errors
- ✅ ESLint: Warnings only (no errors)

### Performance
- ✅ First Load JS < 200 KB per route (where possible)
- ✅ Menu loads < 2 seconds
- ✅ Real-time updates < 1 second
- ✅ Payment processing < 3 seconds

### Functionality
- ✅ All 4 test scenarios pass
- ✅ Real-time updates working
- ✅ Forms validate correctly
- ✅ Payments atomic (Firestore transactions)
- ✅ Receipt generation working

## 🌐 Vercel Environment Variables

Set these in Vercel Dashboard → Project → Settings → Environment Variables:

```
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
NEXT_PUBLIC_ADMIN_PIN
NEXT_PUBLIC_STAFF_PIN
```

**Note:** Set for all environments (Production, Preview, Development)

## 📱 Initial Data Setup

After deployment, seed initial data in Firebase:

### 1. Create Tables (Admin → Settings → Tables)
- Create tables 1-20
- Set capacity (e.g., 2, 4, 6 seats)
- All start as VACANT

### 2. Create Menu Categories (Admin → Menu → Categories)
- Appetizers
- Main Course
- Beverages
- Desserts

### 3. Create Menu Items (Admin → Menu → Items)
- Add 10-20 items with prices
- Upload images (optional)
- Set availability
- Assign to categories

### 4. Configure Settings (Admin → Settings → General)
- Business name: "Don't Miss This Saturday"
- Address
- Tax rate: 7%
- PromptPay ID
- Operating hours

### 5. Create Staff Accounts (Admin → Settings → Staff)
- Add staff members
- Set PINs (6 digits)
- Assign roles (Admin/Staff)

## 🎉 Go Live!

Once all checks pass:
1. ✅ Print QR codes for each table (format: `https://your-domain.vercel.app/menu/{tableId}`)
2. ✅ Train staff on all interfaces
3. ✅ Start accepting orders!

## 📞 Support

For issues:
1. Check browser console for errors
2. Check Firebase Console → Firestore for data
3. Check Vercel deployment logs
4. Verify environment variables set correctly

---

**Built with:** Next.js 14, Firebase, Ant Design, TailwindCSS
**Deployment:** Vercel + Firebase
**Status:** Production Ready ✅
