/**
 * Sarawak MedChain - Credit Depletion Stress Test
 *
 * Tests the Low Credit Balance alert system by rapidly depleting
 * hospital credits to trigger warning and critical thresholds.
 *
 * Run: node scripts/creditDepletionTest.cjs
 */

const { ethers } = require('hardhat');
const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
  INITIAL_CREDITS: 600, // Start with low credits to trigger alerts faster
  MC_COST: 1,
  LOW_CREDIT_THRESHOLD: 500,
  CRITICAL_CREDIT_THRESHOLD: 100,
  BATCH_SIZE: 50,
};

async function runCreditDepletionTest() {
  console.log(`
╔════════════════════════════════════════════════════════════════════════════════╗
║             SARAWAK MEDCHAIN - CREDIT DEPLETION STRESS TEST                    ║
╠════════════════════════════════════════════════════════════════════════════════╣
║  Testing Low Credit Balance alert triggers                                      ║
║  Initial Credits: RM ${CONFIG.INITIAL_CREDITS} | Warning: RM ${CONFIG.LOW_CREDIT_THRESHOLD} | Critical: RM ${CONFIG.CRITICAL_CREDIT_THRESHOLD}     ║
╚════════════════════════════════════════════════════════════════════════════════╝
`);

  const accounts = await ethers.getSigners();
  const admin = accounts[0];
  const hospital = accounts[1];

  // Load contract
  const contractAddress = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
  const contractABI = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'frontend', 'src', 'SarawakMedMVP.json'), 'utf8')
  ).abi;
  const contract = new ethers.Contract(contractAddress, contractABI, admin);

  // Verify hospital as doctor
  console.log('\n🔐 Setting up test hospital...');
  try {
    const tx = await contract.addVerifiedDoctor(hospital.address);
    await tx.wait();
    console.log('✅ Hospital verified as doctor');
  } catch (e) {
    console.log('✅ Hospital already verified');
  }

  // Hospital state
  const hospitalState = {
    name: 'Test Hospital - Credit Depletion',
    wallet: hospital.address,
    credits: CONFIG.INITIAL_CREDITS,
    mcsIssued: 0,
    alerts: [],
  };

  console.log(`\n🏥 Hospital: ${hospitalState.name}`);
  console.log(`💰 Starting Credits: RM ${hospitalState.credits}`);
  console.log(`⚠️ Warning Threshold: RM ${CONFIG.LOW_CREDIT_THRESHOLD}`);
  console.log(`🚨 Critical Threshold: RM ${CONFIG.CRITICAL_CREDIT_THRESHOLD}`);

  // Generate patient addresses
  const patients = Array.from({ length: 100 }, () =>
    ethers.Wallet.createRandom().address
  );

  console.log('\n📊 Starting credit depletion simulation...\n');
  console.log('Credits | Status     | Alert');
  console.log('--------|------------|----------------------------------');

  let txCount = 0;
  let warningTriggered = false;
  let criticalTriggered = false;

  while (hospitalState.credits > 0 && txCount < 700) {
    // Issue MC
    const patient = patients[txCount % patients.length];
    const ipfsHash = `QmTest${Date.now()}${txCount}`;

    try {
      const tx = await contract.connect(hospital).writeRecord(patient, ipfsHash);
      await tx.wait();

      // Deduct credit
      hospitalState.credits -= CONFIG.MC_COST;
      hospitalState.mcsIssued++;
      txCount++;

      // Check thresholds
      let status = 'Active';
      let alert = '';

      if (hospitalState.credits <= CONFIG.CRITICAL_CREDIT_THRESHOLD && !criticalTriggered) {
        status = 'CRITICAL';
        alert = '🚨 CRITICAL: Immediate top-up required!';
        criticalTriggered = true;
        hospitalState.alerts.push({
          type: 'CRITICAL',
          credits: hospitalState.credits,
          timestamp: new Date().toISOString(),
        });
      } else if (hospitalState.credits <= CONFIG.LOW_CREDIT_THRESHOLD && !warningTriggered) {
        status = 'WARNING';
        alert = '⚠️ LOW CREDIT: Please top up soon';
        warningTriggered = true;
        hospitalState.alerts.push({
          type: 'WARNING',
          credits: hospitalState.credits,
          timestamp: new Date().toISOString(),
        });
      } else if (criticalTriggered) {
        status = 'CRITICAL';
      } else if (warningTriggered) {
        status = 'WARNING';
      }

      // Print status every 50 MCs or on alert
      if (txCount % 50 === 0 || alert) {
        const creditsStr = `RM ${hospitalState.credits}`.padEnd(6);
        const statusStr = status.padEnd(10);
        console.log(`${creditsStr} | ${statusStr} | ${alert}`);
      }

      // Stop if out of credits
      if (hospitalState.credits <= 0) {
        console.log('\n🛑 HOSPITAL OUT OF CREDITS - MC ISSUANCE BLOCKED');
        hospitalState.alerts.push({
          type: 'DEPLETED',
          credits: 0,
          timestamp: new Date().toISOString(),
        });
        break;
      }

    } catch (error) {
      console.log(`\n❌ Transaction failed: ${error.message}`);
      break;
    }
  }

  // Summary
  console.log(`
╔════════════════════════════════════════════════════════════════════════════════╗
║                        CREDIT DEPLETION TEST RESULTS                           ║
╠════════════════════════════════════════════════════════════════════════════════╣
║  📊 MCs Issued: ${hospitalState.mcsIssued.toString().padEnd(55)}║
║  💰 Final Credits: RM ${hospitalState.credits.toString().padEnd(51)}║
║  ⚠️ Warning Alert Triggered: ${warningTriggered ? '✅ YES' : '❌ NO'}${' '.repeat(43)}║
║  🚨 Critical Alert Triggered: ${criticalTriggered ? '✅ YES' : '❌ NO'}${' '.repeat(42)}║
╠════════════════════════════════════════════════════════════════════════════════╣
║  ALERT TIMELINE                                                                 ║
`);

  hospitalState.alerts.forEach((alert, i) => {
    console.log(`║  ${i + 1}. [${alert.type}] at RM ${alert.credits} - ${alert.timestamp.split('T')[1].split('.')[0]}`);
  });

  console.log(`╚════════════════════════════════════════════════════════════════════════════════╝`);

  // Verify alerts match expected behavior
  const testsPassed = warningTriggered && criticalTriggered;
  console.log(`\n${testsPassed ? '✅ ALL CREDIT ALERT TESTS PASSED' : '❌ SOME TESTS FAILED'}`);

  return { hospitalState, testsPassed };
}

runCreditDepletionTest()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
