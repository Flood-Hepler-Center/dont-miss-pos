# Firebase Setup & Rule Deployment

## 🚨 CRITICAL: Fix Permission Errors

You're seeing `permission-denied` errors because Firestore security rules haven't been deployed yet.

## Step-by-Step Setup

### 1. Configure Firebase Project ID

Edit `.firebaserc` and replace `your-firebase-project-id` with your actual Firebase project ID:

```json
{
  "projects": {
    "default": "your-actual-project-id"
  }
}
```

**Find your project ID:**
- Go to [Firebase Console](https://console.firebase.google.com/)
- Select your project
- Project ID is shown in Project Settings

### 2. Install Firebase CLI (if not installed)

```bash
npm install -g firebase-tools
```

### 3. Login to Firebase

```bash
firebase login
```

This will open a browser for authentication.

### 4. Verify Firebase Configuration

```bash
cd /Users/gdrom/Desktop/dontmissthesaturday/pos-platform/apps/web

# Check if Firebase recognizes your project
firebase projects:list
```

### 5. Deploy Firestore Security Rules ⚡ CRITICAL

```bash
# Deploy ONLY Firestore rules (this fixes permission errors)
firebase deploy --only firestore:rules

# Expected output:
# ✔ Deploy complete!
```

**This will immediately fix the permission-denied errors!**

### 6. Deploy Firestore Indexes

```bash
firebase deploy --only firestore:indexes
```

### 7. Deploy Storage Rules

```bash
firebase deploy --only storage:rules
```

### 8. Deploy All at Once (Alternative)

```bash
# Deploy everything in one command
firebase deploy --only firestore,storage
```

## 🔍 Verify Deployment

### Check Rules in Firebase Console

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Go to **Firestore Database** → **Rules**
4. You should see the deployed rules

### Test Local App

```bash
# Restart dev server
pnpm dev

# Visit http://localhost:3000/staff/cashier
# Permission errors should be gone ✅
```

## 📋 Current Firestore Rules Summary

After deployment, your rules will allow:

**Public Access (No Auth Required):**
- ✅ Read menu categories
- ✅ Read menu items
- ✅ Read tables
- ✅ Create orders (customers can order)
- ✅ Read settings

**Authenticated Access Required:**
- 🔒 Write menu categories/items
- 🔒 Update/delete orders
- 🔒 All payment operations
- 🔒 All inventory operations
- 🔒 Write settings

## ❌ Common Errors & Solutions

### Error: "Not in a Firebase app directory"
**Solution:** Make sure you're in the correct directory:
```bash
cd /Users/gdrom/Desktop/dontmissthesaturday/pos-platform/apps/web
```

### Error: "Permission denied to access project"
**Solution:** 
1. Run `firebase login` again
2. Make sure your Google account has access to the Firebase project
3. Check `.firebaserc` has correct project ID

### Error: "Invalid project ID"
**Solution:** 
1. Go to Firebase Console
2. Copy exact project ID (not project name)
3. Update `.firebaserc`

### Error: "Failed to parse rules file"
**Solution:**
1. Check `firestore.rules` syntax
2. Common issue: missing semicolons or braces
3. Use Firebase Console Rules tab to validate

## 🎯 Quick Fix for Permission Errors

If you're in a hurry and just need to test locally:

```bash
cd /Users/gdrom/Desktop/dontmissthesaturday/pos-platform/apps/web

# 1. Update .firebaserc with your project ID
# 2. Deploy rules
firebase deploy --only firestore:rules

# 3. Restart dev server
pnpm dev
```

**Permission errors will be fixed immediately after step 2!**

## 📝 Testing After Deployment

### Test 1: Menu Access (Public)
```bash
# Should work without auth
curl http://localhost:3000/menu/4
```

### Test 2: Staff Operations (Requires Auth)
- Login at `/staff/login`
- Access `/staff/cashier`
- Should see tables without permission errors ✅

### Test 3: Firestore Console
- Go to Firestore Console
- Check **Rules** tab
- Rules should show as deployed with timestamp

## 🔐 Security Notes

The deployed rules ensure:
- Customers can browse menu and create orders
- Only authenticated staff can modify data
- Payment operations are staff-only
- Audit logs are read-only (system managed)

## 🆘 Still Having Issues?

1. **Check Firestore Console Rules tab** - Verify rules deployed
2. **Check browser console** - Look for specific error messages
3. **Verify .env.local** - Ensure Firebase config is correct
4. **Clear browser cache** - Sometimes helps with permission errors
5. **Restart dev server** - After deploying rules

---

**After completing these steps, your permission errors will be resolved!** ✅
