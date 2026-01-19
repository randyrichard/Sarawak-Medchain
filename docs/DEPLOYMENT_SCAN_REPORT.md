# MedChain Zero-Error Deployment Scan Report

**Scan Date:** January 2025
**Version:** 1.0
**Status:** ISSUES FOUND - FIXES REQUIRED

---

## Executive Summary

| Check | Status | Severity | Action Required |
|-------|--------|----------|-----------------|
| FPX Callbacks | ISSUE | HIGH | Fix webhook resilience |
| Blockchain Gas Buffer | ISSUE | MEDIUM | Add gas estimation |
| Doctor Form Validation | PARTIAL | LOW | Improve error messages |
| Mobile Responsiveness | ISSUE | MEDIUM | Optimize load time |
| Security Headers | PASS | - | Minor logging cleanup |

---

## 1. FPX Payment Callbacks

### Current State: ISSUE FOUND

**Problem:** If a user closes the browser during FPX redirect, the RM 10,000 credit will NOT activate.

**Root Cause Analysis:**
```
Current Flow (BROKEN):
1. User clicks "Pay" -> Frontend simulates FPX steps
2. Payment "completes" -> localStorage.setItem('medchain_hospital_node', data)
3. Browser closes BEFORE step 2 -> Credits NEVER activate

The backend webhook /api/webhook/fpx/success exists BUT:
- Only stores payment in memory (lost on server restart)
- Does NOT activate hospital credits
- Frontend does NOT call this webhook
```

**Evidence:**
- `frontend/src/pages/FPXPayment.jsx:101` - Credits saved to localStorage AFTER payment completes
- `backend/server.js:67` - Webhook exists but doesn't persist or activate credits

### FIX REQUIRED:

```javascript
// backend/server.js - Add to FPX success webhook
app.post('/api/webhook/fpx/success', async (req, res) => {
  // ... existing validation ...

  // NEW: Persist to database (not just memory)
  await db.payments.create({
    transactionId: payment.transactionId,
    amount: payment.amount,
    hospitalId: payment.hospitalId,
    status: 'confirmed',
    creditsActivated: true,  // Mark credits as active
    activatedAt: new Date(),
  });

  // NEW: Activate hospital node server-side
  await db.hospitalNodes.upsert({
    hospitalId: payment.hospitalId,
    status: 'Active',
    credits: { balance: 100, lastTopUp: new Date() },
    subscription: { plan: 'Enterprise', monthlyFee: 10000 },
  });

  // Return redirect URL for user to see success page
  res.json({
    success: true,
    redirectUrl: `/payment/success?txn=${payment.transactionId}`,
  });
});
```

```javascript
// frontend/src/pages/FPXPayment.jsx - Add recovery check on load
useEffect(() => {
  // Check if user has a pending payment that was confirmed server-side
  const checkPendingPayment = async () => {
    const pendingTxn = localStorage.getItem('medchain_pending_fpx_txn');
    if (pendingTxn) {
      const response = await fetch(`/api/webhook/fpx/status/${pendingTxn}`);
      const data = await response.json();
      if (data.status === 'confirmed' && !data.creditsActivated) {
        // Activate credits locally
        activateCredits(data);
      }
    }
  };
  checkPendingPayment();
}, []);
```

---

## 2. Blockchain Gas Buffer

### Current State: ISSUE FOUND

**Problem:** Smart contract has no gas buffer mechanism. Transactions may fail during network congestion.

**Evidence:**
- `contracts/SarawakMedMVP.sol` - No gas estimation or buffer logic
- No retry mechanism for failed transactions

### FIX REQUIRED:

```javascript
// frontend/src/utils/contract.js - Add gas buffer wrapper

/**
 * Execute contract transaction with gas buffer
 * Adds 20% buffer to estimated gas to prevent failures
 */
export async function executeWithGasBuffer(contract, methodName, args, options = {}) {
  const GAS_BUFFER_MULTIPLIER = 1.2; // 20% buffer

  try {
    // Estimate gas
    const estimatedGas = await contract.estimateGas[methodName](...args);

    // Add buffer
    const gasLimit = Math.ceil(estimatedGas.toNumber() * GAS_BUFFER_MULTIPLIER);

    // Execute with buffered gas
    const tx = await contract[methodName](...args, {
      ...options,
      gasLimit,
    });

    return tx;
  } catch (error) {
    // If estimation fails, use fallback gas limit
    if (error.code === 'UNPREDICTABLE_GAS_LIMIT') {
      const FALLBACK_GAS = 500000;
      console.warn(`Gas estimation failed, using fallback: ${FALLBACK_GAS}`);

      const tx = await contract[methodName](...args, {
        ...options,
        gasLimit: FALLBACK_GAS,
      });
      return tx;
    }
    throw error;
  }
}

/**
 * Retry wrapper for network congestion
 */
export async function executeWithRetry(fn, maxRetries = 3, delayMs = 2000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries) throw error;

      // Check if retryable error
      const isRetryable =
        error.code === 'NETWORK_ERROR' ||
        error.code === 'TIMEOUT' ||
        error.message.includes('nonce') ||
        error.message.includes('replacement fee too low');

      if (!isRetryable) throw error;

      console.warn(`Transaction failed (attempt ${attempt}/${maxRetries}), retrying...`);
      await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
    }
  }
}
```

---

## 3. Doctor Terminal Form Validation

### Current State: PARTIAL PASS

**Problem:** Error messages are generic. Doctor doesn't know WHICH field is missing.

**Evidence:**
```javascript
// Current (generic):
if (!mcFormData.patientIC || !mcFormData.patientName || !mcFormData.diagnosis) {
  setMessage('Error: Please fill in all required fields');  // Which field?!
  return;
}
```

### FIX REQUIRED:

```javascript
// frontend/src/pages/DoctorPortal.jsx - Improve validation

const validateMCForm = () => {
  const errors = [];

  if (!mcFormData.patientIC?.trim()) {
    errors.push('Patient IC Number is required');
  } else if (!/^\d{6}-\d{2}-\d{4}$/.test(mcFormData.patientIC)) {
    errors.push('Patient IC must be in format: XXXXXX-XX-XXXX');
  }

  if (!mcFormData.patientName?.trim()) {
    errors.push('Patient Name is required');
  } else if (mcFormData.patientName.length < 3) {
    errors.push('Patient Name must be at least 3 characters');
  }

  if (!mcFormData.diagnosis?.trim()) {
    errors.push('Diagnosis/Reason is required');
  }

  if (!hasSignature()) {
    errors.push('Digital signature is required - please sign above');
  }

  return errors;
};

const handleSecureOnBlockchain = async () => {
  const validationErrors = validateMCForm();

  if (validationErrors.length > 0) {
    setMessage(`Error: ${validationErrors[0]}`);  // Show first error
    setFormErrors(validationErrors);  // Highlight all fields
    return;
  }

  // ... proceed with blockchain ...
};
```

```jsx
// Add inline field validation UI
<input
  name="patientIC"
  value={mcFormData.patientIC}
  onChange={handleMcInputChange}
  className={`input-field ${formErrors.includes('Patient IC') ? 'border-red-500' : ''}`}
  placeholder="e.g., 901201-13-5678"
/>
{formErrors.some(e => e.includes('IC')) && (
  <p className="text-red-400 text-xs mt-1">Invalid IC format</p>
)}
```

---

## 4. Mobile Responsiveness - QR Verification Page

### Current State: ISSUE FOUND

**Problem:** 1.5 second artificial delay + no mobile optimizations.

**Evidence:**
```javascript
// frontend/src/pages/VerificationPage.jsx:16
await new Promise(resolve => setTimeout(resolve, 1500));  // 1.5s delay!
```

**Issues:**
1. Fixed 1.5s delay regardless of actual blockchain query time
2. No skeleton loading for perceived performance
3. No viewport meta optimization
4. Large QR code (80px) doesn't scale well on small screens

### FIX REQUIRED:

```javascript
// frontend/src/pages/VerificationPage.jsx - Optimize for mobile

useEffect(() => {
  const verifyOnChain = async () => {
    setLoading(true);

    // REMOVE artificial delay - use real API call timing
    // await new Promise(resolve => setTimeout(resolve, 1500)); // DELETE THIS

    // Real verification (would be instant for cached data)
    try {
      const response = await fetch(`/api/verify/${txHash}`);
      const data = await response.json();
      setMcData(data);
      setVerified(data.status === 'verified');
    } catch (error) {
      // Fallback to mock data for demo
      setMcData(generateMockData());
      setVerified(true);
    }

    setLoading(false);
  };

  verifyOnChain();
}, [txHash]);

// Add responsive QR sizing
<QRCodeSVG
  value={window.location.href}
  size={window.innerWidth < 640 ? 60 : 80}  // Smaller on mobile
  level="H"
/>

// Add responsive grid
<div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
```

```html
<!-- index.html - Ensure viewport is optimized -->
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
```

**Performance Target:** < 500ms load time on 4G mobile

---

## 5. Security Headers & Encryption

### Current State: PASS (Minor Issue)

**AES-256-GCM Encryption:** VERIFIED ACTIVE
- File: `backend/utils/encryption.js`
- Algorithm: `aes-256-gcm` (line 3)
- Key Length: 256 bits (line 4)
- Auth Tag: 128 bits (line 6)

**Sensitive Data Logging:** MINOR ISSUE FOUND

```javascript
// backend/middleware/auth.js:57 - Logs wallet address (acceptable)
console.log(`Authenticated request from ${req.walletAddress} for action: ${action}`);
```

**No IC numbers or patient data logged in plain text.** PASS

### RECOMMENDATION:

```javascript
// Add to backend/server.js - Security headers middleware
import helmet from 'helmet';

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],  // For React
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
    },
  },
  hsts: {
    maxAge: 31536000,  // 1 year
    includeSubDomains: true,
  },
}));

// Disable sensitive data in production logs
if (process.env.NODE_ENV === 'production') {
  console.log = () => {};  // Disable console.log in production
}
```

---

## Action Items Summary

| Priority | Fix | File | Est. Effort |
|----------|-----|------|-------------|
| HIGH | FPX webhook resilience | `backend/server.js`, `FPXPayment.jsx` | 2-3 hours |
| MEDIUM | Gas buffer wrapper | `frontend/src/utils/contract.js` | 1-2 hours |
| LOW | Form validation errors | `DoctorPortal.jsx` | 1 hour |
| MEDIUM | Mobile optimization | `VerificationPage.jsx` | 1-2 hours |
| LOW | Security headers | `backend/server.js` | 30 mins |

---

## Deployment Checklist

Before going live, ensure:

- [ ] FPX webhook persists to database (not memory)
- [ ] Browser-close recovery mechanism tested
- [ ] Gas buffer tested on testnet with varying gas prices
- [ ] All form validation errors are user-friendly
- [ ] QR page loads < 1 second on mobile
- [ ] `helmet` security middleware installed
- [ ] Production logging disabled for sensitive routes
- [ ] HTTPS enforced on all endpoints
- [ ] Rate limiting configured for API endpoints

---

**Report Generated By:** MedChain Deployment Scanner
**Next Scan:** Before production deployment
