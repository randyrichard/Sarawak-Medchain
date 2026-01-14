const hre = require("hardhat");

async function main() {
  const billing = await hre.ethers.getContractAt('BillingHistory', '0xa513E6E4b8f2a923D98304ec87F64353C4D5C853');
  const med = await hre.ethers.getContractAt('SarawakMedMVP', '0x0165878A594ca255338adfa4d48449f69242Eb8F');

  console.log('=== Debug Billing Connection ===\n');

  // Check if billing contract is set in SarawakMedMVP
  const billingAddr = await med.billingContract();
  console.log('BillingContract set in SarawakMedMVP:', billingAddr);
  console.log('Expected BillingHistory address:', '0xa513E6E4b8f2a923D98304ec87F64353C4D5C853');
  console.log('Match:', billingAddr.toLowerCase() === '0xa513E6E4b8f2a923D98304ec87F64353C4D5C853'.toLowerCase() ? '✓ YES' : '✗ NO');

  // Check MC count
  const mcCount = await billing.getMCCount();
  console.log('\nTotal MCs issued:', mcCount.toString());

  // Check SarawakMedMVP contract balance (since it's the caller)
  const medBalance = await billing.getHospitalBalance(med.target);
  console.log('SarawakMedMVP contract balance:', medBalance.toString());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
