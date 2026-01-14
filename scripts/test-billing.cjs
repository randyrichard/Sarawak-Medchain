const hre = require("hardhat");

async function main() {
  const billing = await hre.ethers.getContractAt('BillingHistory', '0x9A676e781A523b5d0C0e43731313A708CB607508');
  const med = await hre.ethers.getContractAt('SarawakMedMVP', '0x0DCd1Bf9A1b36cE34237eEaFef220932846BCD82');
  const [admin, doctor1] = await hre.ethers.getSigners();

  console.log('=== Testing Billing Integration ===\n');
  console.log('Doctor 1:', doctor1.address);

  const balanceBefore = await billing.getHospitalBalance(doctor1.address);
  console.log('Balance BEFORE writeRecord:', balanceBefore.toString(), 'credits');

  // Doctor writes a record
  console.log('\nDoctor writing a medical record...');
  const tx = await med.connect(doctor1).writeRecord(admin.address, 'QmTestHash123');
  await tx.wait();
  console.log('✓ Record written!');

  const balanceAfter = await billing.getHospitalBalance(doctor1.address);
  console.log('\nBalance AFTER writeRecord:', balanceAfter.toString(), 'credits');

  console.log('\n=== Result ===');
  console.log('Credits deducted:', (balanceBefore - balanceAfter).toString());
  console.log('Billing is working:', balanceBefore - balanceAfter === 1n ? '✓ YES' : '✗ NO');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
