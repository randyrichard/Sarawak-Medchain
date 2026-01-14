const hre = require("hardhat");

async function main() {
  const billing = await hre.ethers.getContractAt('BillingHistory', '0x59b670e9fA9D0A427751Af201D676719a970857b');

  console.log('=== All Hospital Balances ===\n');

  const balances = await billing.getAllHospitalBalances();

  console.log('Hospital Count:', balances.length);
  console.log('');

  let totalOwed = 0n;

  for (const item of balances) {
    const status = item.balance >= 0 ? 'credits' : 'OWES';
    console.log(`${item.hospital}: ${item.balance} ${status}`);
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
