# Go Live on Sepolia — MC Fraud Prevention Prototype

The app now does **real** blockchain anchoring and verification of Medical Certificates:

- **Issue**: the Doctor Portal computes a canonical `keccak256` fingerprint of the MC
  (patient IC, name, diagnosis, duration, doctor, MMC number, dates) and anchors it
  on-chain via `SarawakMedMVP.issueMC(bytes32)`. Only verified doctors can issue.
- **Verify**: the public `/verify/<hash>` page (QR code target) fetches the MC details,
  **recomputes the fingerprint**, and checks it against the chain via `verifyMC()` —
  read-only, no wallet needed by the employer. If any field was altered, verification
  fails with a security alert. Demo-mode MCs (not anchored) show an amber "DEMO RECORD"
  badge instead of the green "VERIFIED" badge.

Everything is tested end-to-end on a local Hardhat chain. To take it live on the
public Sepolia testnet, do the following steps once.

## 1. Restore Supabase (REQUIRED — the old project is dead)

The Supabase project `pocssfzyefxgdkipdlzi.supabase.co` **no longer resolves** —
cross-device verification on the live site is currently broken because of this.

1. Create a new project at https://supabase.com (free tier is fine).
2. In the SQL editor, run:

```sql
create table medical_certificates (
  id text primary key,            -- canonical keccak256 MC fingerprint
  mc_id text,
  patient_name text,
  ic_number text,
  diagnosis text,
  duration int,
  doctor_name text,
  clinic_name text,
  mmc_number text,
  date_issued text,
  start_date text,
  end_date text,
  block_number bigint default 0,  -- 0 = demo record (not anchored on-chain)
  created_at timestamptz default now()
);

alter table medical_certificates enable row level security;
create policy "anon can read MCs" on medical_certificates for select using (true);
create policy "anon can insert MCs" on medical_certificates for insert with check (true);
```

3. Copy the project URL and anon key into `frontend/.env.production`
   (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).

Note: tampering with rows in Supabase cannot forge an MC — the verify page
recomputes the hash and checks the blockchain. Supabase only stores the
human-readable details.

## 2. Deploy the contracts to Sepolia

1. Create/choose a deployer wallet and fund it with Sepolia ETH
   (free faucets: https://sepoliafaucet.com or https://faucets.chain.link/sepolia —
   ~0.05 ETH is plenty).
2. Add to the **root** `.env`:

```
DEPLOYER_PRIVATE_KEY=0x<deployer private key>
DEMO_DOCTOR_ADDRESS=0x<the doctor MetaMask address to verify>
```

3. Deploy (important: use `npx hardhat run`, not plain `node`):

```
npx hardhat run scripts/deploy-sepolia.cjs --network sepolia
```

The script deploys `SarawakMedMVP` + `BillingHistory`, connects them, verifies
the demo doctor, and prints the two contract addresses.

## 3. Point the frontend at Sepolia

Add the printed addresses to `frontend/.env.production`:

```
VITE_CONTRACT_ADDRESS=0x...          # SarawakMedMVP
VITE_BILLING_CONTRACT_ADDRESS=0x...  # BillingHistory
VITE_CONTRACT_DEPLOY_BLOCK=<block>   # optional: deployment block, speeds up event lookups
VITE_SUPABASE_URL=...                # from step 1
VITE_SUPABASE_ANON_KEY=...           # from step 1
```

## 4. Publish

The Cloudflare Pages project is **direct-upload** (NOT connected to GitHub — pushing
does not deploy anything). Publish with:

```
cd frontend && npm run build
npx wrangler pages deploy dist --project-name sarawak-medchain
```

(If wrangler says "Not logged in", run `npx wrangler login` first.)

## 5. Issue a real MC (the demo-day flow)

1. In MetaMask, use the doctor wallet (`DEMO_DOCTOR_ADDRESS`) on **Sepolia**,
   with a little Sepolia ETH for gas.
2. Open the site → Connect Wallet → Doctor Portal (NOT demo mode).
3. Fill in the MC form, sign, click **SECURE ON BLOCKCHAIN** → MetaMask pops up →
   confirm. The receipt shows the real Sepolia transaction hash and QR code.
4. Scan the QR with any phone (no wallet needed): the verify page shows
   **VERIFIED** with the transaction hash, block number, issuing doctor wallet and
   a "View on Etherscan" link.
5. Fraud demo: change any detail of the record in Supabase and re-scan — the page
   shows a red **SECURITY ALERT** because the recomputed fingerprint no longer
   matches the on-chain anchor.

## Local development

```
npx hardhat node                                          # terminal 1
npx hardhat run scripts/deploy.cjs --network localhost    # deploys + verifies test doctors
cd frontend && npm run dev                                # terminal 2
```

`frontend/.env` already points at the deterministic local addresses. The verify
page automatically uses `http://127.0.0.1:8545` when running on localhost.
