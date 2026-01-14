const hre = require("hardhat");

async function main() {
  const billing = await hre.ethers.getContractAt('BillingHistory', '0x59b670e9fA9D0A427751Af201D676719a970857b');
  const med = await hre.ethers.getContractAt('SarawakMedMVP', '0xc6e7DF5E7b4f2A278906862b61205850344D4e7d');
  const [admin, doctor1, doctor2, patient1] = await hre.ethers.getSigners();

  console.log('=== Simulating Usage ===\n');

  // Doctor 1 writes 12 records (uses all 10 credits + goes 2 into debt)
  console.log('Doctor 1 writing 12 records...');
  for (let i = 0; i < 12; i++) {
    await med.connect(doctor1).writeRecord(patient1.address, `QmRecord${i}`);
  }
  console.log('✓ Doctor 1 wrote 12 records\n');

  // Doctor 2 writes 5 records (uses 5 of 10 credits)
  console.log('Doctor 2 writing 5 records...');
  for (let i = 0; i < 5; i++) {
    await med.connect(doctor2).writeRecord(patient1.address, `QmRecord${i}`);
  }
  console.log('✓ Doctor 2 wrote 5 records\n');

  // Show balances
  console.log('=== All Hospital Balances ===\n');
  const balances = await billing.getAllHospitalBalances();

  let totalOwed = 0n;

  for (const item of balances) {
    const status = item.balance >= 0 ? 'credits available' : 'OWES';
    const displayBalance = item.balance < 0 ? -item.balance : item.balance;
    console.log(`${item.hospital.slice(0,10)}...: ${displayBalance} ${status}`);
    if (item.balance < 0) {
      totalOwed += -item.balance;
    }
  }

  console.log('\n========================================');
  console.log('Total owed to you:', totalOwed.toString(), 'credits');
  console.log('========================================');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
