# Personal Gemini Journal

A security-first, private AI journal providing multi-turn conversational reflection, structured entries, user-controlled memory, and strict per-user Cloud Firestore isolation.

---

## 1. Architecture Overview

The system is architected around **Zero-Trust Client Principles** and **Strict Tenant Isolation**:

```
                         TRUST BOUNDARY 1: PUBLIC / BROWSER
                         ┌─────────────────────────────────┐
                         │   React 19 SPA (Vite + Motion)  │
                         │   • Firebase Web Auth SDK       │
                         │   • Direct Client Firestore SDK │
                         └───────────────┬─────────────────┘
                                         │
                   HTTPS / TLS 1.3       │ Bearer ID Token
                                         ▼
                         TRUST BOUNDARY 2: TRUSTED APPLICATION BACKEND
                         ┌─────────────────────────────────┐
                         │     Express.js API (Node.js)    │
                         │   • Firebase Admin ID Token Ver.│
                         │   • Zod Request Validation      │
                         │   • Redacted Audit Logging      │
                         │   • Gemini AI Orchestration     │
                         └───────┬─────────────────┬───────┘
                                 │                 │
                Secret Injection │                 │ Rules-Guarded
             from Secret Manager │                 │ SDK access
                                 ▼                 ▼
             ┌─────────────────────────┐     ┌─────────────────────────┐
             │    Google Gemini API    │     │     Cloud Firestore     │
             │   (@google/genai SDK)   │     │  users/{uid}/journals   │
             │   gemini-3.8-flash      │     │  users/{uid}/memories   │
             └─────────────────────────┘     │  users/{uid}/insights   │
                                             └─────────────────────────┘
```

### Key Architectural Pillars
- **Direct Gated Data Storage:** The client interacts directly with Firestore for standard user-owned documents under `/users/{uid}/*`, strictly enforced by declarative Firestore Security Rules (`request.auth.uid == uid`).
- **Server-Only Gemini Proxy:** All generative AI interactions execute exclusively through the Express backend. The privileged `GEMINI_API_KEY` is held on the server and is **never** bundled or transmitted to the browser.
- **Server-Verified Identity and Authorization Boundary:** The cryptographic verification of the JWT signature and audience is executed strictly on the trusted backend via Firebase Admin SDK. The resulting user identity identifier (`req.user.uid`) establishes the authoritative authenticated identity boundary. Any client-supplied identity fields (`uid`, `userId`) in the body or query are strictly rejected with `400 UNEXPECTED_IDENTITY_FIELD`.
- **Recursive Conversation Deletion:** Because Firestore does not automatically cascade document deletions to subcollections, conversation deletions are handled via `DELETE /api/conversations/:conversationId` on the trusted backend to guarantee atomic removal of all nested messages.

---

## 2. Environment Variables & Secret Separation

We strictly separate **Public Client Configuration** from **Server-Only Secrets**:

### Public Client Configuration (`VITE_*`)
These are public project identifiers bundled with the frontend to route network requests to your Firebase project. They do not grant administrative privileges and are safe in client code.

```bash
VITE_FIREBASE_API_KEY="AIzaSy..."
VITE_FIREBASE_AUTH_DOMAIN="your-app.firebaseapp.com"
VITE_FIREBASE_PROJECT_ID="your-project-id"
VITE_FIREBASE_STORAGE_BUCKET="your-app.firebasestorage.app"
VITE_FIREBASE_MESSAGING_SENDER_ID="1234567890"
VITE_FIREBASE_APP_ID="1:1234567890:web:abcdef"
```

### Server-Only Secrets (Privileged Credentials)
These secrets are **strictly forbidden** from client code, `.env.example`, or client bundles.

```bash
# Server-only API Key injected via Google Cloud Secret Manager
GEMINI_API_KEY="AIzaSy..."

# Cloud Run / Application URL
APP_URL="https://your-service.run.app"
```

---

## 3. Firebase Setup & Authentication Configuration

1. **Create Firebase Project:**
   - Go to the [Firebase Console](https://console.firebase.google.com/).
   - Enable **Firebase Authentication** and turn on the **Google** sign-in provider.
   - Enable **Cloud Firestore** in production mode.

2. **Deploy Security Rules:**
   - Deploy `firestore.rules` using the Firebase CLI:
     ```bash
     firebase deploy --only firestore:rules
     ```

3. **Deploy Indexes:**
   - Deploy composite indexes:
     ```bash
     firebase deploy --only firestore:indexes
     ```

---

## 4. Local Development & Local Emulator Suite

### Prerequisites
- Node.js 20+ (or LTS)
- Firebase CLI (`npm install -g firebase-tools`)

### Starting Local Development
```bash
# 1. Install dependencies
npm install

# 2. Run the Express server with Vite middleware on port 3000
npm run dev
```

### Starting Firebase Local Emulator Suite
```bash
# Run Auth and Firestore emulators
firebase emulators:start --only auth,firestore
```

---

## 5. Production Secret-Management & Cloud Run Pipeline

```
Google Cloud Secret Manager (Secret: GEMINI_API_KEY)
         │
         │ SecretAccessor IAM Binding
         ▼
Cloud Run Service Revision (Container Environment Injection: GEMINI_API_KEY)
         │
         │ Process memory (process.env.GEMINI_API_KEY)
         ▼
Express Server (GeminiService using @google/genai)
```

No developer or CI/CD script ever hardcodes service account private keys or the Gemini API key.

---

## 6. Firestore Security Model (`firestore.rules`)

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isAuthenticated() {
      return request.auth != null && request.auth.uid != null;
    }
    function isOwner(uid) {
      return isAuthenticated() && request.auth.uid == uid;
    }

    // Default catch-all deny
    match /{document=**} {
      allow read, write: if false;
    }

    // Per-user isolated collections
    match /users/{uid} {
      // Root user doc: client can read, create, update. Client delete is FORBIDDEN.
      // Firestore 'write' is avoided because it includes delete, and rules are OR-based.
      allow read, create, update: if isOwner(uid);
      allow delete: if false; // Cascading account deletion handled exclusively via backend

      match /journals/{journalId} {
        allow read, write, delete: if isOwner(uid);
      }
      match /conversations/{conversationId} {
        allow read, write, delete: if isOwner(uid);
        match /messages/{messageId} {
          allow read, write, delete: if isOwner(uid);
        }
      }
      match /memories/{memoryId} {
        allow read, write, delete: if isOwner(uid);
      }
      match /insights/{insightId} {
        allow read, write, delete: if isOwner(uid);
      }
    }
  }
}
```

---

## 7. Security Testing & Test Suite

The test suite in `/tests` verifies:
- **Firestore Rules (`tests/firestore/rules.test.ts`):** Verifies unauthenticated denial, owner CRUD, cross-user read/write/delete rejection (anti-IDOR), and root-collection denial.
- **Server Health (`tests/server/health.test.ts`):** Proves `/api/health` never leaks secrets, filesystem paths, or environment variables.
- **Auth Middleware (`tests/server/auth.test.ts`):** Proves missing or forged bearer tokens receive `401 AUTH_REQUIRED` or `401 AUTH_VERIFICATION_FAILED`.
- **UID Tampering (`tests/security/uid-tampering.test.ts`):** Proves client payloads like `{ "uid": "bob" }` are stripped, binding execution strictly to the verified token identity.

Run unit tests:
```bash
npm run test
```

---

## 8. Known Limitations & Remaining Security Risks

1. **Client Configuration vs. Security Rules:** Firebase client settings (`apiKey`, `appId`) are visible in frontend bundles by design. Security is **100% reliant on Firestore Security Rules**. Never deploy with permissive or missing rules.
2. **Distributed Rate Limiting:** Phase 1 implements in-process payload size limits and Express security headers. A production deployment with high concurrency should attach Redis or Cloud Armor rate limiting to `/api/chat` to defend against multi-instance quota exhaustion.
3. **Adversarial Content Injection in AI Prompts:** Even with prompt delimitation (`<user_message>`), LLM reasoning may be biased by adversarial input. However, because Gemini has zero direct database or tool execution permissions, a prompt injection cannot access or exfiltrate another user's records.

---

## 9. Implementation Roadmap

- **Phase 1 (Completed):** Secure Foundation (Express, React 19, Firebase Auth, Firestore Rules, Secret Pipeline, Docker, Health/Auth Verification).
- **Phase 2 (Completed):** Multi-Turn Conversational Reflection Engine (SSE streaming, context assembly, memory injection).
- **Phase 3 (Completed):** Structured Journal Synthesis & Memory Extraction Bank.
- **Phase 4 (Completed):** Periodic Reflection Analytics, Emotion Trajectories Execution.
