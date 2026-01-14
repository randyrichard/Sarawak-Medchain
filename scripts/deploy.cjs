const hre = require("hardhat");

async function main() {
  const [deployer, doctor1, doctor2, patient1] = await hre.ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await hre.ethers.provider.getBalance(deployer.address)).toString());

  // Deploy SarawakMedMVP
  const SarawakMedMVP = await hre.ethers.getContractFactory("SarawakMedMVP");
  const sarawakMed = await SarawakMedMVP.deploy();
  await sarawakMed.waitForDeployment();
  const medContractAddress = await sarawakMed.getAddress();

  console.log("\n========================================");
  console.log("SarawakMedMVP deployed to:", medContractAddress);
  console.log("========================================\n");

  // Deploy BillingHistory
  const BillingHistory = await hre.ethers.getContractFactory("BillingHistory");
  const billing = await BillingHistory.deploy();
  await billing.waitForDeployment();
  const billingAddress = await billing.getAddress();

  console.log("========================================");
  console.log("BillingHistory deployed to:", billingAddress);
  console.log("========================================\n");

  // Connect contracts: set billing address in SarawakMedMVP
  console.log("Connecting contracts...\n");
  const txConnect = await sarawakMed.setBillingContract(billingAddress);
  await txConnect.wait();
  console.log("✓ BillingHistory connected to SarawakMedMVP");

  // Add verified doctors
  console.log("\nAdding verified doctors for testing...\n");

  const tx1 = await sarawakMed.addVerifiedDoctor(doctor1.address);
  await tx1.wait();
  console.log("✓ Doctor 1 verified:", doctor1.address);

  const tx2 = await sarawakMed.addVerifiedDoctor(doctor2.address);
  await tx2.wait();
  console.log("✓ Doctor 2 verified:", doctor2.address);

  // Add initial credits to doctors/hospitals
  console.log("\nAdding initial credits to doctors...\n");

  const txCredit1 = await billing.addCredits(doctor1.address, 10);
  await txCredit1.wait();
  console.log("✓ Doctor 1 credited with 10 credits");

  const txCredit2 = await billing.addCredits(doctor2.address, 10);
  await txCredit2.wait();
  console.log("✓ Doctor 2 credited with 10 credits");

  console.log("\n========================================");
  console.log("Test Accounts (Import these into MetaMask):");
  console.log("========================================");
  console.log("Admin/Deployer:", deployer.address);
  console.log("Doctor 1 (Verified, 10 credits):", doctor1.address);
  console.log("Doctor 2 (Verified, 10 credits):", doctor2.address);
  console.log("Patient 1:", patient1.address);

  console.log("\n========================================");
  console.log("Contract Addresses:");
  console.log("========================================");
  console.log(`VITE_CONTRACT_ADDRESS=${medContractAddress}`);
  console.log(`VITE_BILLING_CONTRACT_ADDRESS=${billingAddress}`);
  console.log("\nDeployment complete!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
